const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  AttachmentBuilder,
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const SEASONS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const TIERS = {
  common: ["<:common:1504510702956839033>", 0xcd7f32],
  uncommon: ["<:uncommon:1504510929210052698>", 0xc0c0c0],
  rare: ["<:rare:1504510606718275764>", 0xffd700],
  epic: ["<:epic:1504510771214680175>", 0x8000ff],
  legendary: ["<:legendary:1504511435974377552>", 0xe53935]
};

const eventKey = value =>
  String(value || "").trim().toLowerCase();

const limit = (value, length = 1024) =>
  String(value ?? "Unknown").slice(0, length) || "Unknown";

module.exports = {
  name: "view",
  aliases: ["v"],

  data: new SlashCommandBuilder()
    .setName("view")
    .setDescription("View a collected card, or your latest card.")
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription(
          "Card code; omit to view your latest collected card"
        )
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
      // Acknowledge before database queries or image rendering.
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      const code = String(
        slash
          ? message.options.getString("code") || ""
          : args[0] || ""
      ).trim().toLowerCase();

      const db = await connectDB();
      const collections = db.collection("collections");

      // Explicit codes remain public, as in the original command.
      const owned = code
        ? await collections.findOne({ code })
        : await collections.findOne(
            { userId: user.id },
            { sort: { _id: -1 } }
          );

      if (!owned) {
        return await reply(
          code
            ? "❌ Card not found."
            : "❌ Your collection is empty."
        );
      }

      const value = String(
        owned.season ?? owned.cardSeason ?? 0
      ).toLowerCase();

      if (!["0", "s0", "1", "s1"].includes(value)) {
        return await reply(
          "❌ This card has an unsupported season. " +
          "Please report its code to the bot owner."
        );
      }

      const season =
        value === "1" || value === "s1" ? 1 : 0;

      const catalog =
        season === 1 ? season1Cards : season0Cards;

      const candidates = catalog.filter(card =>
        card.id != null &&
        owned.cardId != null &&
        String(card.id) === String(owned.cardId)
      );

      const ownedEvent = eventKey(owned.event);

      // Match the event as well as the season and card ID.
      let card = candidates.find(
        entry => eventKey(entry.event) === ownedEvent
      );

      // Recover older event records without a flag only
      // when the catalog ID has exactly one match.
      if (!card && !ownedEvent && candidates.length === 1) {
        card = candidates[0];
      }

      if (!card) {
        return await reply(
          `❌ ${SEASONS[season]} Season ${season} card data ` +
          `${
            candidates.length > 1
              ? "is ambiguous"
              : "was not found"
          }. Please report code \`${owned.code}\`.`
        );
      }

      if (!card.rawImage) {
        return await reply(
          "❌ This card's raw image is missing from its catalog entry. " +
          "Please report its code to the bot owner."
        );
      }

      const event = owned.event || card.event || null;
      const halloween = eventKey(event) === "halloween2026";

      const tag = await db.collection("cardtags").findOne({
        userId: owned.userId,
        code: owned.code
      });

      const serial = owned.serial ?? "?";

      // Catalog supplies the correct artwork.
      // Ownership supplies the equipped frame and serial.
      const buffer = await renderCard(
        {
          ...card,
          season,
          event
        },
        serial,
        {
          ...owned,
          season,
          event
        }
      );

      const imageName = "view-card.png";

      const attachment = new AttachmentBuilder(buffer, {
        name: imageName
      });

      const tier = String(card.tier || "").toLowerCase();

      const [tierEmoji, color] = TIERS[tier] || [
        halloween ? "🎃" : "🎴",
        0xf28c28
      ];

      // Matches the frame priority in the updated renderer.
      const frame = season === 0
        ? "Season 0 tier style"
        : halloween
          ? "🎃 Halloween 2026"
          : owned.frameId
            ? `Custom frame #${owned.frameId}`
            : `${limit(card.tier, 50)} default`;

      const embed = new EmbedBuilder()
        .setColor(halloween ? 0xf28c28 : color)
        .setTitle(
          limit(
            `${SEASONS[season]} ${tierEmoji} ` +
            `${card.name || "Unknown Card"}`,
            256
          )
        )
        .addFields(
          {
            name: "🆔 Code",
            value: limit(`\`${owned.code}\``),
            inline: true
          },
          {
            name: "🎴 Serial",
            value: limit(`#${serial}`),
            inline: true
          },
          {
            name: "🗓️ Season",
            value: `${SEASONS[season]} Season ${season}`,
            inline: true
          },
          {
            name: "🏷️ Tag",
            value: tag
              ? limit(
                  `${tag.emoji || "🏷️"} ${tag.tagName || ""}`
                )
              : "No Tag",
            inline: true
          },
          {
            name: "⭐ Favorite",
            value: owned.favorite ? "Yes" : "No",
            inline: true
          },
          {
            name: "🖼️ Frame",
            value: limit(frame),
            inline: true
          },
          {
            name: "👤 Claimed By",
            value: limit(`<@${owned.userId}>`),
            inline: true
          },
          {
            name: "🎬 Appearance",
            value: limit(
              card.appearance || card.show || "Unknown"
            )
          }
        )
        .setImage(`attachment://${imageName}`)
        .setFooter({
          text: limit(
            `Season ${season} • Card ID: ${card.id}`,
            2048
          )
        })
        .setTimestamp();

      if (event) {
        embed.addFields({
          name: "🎉 Event",
          value: halloween
            ? "🎃 Halloween 2026"
            : limit(event),
          inline: true
        });
      }

      return await reply({
        embeds: [embed],
        files: [attachment]
      });
    } catch (error) {
      console.error("[VIEW]", error);

      try {
        return await reply(
          "❌ Could not display this card. " +
          "Please check the bot logs for missing image/frame files " +
          "and try again."
        );
      } catch (replyError) {
        console.error("[VIEW] Reply failed:", replyError);
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;