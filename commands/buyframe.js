const fs = require("fs");
const path = require("path");
const { randomInt } = require("crypto");

const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const frames = require("../data/frames");

const money = value =>
  Number(value || 0).toLocaleString();

const emojis = {
  coins: "<:grootcoin:1504742213110861834>",
  chips: "<:chipslogo:1519287944421048320>"
};

async function uniqueCode(collection) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Array.from(
      { length: 6 },
      () => chars[randomInt(chars.length)]
    ).join("");

    if (!await collection.findOne({ code })) {
      return code;
    }
  }

  throw new Error("Could not generate a frame code.");
}

module.exports = {
  name: "buyframe",
  aliases: ["framebuy", "framestore", "frames"],

  data: new SlashCommandBuilder()
    .setName("buyframe")
    .setDescription("Browse and buy custom card frames."),

  async execute(message) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const userId = (
      slash ? message.user : message.author
    ).id;

    const reply = payload =>
      slash
        ? message.editReply(payload)
        : message.reply(payload);

    let msg;

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      if (!Array.isArray(frames) || !frames.length) {
        return await reply({
          content: "❌ No frames are available right now."
        });
      }

      const db = await connectDB();
      const balances = db.collection("balances");
      const inventory = db.collection("frameInventory");

      let index = 0;
      let pending = null;
      let busy = false;
      let finished = false;

      const clear = content => ({
        content,
        embeds: [],
        attachments: [],
        components: [],
        allowedMentions: { parse: [] }
      });

      const button = (id, label, style) =>
        new ButtonBuilder()
          .setCustomId(`frame_${id}`)
          .setLabel(label)
          .setStyle(style);

      function storePayload() {
        const frame = frames[index];

        const valid =
          frame.id != null &&
          Object.hasOwn(emojis, frame.currency) &&
          typeof frame.price === "number" &&
          Number.isSafeInteger(frame.price) &&
          frame.price >= 0;

        const embed = new EmbedBuilder()
          .setColor(0x8b5cf6)
          .setTitle("🖼️ Frame Store")
          .setDescription(
            `**${String(frame.name || "Unnamed frame").slice(0, 150)}**\n\n` +
            `Frame ID: **${frame.id}**\n` +
            (
              valid
                ? `Price: ${emojis[frame.currency]} **${money(frame.price)} ${frame.currency}**\n\n`
                : "⚠️ This frame is unavailable for purchase.\n\n"
            ) +
            "Buying gives you a unique 6-character frame code.\n" +
            "Apply it using `!putframe cardcode framecode`.\n" +
            "Once applied, the updated card renderer shows it on card previews, albums and trades."
          )
          .setFooter({
            text: `Frame ${index + 1}/${frames.length}`
          });

        const files = [];

        const imagePath =
          typeof frame.image === "string"
            ? path.resolve(__dirname, "..", frame.image)
            : null;

        const available =
          imagePath && fs.existsSync(imagePath);

        if (available) {
          const name =
            `frame-preview${path.extname(imagePath) || ".png"}`;

          files.push(
            new AttachmentBuilder(imagePath, { name })
          );

          embed.setImage(`attachment://${name}`);
        } else {
          embed.addFields({
            name: "Preview",
            value: "Frame image unavailable."
          });
        }

        const row = new ActionRowBuilder().addComponents(
          button(
            "prev5",
            "⏪ -5",
            ButtonStyle.Secondary
          ),
          button(
            "prev",
            "⬅️",
            ButtonStyle.Primary
          ),
          button(
            "buy",
            "🛒 Buy",
            ButtonStyle.Success
          ).setDisabled(!valid || !available),
          button(
            "next",
            "➡️",
            ButtonStyle.Primary
          ),
          button(
            "next5",
            "+5 ⏩",
            ButtonStyle.Secondary
          )
        );

        return {
          content: null,
          embeds: [embed],
          attachments: [],
          files,
          components: [row],
          allowedMentions: { parse: [] }
        };
      }

      msg = await reply(storePayload());

      const collector =
        msg.createMessageComponentCollector({
          time: 120000
        });

      collector.on("collect", async interaction => {
        let acquired = false;

        try {
          if (interaction.user.id !== userId) {
            return await interaction.reply({
              content:
                "❌ Open your own frame store to use these buttons.",
              ephemeral: true
            });
          }

          if (busy || finished) {
            return await interaction.reply({
              content:
                "This purchase is already being handled.",
              ephemeral: true
            });
          }

          busy = true;
          acquired = true;

          await interaction.deferUpdate();

          const action = interaction.customId;

          const steps = {
            frame_prev5: -5,
            frame_prev: -1,
            frame_next: 1,
            frame_next5: 5
          };

          if (Object.hasOwn(steps, action) && !pending) {
            index =
              (
                (index + steps[action]) % frames.length +
                frames.length
              ) % frames.length;

            await interaction.editReply(storePayload());
          } else if (
            action === "frame_buy" &&
            !pending
          ) {
            const frame = frames[index];

            if (
              !Object.hasOwn(emojis, frame.currency) ||
              !Number.isSafeInteger(frame.price) ||
              frame.price < 0 ||
              frame.id == null
            ) {
              throw new Error(
                "Invalid frame configuration."
              );
            }

            pending = { ...frame };

            await interaction.editReply({
              ...clear(
                `Buy **${pending.name}** for ` +
                `${emojis[pending.currency]} ` +
                `**${money(pending.price)} ${pending.currency}**?`
              ),
              components: [
                new ActionRowBuilder().addComponents(
                  button(
                    "confirm",
                    "✅ Confirm Buy",
                    ButtonStyle.Success
                  ),
                  button(
                    "cancel",
                    "❌ Cancel",
                    ButtonStyle.Danger
                  )
                )
              ]
            });
          } else if (
            action === "frame_cancel" &&
            pending
          ) {
            pending = null;

            await interaction.editReply(storePayload());
          } else if (
            action === "frame_confirm" &&
            pending
          ) {
            const frame = pending;

            finished = true;
            collector.stop("purchase");

            await interaction.editReply(
              clear("⏳ Processing your frame purchase…")
            );

            const code = await uniqueCode(inventory);

            const balance =
              await balances.findOne({ userId }) || {};

            // Deduct from the existing chip field.
            const field =
              frame.currency === "coins"
                ? "coins"
                : [
                    "ultronChips",
                    "ultronchips",
                    "chips"
                  ].find(key => balance[key] != null) ||
                  "ultronChips";

            // Check and deduct in one atomic update.
            const debit = await balances.updateOne(
              {
                userId,
                [field]: { $gte: frame.price }
              },
              {
                $inc: { [field]: -frame.price }
              }
            );

            if (!debit.matchedCount) {
              return await interaction.editReply(
                clear(
                  `❌ You need ${emojis[frame.currency]} ` +
                  `**${money(frame.price)} ${frame.currency}**.\n` +
                  `Your balance is **${money(balance[field])}**.`
                )
              );
            }

            try {
              await inventory.insertOne({
                userId,
                code,
                frameId: frame.id,
                used: false,
                purchasedAt: Date.now()
              });
            } catch (error) {
              // Check whether an uncertain insert succeeded
              // before refunding the purchase.
              const inserted = await inventory.findOne({
                userId,
                code,
                frameId: frame.id
              });

              if (!inserted) {
                await balances.updateOne(
                  { userId },
                  {
                    $inc: { [field]: frame.price }
                  }
                );

                throw error;
              }
            }

            await interaction.editReply(
              clear(
                `✅ You bought **${frame.name}**!\n\n` +
                `Your frame code: \`${code}\`\n` +
                `Apply it using \`!putframe cardcode ${code}\`.`
              )
            );
          }
        } catch (error) {
          console.error("[buyframe] Button:", error);

          finished = true;
          collector.stop("error");

          const payload = clear(
            "❌ Could not complete this action. " +
            "Check your frame inventory and balance before retrying."
          );

          if (
            interaction.deferred ||
            interaction.replied
          ) {
            await interaction
              .editReply(payload)
              .catch(() => {});
          } else {
            await interaction
              .reply({
                ...payload,
                ephemeral: true
              })
              .catch(() => {});
          }
        } finally {
          if (acquired) {
            busy = false;

            if (finished) {
              await msg
                .edit({ components: [] })
                .catch(() => {});
            }
          }
        }
      });

      collector.on("end", async (_, reason) => {
        if (
          reason === "purchase" ||
          reason === "error"
        ) {
          return;
        }

        finished = true;

        // An in-progress button handler removes the buttons
        // after completing its own edit.
        if (!busy) {
          await msg
            .edit({ components: [] })
            .catch(() => {});
        }
      });
    } catch (error) {
      console.error("[buyframe]", error);

      const payload = {
        content: "❌ Could not open the frame store.",
        components: []
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