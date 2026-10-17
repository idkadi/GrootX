const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");
const crypto = require("crypto");

const OWNER_ID = "859803575995727872";
const CLAIM_TIME = 60_000;
const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const CODE_ATTEMPTS = 25;

const SEASONS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

function generateCode() {
  let code = "";

  // Match the six-character, lowercase codes used by normal drops.
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }

  return code;
}

function isCodeCollision(error, code) {
  return error?.code === 11000 && (
    Object.prototype.hasOwnProperty.call(error.keyPattern || {}, "code") ||
    error.keyValue?.code === code ||
    /index:\s*code_1\s+dup key/i.test(String(error.message || ""))
  );
}

async function saveCard(collections, ownedCard) {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = generateCode();

    const exists = await collections.findOne(
      { code },
      { projection: { _id: 1 } }
    );

    if (exists) continue;

    try {
      await collections.insertOne({ ...ownedCard, code });
      return code;
    } catch (error) {
      // Retry code collisions only; expose unrelated database failures.
      if (!isCodeCollision(error, code)) throw error;
    }
  }

  throw new Error("Could not allocate a unique six-character card code");
}

async function privateNotice(interaction, content) {
  const payload = {
    content,
    ephemeral: true,
    allowedMentions: { parse: [] }
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

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
      const data = {
        ...(typeof payload === "string" ? { content: payload } : payload),
        allowedMentions: { parse: [], repliedUser: false }
      };

      if (!slash) return message.reply(data);
      if (message.deferred) return message.editReply(data);
      if (message.replied) return message.followUp(data);

      return message.reply(data);
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
      ).trim().toLowerCase();

      const idArg = String(
        slash
          ? message.options.getInteger("id", true)
          : args[1] ?? ""
      ).trim();

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
      const cardName = String(card.name).slice(0, 150);
      const event = card.event || null;

      // Finish rendering before posting a giveaway with live controls.
      const buffer = await renderCard(
        { ...card, season },
        "?",
        { season, event }
      );

      const db = await connectDB();
      const collections = db.collection("collections");
      const serials = db.collection("serials");

      // This private component ID is separate from the owned card's code.
      const buttonId = `gdrop_${crypto.randomBytes(8).toString("hex")}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buttonId)
          .setLabel("Claim")
          .setEmoji("🎁")
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setColor(event === "halloween2026" ? 0xf28c28 : 0x57f287)
        .setTitle("🎁 Giveaway Drop")
        .setDescription(
          `${SEASONS[season]} **${cardName}**\n` +
          `Season ${season} • Card ID: ${cardId}` +
          (event === "halloween2026" ? "\n🎃 Halloween 26" : "") +
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

      let processing = false;
      let claimed = false;
      let expired = false;
      let assignedSerial = null;
      let claimedCode = null;
      let claimedPayload = null;

      // Attach the collector before sending the owner's confirmation.
      // A missing reply permission or a slow reply must not break claiming.
      const collector = giveaway.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: CLAIM_TIME,
        filter: interaction =>
          interaction.customId === buttonId && !interaction.user.bot
      });

      const expireGiveaway = () => giveaway.edit({
        content: "❌ Giveaway expired.",
        embeds: [
          EmbedBuilder.from(embed)
            .setTitle("🎁 Giveaway Expired")
            .setDescription(
              `${SEASONS[season]} **${cardName}**\nNobody claimed this card.`
            )
            .setFooter({
              text: "This giveaway has ended."
            })
        ],
        components: [],
        allowedMentions: { parse: [] }
      }).catch(error =>
        console.error("[GDROP] Expiry display:", error)
      );

      collector.on("collect", async interaction => {
        let locked = false;
        let displayUpdated = false;

        try {
          if (processing || claimed || expired) {
            return await privateNotice(
              interaction,
              "⏳ This giveaway is being claimed or has ended."
            );
          }

          // Lock before the first await so simultaneous clicks
          // cannot both award this giveaway.
          processing = true;
          locked = true;

          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate();
          }

          if (assignedSerial === null) {
            // Legacy S0 counters may omit season; never use those for S1.
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
                $setOnInsert: { cardId, season }
              },
              {
                upsert: true,
                returnDocument: "after"
              }
            );

            // MongoDB drivers can return a document or a value wrapper.
            const serialDoc = result?.serial != null
              ? result
              : result?.value;

            const serial = Number(serialDoc?.serial);

            if (!Number.isSafeInteger(serial) || serial < 1) {
              throw new Error("Serial allocation failed");
            }

            // Reuse the allocation if a failed claim is retried.
            assignedSerial = serial;
          }

          claimedCode = await saveCard(collections, {
            userId: interaction.user.id,
            cardId,
            season,
            serial: assignedSerial,
            tag: null,
            favorite: false,
            obtainedAt: new Date(),
            ...(event ? { event } : {})
          });

          // Once saved, display failures must never reopen the giveaway.
          claimed = true;

          row.components[0]
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Claimed");

          claimedPayload = {
            content:
              `🎉 <@${interaction.user.id}> claimed **${cardName}**\n` +
              `${SEASONS[season]} #${assignedSerial} • \`${claimedCode}\``,
            embeds: [
              EmbedBuilder.from(embed)
                .setTitle("🎁 Giveaway Claimed")
                .setDescription(
                  `${SEASONS[season]} **${cardName}**\n` +
                  `Season ${season} • Card ID: ${cardId}\n` +
                  `Serial: **#${assignedSerial}** • Code: \`${claimedCode}\``
                )
                .setFooter({
                  text: "Card saved to the winner's collection."
                })
            ],
            components: [row],
            allowedMentions: { parse: [] }
          };

          collector.stop("claimed");

          // Edit the giveaway directly, including when a router
          // has already acknowledged the button interaction.
          await giveaway.edit(claimedPayload);
          displayUpdated = true;
        } catch (error) {
          console.error("[GDROP] Claim:", error);

          if (!locked) return;

          await privateNotice(
            interaction,
            claimed
              ? `✅ Your card was saved: **${cardName}** ` +
                `#${assignedSerial} • \`${claimedCode}\`. Check your collection.`
              : expired
                ? "❌ Claim failed and this giveaway has expired."
                : "❌ Claim failed. Try again while the giveaway is active."
          ).catch(() => {});
        } finally {
          if (locked) {
            processing = false;

            if (claimed && !displayUpdated && claimedPayload) {
              await giveaway.edit(claimedPayload).catch(error =>
                console.error("[GDROP] Claim display retry:", error)
              );
            } else if (expired && !claimed) {
              await expireGiveaway();
            }
          }
        }
      });

      collector.on("end", async () => {
        expired = true;

        // Let a claim accepted before expiry finish its database work.
        if (processing || claimed) return;

        await expireGiveaway();
      });

      // Claiming is already live even if this confirmation fails.
      await reply(
        `✅ Posted the ${seasonArg.toUpperCase()} giveaway ` +
        `for card ID **${cardId}**.`
      ).catch(error =>
        console.error("[GDROP] Confirmation:", error)
      );
    } catch (error) {
      console.error("[GDROP]", error);

      await reply(
        "❌ Could not create the giveaway. " +
        "Check the image/frame files, channel permissions, and bot logs."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;