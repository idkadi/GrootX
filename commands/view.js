const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  AttachmentBuilder,
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

function getTierEmoji(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "common":
      return "<:common:1504510702956839033>";

    case "uncommon":
      return "<:uncommon:1504510929210052698>";

    case "rare":
      return "<:rare:1504510606718275764>";

    case "epic":
      return "<:epic:1504510771214680175>";

    case "legendary":
      return "<:legendary:1504511435974377552>";

    default:
      return "❓";
  }
}

function getColor(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "common":
      return 0xcd7f32;

    case "uncommon":
      return 0xc0c0c0;

    case "rare":
      return 0xffd700;

    case "epic":
      return 0x8000ff;

    case "legendary":
      return 0xe53935;

    default:
      return 0xffffff;
  }
}

function getSeasonEmoji(season) {
  return Number(season) === 1
    ? "1️⃣"
    : "0️⃣";
}

function getSeasonDatabase(season) {
  return Number(season) === 1
    ? season1Cards
    : season0Cards;
}

module.exports = {
  name: "view",
  aliases: ["v"],

  async execute(message, args) {
    const db = await connectDB();

    const collectionsCol =
      db.collection("collections");

    const cardTagsCol =
      db.collection("cardtags");

    let searchCode;

    // ==========================================
    // FIND CARD
    // ==========================================

    // If no code is provided,
    // view the user's latest claimed card.
    if (!args[0]) {
      const latestCard = await collectionsCol
        .find({
          userId: message.author.id
        })
        .sort({
          _id: -1
        })
        .limit(1)
        .next();

      if (!latestCard) {
        return message.reply(
          "❌ Your collection is empty."
        );
      }

      searchCode = String(
        latestCard.code
      ).toLowerCase();
    } else {
      searchCode = String(
        args[0]
      ).toLowerCase();
    }

    const foundCard =
      await collectionsCol.findOne({
        code: searchCode
      });

    if (!foundCard) {
      return message.reply(
        "❌ Card not found."
      );
    }

    // ==========================================
    // SEASON
    // ==========================================

    /*
     * Existing cards created before the season
     * system may not have a season field.
     *
     * They automatically count as Season 0.
     */
    const season = Number(
      foundCard.season ?? 0
    );

    const seasonEmoji =
      getSeasonEmoji(season);

    /*
     * S0 -> data/cards.js
     * S1 -> data/season1.js
     */
    const activeCardDatabase =
      getSeasonDatabase(season);

    // IMPORTANT:
    // We only search inside the database belonging
    // to this owned card's season.
    const card =
      activeCardDatabase.find(
        currentCard =>
          Number(currentCard.id) ===
          Number(foundCard.cardId)
      );

    if (!card) {
      return message.reply(
        `❌ ${seasonEmoji} Season ${season} card data not found.`
      );
    }

    // ==========================================
    // OWNER
    // ==========================================

    const ownerId =
      foundCard.userId;

    let ownerName =
      "Unknown User";

    try {
      const user =
        await message.client.users.fetch(
          ownerId
        );

      ownerName =
        user.username;
    } catch (error) {
      // Keep Unknown User
    }

    // ==========================================
    // TAG
    // ==========================================

    const tagDoc =
      await cardTagsCol.findOne({
        userId: ownerId,
        code: foundCard.code
      });

    const tagDisplay =
      tagDoc?.emoji || "No Tag";

    // ==========================================
    // SERIAL
    // ==========================================

    const serial =
      foundCard.serial ?? "?";

    // ==========================================
    // RENDER CARD
    // ==========================================

    /*
     * This is important.
     *
     * We pass:
     *
     * card:
     *   Correct S0/S1 card database entry
     *
     * season:
     *   Tells renderCard which season style
     *   should be used
     *
     * foundCard:
     *   Contains ownership information,
     *   including frameId.
     *
     * Therefore:
     *
     * S0 -> S0 image/render
     * S1 -> S1 image/render
     * frameId -> custom framed render
     */

    let buffer;

    try {
      buffer = await renderCard(
        {
          ...card,
          season
        },
        serial,
        {
          ...foundCard,
          season
        }
      );
    } catch (error) {
      console.error(
        `Failed to render card ${foundCard.code}:`,
        error
      );

      return message.reply(
        "❌ Failed to render this card."
      );
    }

    const imageName =
      `view-${foundCard.code}-s${season}.png`;

    const attachment =
      new AttachmentBuilder(buffer, {
        name: imageName
      });

    // ==========================================
    // FRAME DISPLAY
    // ==========================================

    const frameDisplay =
      foundCard.frameId
        ? `Frame #${foundCard.frameId}`
        : "Default";

    // ==========================================
    // EMBED
    // ==========================================

    const embed =
      new EmbedBuilder()
        .setColor(
          getColor(card.tier)
        )

        .setTitle(
          `${seasonEmoji} ${getTierEmoji(card.tier)} ${card.name}`
        )

        .addFields(
          {
            name: "🆔 Code",
            value:
              `\`${foundCard.code}\``,
            inline: true
          },

          {
            name: "🎴 Serial",
            value:
              `#${serial}`,
            inline: true
          },

          {
            name: "🗓️ Season",
            value:
              `${seasonEmoji} Season ${season}`,
            inline: true
          },

          {
            name: "🏷️ Tag",
            value:
              tagDisplay,
            inline: true
          },

          {
            name: "⭐ Favorite",
            value:
              foundCard.favorite
                ? "Yes"
                : "No",
            inline: true
          },

          {
            name: "🖼️ Frame",
            value:
              frameDisplay,
            inline: true
          },

          {
            name: "👤 Claimed By",
            value:
              ownerName,
            inline: true
          },

          {
            name: "🎬 Appearance",
            value:
              card.appearance ||
              card.show ||
              "Unknown"
          }
        )

        .setImage(
          `attachment://${imageName}`
        )

        .setFooter({
          text:
            `${seasonEmoji} Season ${season} • ` +
            `Card ID: ${card.id}`
        })

        .setTimestamp();

    await message.reply({
      embeds: [embed],
      files: [attachment]
    });
  }
};