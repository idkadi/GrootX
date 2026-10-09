const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const backgrounds = require("../data/backgrounds.js");

function buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("bg_prev")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("bg_select")
      .setLabel("Select")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("bg_next")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
  );
}

function ownsBackground(user, bg) {
  return (
    bg.free === true ||
    Number(bg.id) === 0 ||
    (
      Array.isArray(user?.backgrounds) &&
      user.backgrounds.some(
        id => String(id) === String(bg.id)
      )
    )
  );
}

function preview(
  bg,
  album,
  page,
  index,
  total,
  selected = false
) {
  const embed = new EmbedBuilder()
    .setColor(selected ? 0x00ff99 : 0x00aeff)
    .setTitle(
      selected
        ? "✅ Background Selected"
        : "🖼️ Choose Album Background"
    )
    .setDescription(
      `Album: **${album}**\nPage: **${page}**\n\n` +
      (
        selected
          ? `Selected Background:\n**${bg.name}**`
          : `Background **${index + 1}/${total}**\n` +
            `**${bg.name}**\n\n` +
            "Use ⬅️ ➡️ to browse. Press ✅ to select."
      )
    )
    .setImage(`attachment://${bg.file}`);

  return {
    embeds: [embed],

    files: [
      new AttachmentBuilder(
        path.join(
          __dirname,
          "../images/backgrounds",
          bg.file
        ),
        { name: bg.file }
      )
    ],

    components: selected ? [] : [buttons()],

    allowedMentions: {
      parse: [],
      repliedUser: false
    }
  };
}

module.exports = {
  name: "setbg",
  aliases: ["background", "setbackground"],

  data: new SlashCommandBuilder()
    .setName("setbg")
    .setDescription(
      "Choose an owned background for an album page."
    )
    .addStringOption(option =>
      option
        .setName("album")
        .setDescription("Album name")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("page")
        .setDescription("Page number")
        .setMinValue(1)
        .setRequired(true)
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;

    const reply = payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      return slash
        ? message.editReply(payload)
        : message.reply(payload);
    };

    try {
      if (
        slash &&
        !message.deferred &&
        !message.replied
      ) {
        await message.deferReply();
      }

      const albumName = (
        slash
          ? message.options.getString("album", true)
          : args.slice(0, -1).join(" ")
      ).trim();

      const pageNumber = slash
        ? message.options.getInteger("page", true)
        : Number(args[args.length - 1]);

      if (
        !albumName ||
        !Number.isSafeInteger(pageNumber) ||
        pageNumber < 1
      ) {
        return await reply(
          "❌ Use: `!setbg <album name> <page number>` " +
          "with a positive whole page number."
        );
      }

      const db = await connectDB();
      const albums = db.collection("albums");
      const users = db.collection("users");

      const escaped = albumName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const album = await albums.findOne({
        userId: user.id,
        name: {
          $regex: `^${escaped}$`,
          $options: "i"
        }
      });

      if (!album) {
        return await reply("❌ Album not found.");
      }

      if (!album.pages?.[pageNumber - 1]) {
        return await reply(
          "❌ That page does not exist."
        );
      }

      const userDoc = await users.findOne({
        userId: user.id
      });

      const owned = backgrounds.filter(
        bg => ownsBackground(userDoc, bg)
      );

      if (!owned.length) {
        return await reply(
          "❌ You don't own any backgrounds."
        );
      }

      let index = Math.max(
        0,
        owned.findIndex(bg =>
          Number(bg.id) ===
          Number(
            album.pages[pageNumber - 1].background ?? 0
          )
        )
      );

      const msg = await reply(
        preview(
          owned[index],
          album.name,
          pageNumber,
          index,
          owned.length
        )
      );

      const collector =
        msg.createMessageComponentCollector({
          time: 60000
        });

      let busy = false;

      collector.on("collect", async interaction => {
        if (
          !["bg_prev", "bg_next", "bg_select"].includes(
            interaction.customId
          )
        ) {
          return;
        }

        if (interaction.user.id !== user.id) {
          return interaction.reply({
            content: "❌ This menu is not for you.",
            ephemeral: true
          }).catch(() => {});
        }

        try {
          // Acknowledge before database access or file uploads.
          await interaction.deferUpdate();
        } catch (error) {
          console.error(
            "[setbg] Button acknowledgement:",
            error
          );
          return;
        }

        if (busy || collector.ended) return;
        busy = true;

        try {
          if (interaction.customId === "bg_select") {
            const selected = owned[index];

            // Verify ownership again at selection time.
            const currentUser = await users.findOne({
              userId: user.id
            });

            if (!ownsBackground(currentUser, selected)) {
              return await interaction.followUp({
                content:
                  "❌ You no longer own this background.",
                ephemeral: true
              });
            }

            const pagePath =
              `pages.${pageNumber - 1}`;

            // Change only background fields.
            // Preserve placed cards and other album pages.
            const result = await albums.updateOne(
              {
                _id: album._id,
                userId: user.id,
                [pagePath]: {
                  $type: "object"
                }
              },
              {
                $set: {
                  [`${pagePath}.background`]:
                    selected.id,

                  [`${pagePath}.backgroundFile`]:
                    selected.file
                }
              }
            );

            if (!result.matchedCount) {
              await msg.edit({
                content:
                  "❌ Album or page no longer exists.",
                embeds: [],
                attachments: [],
                components: []
              });

              collector.stop("missing");
              return;
            }

            await msg.edit({
              content: null,
              attachments: [],

              ...preview(
                selected,
                album.name,
                pageNumber,
                index,
                owned.length,
                true
              )
            });

            collector.stop("selected");
            return;
          }

          index = (
            index +
            (
              interaction.customId === "bg_next"
                ? 1
                : -1
            ) +
            owned.length
          ) % owned.length;

          await msg.edit({
            content: null,
            attachments: [],

            ...preview(
              owned[index],
              album.name,
              pageNumber,
              index,
              owned.length
            )
          });
        } catch (error) {
          console.error(
            "[setbg] Menu update:",
            error
          );

          await interaction.followUp({
            content:
              "❌ Could not update the background menu. " +
              "Please try again.",
            ephemeral: true
          }).catch(() => {});
        } finally {
          busy = false;
        }
      });

      collector.on("end", async () => {
        await msg.edit({
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      console.error("[setbg]", error);

      const payload = {
        content:
          "❌ Could not load backgrounds. " +
          "Please check the bot logs and try again."
      };

      if (
        slash &&
        !message.deferred &&
        !message.replied
      ) {
        await message.reply(payload).catch(() => {});
      } else {
        await reply(payload).catch(() => {});
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;