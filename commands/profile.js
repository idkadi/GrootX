const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const connectDB = require("../database");
const cardsData = require("../data/cards.js");

function getCardsArray() {
  if (Array.isArray(cardsData)) return cardsData;
  if (Array.isArray(cardsData.cards)) return cardsData.cards;
  return [];
}

function getTradeStatus(tradeData) {
  if (!tradeData) return "None";

  const remaining = tradeData.expiresAt - Date.now();

  if (remaining <= 0) return "Expired";

  const days = Math.floor(
    remaining / (1000 * 60 * 60 * 24)
  );

  return `Active (${days}d left)`;
}

module.exports = {
  name: "profile",
  aliases: ["p"],

  async execute(message) {
    const targetUser =
      message.mentions.users.first() || message.author;

    const userId = targetUser.id;

    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const inventoryCol = db.collection("inventory");
    const collectionsCol = db.collection("collections");
    const tradePassesCol = db.collection("tradePasses");
    const profilesCol = db.collection("profiles");

    const balanceDoc = await balancesCol.findOne({ userId });
    const inventoryDoc = await inventoryCol.findOne({ userId });
    const userCollection = await collectionsCol.find({ userId }).toArray();
    const tradeData = await tradePassesCol.findOne({ userId });
    const profileData = await profilesCol.findOne({ userId });

    const allCards = getCardsArray();

    const coins = balanceDoc?.coins || 0;
    const userInventory = inventoryDoc?.items || {};

    const tokens = userInventory.token || 0;
    const gauntlets = userInventory.gauntlet || 0;

    const stoneTypes = [
      "space_stone",
      "mind_stone",
      "reality_stone",
      "power_stone",
      "time_stone",
      "soul_stone"
    ];

    const shardTypes = [
      "space_shard",
      "mind_shard",
      "reality_shard",
      "power_shard",
      "time_shard",
      "soul_shard"
    ];

    const ownedStones = stoneTypes.filter(
      stone => (userInventory[stone] || 0) > 0
    ).length;

    const totalShards = shardTypes.reduce(
      (total, shard) => total + (userInventory[shard] || 0),
      0
    );

    const tradeStatus = getTradeStatus(tradeData);

    let thumbnail = targetUser.displayAvatarURL();
    const files = [];

    const showcaseCode = profileData?.showcaseCard;

    if (showcaseCode) {
      const claimedCard = userCollection.find(
        c => c.code.toLowerCase() === showcaseCode.toLowerCase()
      );

      if (claimedCard) {
        const cardInfo = allCards.find(
          c => Number(c.id) === Number(claimedCard.cardId)
        );

        if (cardInfo) {
          const cardImagePath = path.join(
            __dirname,
            "../images",
            cardInfo.image
          );

          if (fs.existsSync(cardImagePath)) {
            thumbnail = "attachment://showcase.png";

            files.push(
              new AttachmentBuilder(cardImagePath, {
                name: "showcase.png"
              })
            );
          }
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x8b5cf6)
      .setTitle(`👤 ${targetUser.username}'s Profile`)
      .setThumbnail(thumbnail)
      .addFields(
        {
          name: "💰 Economy",
          value:
            `<:grootcoin:1504742213110861834> **Coins:** ${coins}\n` +
            `🎟️ **Tokens:** ${tokens}`,
          inline: false
        },
        {
          name: "🎴 Collection",
          value: `**Cards Owned:** ${userCollection.length}`,
          inline: false
        },
        {
          name: "💎 Infinity",
          value:
            `**Stones:** ${ownedStones}/6\n` +
            `**Shards:** ${totalShards}`,
          inline: false
        },
        {
          name: "📦 Special",
          value:
            `🧤 **Gauntlets:** ${gauntlets}\n` +
            `📜 **Trade Pass:** ${tradeStatus}`,
          inline: false
        }
      )
      .setFooter({
        text: "GrootX Player Profile"
      })
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      files
    });
  }
};