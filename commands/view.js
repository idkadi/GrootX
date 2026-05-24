const path = require("path");

const cards = require("../data/cards");

const {
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");

function getTierEmoji(tier) {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

function getColor(tier) {
  switch (tier.toLowerCase()) {
    case "common": return 0xcd7f32;
    case "uncommon": return 0xc0c0c0;
    case "rare": return 0xffd700;
    case "epic": return 0x8000ff;
    case "legendary": return 0xff0000;
    default: return 0xffffff;
  }
}

module.exports = {
  name: "view",
  aliases: ["v"],

  async execute(message, args) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const cardTagsCol = db.collection("cardtags");

    let searchCode;

    if (!args[0]) {
      const latestCard = await collectionsCol
        .find({ userId: message.author.id })
        .sort({ _id: -1 })
        .limit(1)
        .next();

      if (!latestCard) {
        return message.reply("❌ Your collection is empty.");
      }

      searchCode = latestCard.code;
    } else {
      searchCode = args[0].toLowerCase();
    }

    const foundCard = await collectionsCol.findOne({
      code: searchCode
    });

    if (!foundCard) {
      return message.reply("❌ Card not found.");
    }

    const ownerId = foundCard.userId;

    const card = cards.find(
      c => Number(c.id) === Number(foundCard.cardId)
    );

    if (!card) {
      return message.reply("❌ Card data not found.");
    }

    const imagePath = path.join(
      __dirname,
      "..",
      "images",
      card.image
    );

    const imageName = card.image.split("/").pop();

    let ownerName = "Unknown User";

    try {
      const user = await message.client.users.fetch(ownerId);
      ownerName = user.username;
    } catch (err) {}

    const tagDoc = await cardTagsCol.findOne({
      userId: ownerId,
      code: foundCard.code
    });

    const tagDisplay = tagDoc?.emoji || "No Tag";

    const embed = new EmbedBuilder()
      .setColor(getColor(card.tier))
      .setTitle(`${getTierEmoji(card.tier)} ${card.name}`)
      .addFields(
        {
          name: "🆔 Code",
          value: `\`${foundCard.code}\``,
          inline: true
        },
        {
          name: "🎴 Serial",
          value: `#${foundCard.serial}`,
          inline: true
        },
        {
          name: "🏷️ Tag",
          value: tagDisplay,
          inline: true
        },
        {
          name: "⭐ Favorite",
          value: foundCard.favorite ? "Yes" : "No",
          inline: true
        },
        {
          name: "👤 Claimed By",
          value: ownerName,
          inline: true
        },
        {
          name: "🎬 Appearance",
          value:
            card.show ||
            card.appearance ||
            "Unknown"
        }
      )
      .setImage(`attachment://${imageName}`)
      .setFooter({
        text: `Card ID: ${card.id}`
      })
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      files: [
        {
          attachment: imagePath,
          name: imageName
        }
      ]
    });
  }
};