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

function formatItemName(item) {
  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  name: "viewtrade",
  aliases: ["vt"],

  async execute(message) {
    const db = await connectDB();

    const tradesCol = db.collection("trades");
    const collectionsCol = db.collection("collections");

    const userId = message.author.id;

    const trade = await tradesCol.findOne({
      users: userId
    });

    if (!trade) {
      return message.reply("❌ You are not in an active trade.");
    }

    const user1 = trade.users[0];
    const user2 = trade.users[1];

    async function formatOffer(userId) {
      const offer = trade.offers[userId];

      if (!offer) return "No offer.";

      let text = `💰 Coins: **${offer.coins || 0}**\n`;

      if (
        offer.items &&
        Object.keys(offer.items).length > 0
      ) {
        text += "\n📦 Items:\n";

        for (const [item, amount] of Object.entries(offer.items)) {
          if (amount <= 0) continue;

          text += `• **${formatItemName(item)}** x${amount}\n`;
        }
      }

      text += "\n";

      if (!offer.cards || offer.cards.length === 0) {
        text += "No cards added.";
      } else {
        for (const code of offer.cards) {
          const entry = await collectionsCol.findOne({
            userId,
            code
          });

          if (!entry) continue;

          const card = cards.find(
            c => Number(c.id) === Number(entry.cardId)
          );

          if (!card) continue;

          text +=
            `${getTierEmoji(card.tier)} ` +
            `**${card.name}**\n` +
            `└ ${entry.code} ` +
            `• #${String(entry.serial).padStart(5, "0")}\n\n`;
        }
      }

      return text;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle("🤝 Active Trade")
      .addFields(
        {
          name:
            `${message.guild.members.cache.get(user1)?.user.username || "User"}'s Offer`,
          value: await formatOffer(user1),
          inline: true
        },
        {
          name:
            `${message.guild.members.cache.get(user2)?.user.username || "User"}'s Offer`,
          value: await formatOffer(user2),
          inline: true
        }
      )
      .setFooter({
        text: "Use !confirmtrade when ready"
      });

    message.reply({
      embeds: [embed]
    });
  }
};