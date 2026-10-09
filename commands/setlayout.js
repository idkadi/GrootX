const path = require("path");
const fs = require("fs");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

const layouts = [
  { id: 1, name: "1 Card Center" },
  { id: 2, name: "2 Cards Side by Side" },
  { id: 3, name: "3 Cards Row" },
  { id: 4, name: "4 Cards Grid" },
  { id: 5, name: "5 Cards Showcase" },
  { id: 6, name: "6 Cards Grid" },
  { id: 7, name: "7 Cards Showcase" },
  { id: 8, name: "8 Cards Full Page" }
];

function buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("layout_prev")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("layout_select")
      .setLabel("Select")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("layout_next")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
  );
}

function preview(
  layout,
  album,
  page,
  index,
  total,
  selected = false
) {
  const fileName = `layout${layout.id}.png`;

  const embed = new EmbedBuilder()
    .setColor(selected ? 0x00ff99 : 0x00aeff)
    .setTitle(
      selected
        ? "✅ Layout Selected"
        : "📖 Choose Album Layout"
    )
    .setDescription(
      `Album: **${album}**\nPage: **${page}**\n\n` +
      (
        selected
          ? `Selected Layout:\n**${layout.name}**`
          : `Layout **${index + 1}/${total}**\n` +
            `**${layout.name}**\n\n` +
            "Use ⬅️ ➡️ to browse. Press ✅ to select.\n" +
            "Cards stay in their slot numbers."
      )
    )
    .setImage(`attachment://${fileName}`);

  return {
    embeds: [embed],

    files: [
      new AttachmentBuilder(
        path.join(
          __dirname,
          "../images/layouts",
          fileName
        ),
        { name: fileName }
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
  name: "setlayout",
  aliases: ["layout"],

  data: new SlashCommandBuilder()
    .setName("setlayout")
    .setDescription("Choose a layout for an album page.")
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
          "❌ Use: `!setlayout <album name> <page number>` " +
          "with a positive whole page number."
        );
      }

      const db = await connectDB();
      const albums = db.collection("albums");

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

      const slotsData = JSON.parse(
        fs.readFileSync(
          path.join(
            __dirname,
            "../data/layouts/slots.json"
          ),
          "utf8"
        )
      );

      const available = layouts.filter(layout =>
        Array.isArray(slotsData[String(layout.id)])
      );

      if (!available.length) {
        return await reply(
          "❌ No layout positions are available."
        );
      }

      let index = Math.max(
        0,
        available.findIndex(layout =>
          Number(layout.id) ===
          Number(album.pages[pageNumber - 1].layout)
        )
      );

      const msg = await reply(
        preview(
          available[index],
          album.name,
          pageNumber,
          index,
          available.length
        )
      );

      const collector =
        msg.createMessageComponentCollector({
          time: 60000
        });

      let busy = false;

      collector.on("collect", async interaction => {
        if (
          ![
            "layout_prev",
            "layout_next",
            "layout_select"
          ].includes(interaction.customId)
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
          await interaction.deferUpdate();
        } catch (error) {
          console.error(
            "[setlayout] Button acknowledgement:",
            error
          );
          return;
        }

        if (busy || collector.ended) return;
        busy = true;

        try {
          if (
            interaction.customId === "layout_select"
          ) {
            const selected = available[index];

            const freshAlbum = await albums.findOne({
              _id: album._id,
              userId: user.id
            });

            const freshPage =
              freshAlbum?.pages?.[pageNumber - 1];

            if (!freshPage) {
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

            const slots = freshPage.slots || [];

            const capacity =
              slotsData[String(selected.id)].length;

            const overflow = Object.keys(slots).filter(
              key =>
                /^\d+$/.test(key) &&
                Number(key) >= capacity &&
                slots[key]
            );

            if (overflow.length) {
              const occupiedSlots = overflow
                .map(key => Number(key) + 1)
                .join(", ");

              return await interaction.followUp({
                content:
                  `❌ This layout has ${capacity} slots. ` +
                  "Move or displace cards from slots " +
                  `${occupiedSlots} first.`,
                ephemeral: true
              });
            }

            const pagePath =
              `pages.${pageNumber - 1}`;

            const query = {
              _id: album._id,
              userId: user.id,
              [pagePath]: {
                $type: "object"
              }
            };

            // Retry if placements or layout changed during selection.
            query[`${pagePath}.slots`] =
              freshPage.slots === undefined
                ? { $exists: false }
                : freshPage.slots;

            query[`${pagePath}.layout`] =
              freshPage.layout === undefined
                ? { $exists: false }
                : freshPage.layout;

            // Change only the layout; retain cards and background.
            const result = await albums.updateOne(
              query,
              {
                $set: {
                  [`${pagePath}.layout`]: selected.id
                }
              }
            );

            if (!result.matchedCount) {
              await msg.edit({
                content:
                  "❌ Page changed while selecting. " +
                  "Run setlayout again.",
                embeds: [],
                attachments: [],
                components: []
              });

              collector.stop("changed");
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
                available.length,
                true
              )
            });

            collector.stop("selected");
            return;
          }

          index = (
            index +
            (
              interaction.customId === "layout_next"
                ? 1
                : -1
            ) +
            available.length
          ) % available.length;

          await msg.edit({
            content: null,
            attachments: [],

            ...preview(
              available[index],
              album.name,
              pageNumber,
              index,
              available.length
            )
          });
        } catch (error) {
          console.error(
            "[setlayout] Menu update:",
            error
          );

          await interaction.followUp({
            content:
              "❌ Could not update the layout menu. " +
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
      console.error("[setlayout]", error);

      const payload = {
        content:
          "❌ Could not load layouts. " +
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