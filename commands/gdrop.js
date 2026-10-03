const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");
const crypto = require("crypto");

const OWNER_ID = "859803575995727872";

const SEASONS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

module.exports = {
  name: "gdrop",
  aliases: ["giveawaydrop"],

  data: new SlashCommandBuilder()
    .setName("gdrop")
    .setDescription("Owner only: create a giveaway by season and card ID.")
    .addStringOption(option =>
      option
        .setName("season")
        .setDescription("Card season")
        .setRequired(true)
        .addChoices(
          { name: "S0", value: "s0" },
          { name: "S1", value: "s1" }
        )
    )
    .addIntegerOption(option =>
      option
        .setName("id")
        .setDescription("Card catalog ID")
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

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      if (!slash) return message.reply(payload);
      if (message.deferred) return message.editReply(payload);
      if (message.replied) return message.followUp(payload);
      return message.reply(payload);
    };

    try {
      if (user.id !== OWNER_ID) {
        return await reply("❌ Owner only command.");
      }

      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      const seasonArg = String(
        slash
          ? message.options.getString("season", true)
          : args[0] || ""
      ).toLowerCase();

      const idArg = slash
        ? String(message.options.getInteger("id", true))
        : String(args[1] || "");

      if (
        !["s0", "s1"].includes(seasonArg) ||
        !/^\d+$/.test(idArg) ||
        (!slash && args.length !== 2)
      ) {
        return await reply(
          "❌ Usage: `!gdrop s0 <id>` or `!gdrop s1 <id>`\n" +
          "Slash: `/gdrop season:s1 id:123`"
        );
      }

      if (!message.channel?.send) {
        return await reply("❌ Use this command in a text channel.");
      }

      const season = seasonArg === "s1" ? 1 : 0;
      const cardId = Number(idArg);

      if (!Number.isSafeInteger(cardId)) {
        return await reply("❌ Invalid card ID.");
      }

      const matches = (season ? cards1 : cards0).filter(
        card => Number(card.id) === cardId
      );

      if (matches.length !== 1) {
        return await reply(
          matches.length
            ? "❌ This ID has multiple catalog entries. Give each variant a unique ID first."
            : `❌ Card ID not found in ${seasonArg.toUpperCase()}.`
        );
      }

      const card = matches[0];
      const event = card.event || null;

      // Render before posting so missing art or frames cannot
      // create a broken giveaway.
      const buffer = await renderCard(
        { ...card, season },
        "?",
        { season, event }
      );

      const db = await connectDB();
      const collections = db.collection("collections");
      const serials = db.collection("serials");

      const buttonId =
        `gdrop_${crypto.randomBytes(8).toString("hex")}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId)
          .setLabel("Claim")
          .setEmoji("🎁")
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setColor(
          event === "halloween2026" ? 0xf28c28 : 0x57f287
        )
        .setTitle("🎁 Giveaway Drop")
        .setDescription(
          `${SEASONS[season]} **${String(card.name).slice(0, 150)}**\n` +
          `Season ${season} • Card ID: ${cardId}` +
          (event === "halloween2026"
            ? "\n🎃 Halloween 26"
            : "") +
          "\n\nClick below to claim!"
        )
        .setImage("attachment://giveaway.png")
        .setFooter({
          text: "First successful claim wins • Expires in 60 seconds"
        });

      const giveaway = await message.channel.send({
        embeds: [embed],
        files: [
          new AttachmentBuilder(buffer, {
            name: "giveaway.png"
          })
        ],
        components: [row],
        allowedMentions: { parse: [] }
      });

      await reply(
        `✅ Posted the ${seasonArg.toUpperCase()} giveaway ` +
        `for card ID **${cardId}**.`
      );

      let processing = false;
      let claimed = false;
      let expired = false;

      const collector =
        giveaway.createMessageComponentCollector({
          time: 60000,
          filter: interaction =>
            interaction.customId === buttonId
        });

      collector.on("collect", async interaction => {
        let locked = false;

        try {
          if (processing || claimed || expired) {
            return await interaction.reply({
              content:
                "⏳ This giveaway is being claimed or has ended.",
              ephemeral: true
            });
          }

          processing = true;
          locked = true;

          // Acknowledge before database work.
          await interaction.deferUpdate();

          // S0 includes legacy counters without a season.
          // S1 uses its own season-specific counter.
          const serialFilter = season === 0
            ? {
                cardId,
                $or: [
                  { season: 0 },
                  { season: { $exists: false } }
                ]
              }
            : {
                cardId,
                season: 1
              };

          const result = await serials.findOneAndUpdate(
            serialFilter,
            {
              $inc: { serial: 1 },
              $setOnInsert: {
                cardId,
                season
              }
            },
            {
              upsert: true,
              returnDocument: "after"
            }
          );

          // Supports MongoDB drivers returning either
          // the document directly or a result.value wrapper.
          const serialDoc = result?.serial != null
            ? result
            : result?.value;

          if (!serialDoc?.serial) {
            throw new Error("Serial allocation failed");
          }

          let code;
          let inserted = false;

          for (let attempt = 0; attempt < 10; attempt++) {
            code = crypto.randomBytes(4).toString("hex");

            const exists = await collections.findOne(
              { code },
              { projection: { _id: 1 } }
            );

            if (exists) continue;

            try {
              await collections.insertOne({
                userId: interaction.user.id,
                cardId,
                season,
                serial: serialDoc.serial,
                code,
                tag: null,
                favorite: false,
                obtainedAt: new Date(),
                ...(event ? { event } : {})
              });

              inserted = true;
              break;
            } catch (error) {
              if (error.code !== 11000) throw error;
            }
          }

          if (!inserted) {
            throw new Error("Could not allocate a unique card code");
          }

          claimed = true;

          row.components[0]
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Claimed");

          collector.stop("claimed");

          await interaction.editReply({
            content:
              `🎉 <@${interaction.user.id}> claimed ` +
              `**${String(card.name).slice(0, 150)}**\n` +
              `${SEASONS[season]} #${serialDoc.serial} • \`${code}\``,
            components: [row],
            allowedMentions: { parse: [] }
          });
        } catch (error) {
          console.error("[GDROP] Claim:", error);

          const notice = {
            content: claimed
              ? "✅ Your card was saved, but the giveaway display could not update. Check your collection."
              : "❌ Claim failed. Try again if the giveaway is still active.",
            ephemeral: true
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(notice).catch(() => {});
          } else {
            await interaction.reply(notice).catch(() => {});
          }
        } finally {
          if (locked) processing = false;

          if (expired && !claimed) {
            await giveaway.edit({
              content: "❌ Giveaway expired.",
              components: []
            }).catch(() => {});
          }

          if (claimed) {
            await giveaway.edit({
              components: [row]
            }).catch(() => {});
          }
        }
      });

      collector.on("end", async () => {
        expired = true;

        if (processing || claimed) return;

        await giveaway.edit({
          content: "❌ Giveaway expired.",
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      console.error("[GDROP]", error);

      await reply(
        "❌ Could not create the giveaway. " +
        "Check the image/frame files and bot logs."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;