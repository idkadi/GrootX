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

function getTierEmoji(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

function getTradeStatus(tradeData) {
  if (!tradeData) return "None";

  const remaining =
    tradeData.expiresAt - Date.now();

  if (remaining <= 0) return "Expired";

  const days =
    Math.floor(remaining / (1000 * 60 * 60 * 24));

  const hours =
    Math.floor(
      (remaining % (1000 * 60 * 60 * 24)) /
      (1000 * 60 * 60)
    );

  return `Active (${days}d ${hours}h left)`;
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

module.exports = {
  name: "profile",
  aliases: ["p"],

  async execute(message) {
    const targetUser =
      message.mentions.users.first() || message.author;

    const userId =
      targetUser.id;

    const db =
      await connectDB();

    const balancesCol =
      db.collection("balances");

    const inventoryCol =
      db.collection("inventory");

    const collectionsCol =
      db.collection("collections");

    const tradePassesCol =
      db.collection("tradePasses");

    const profilesCol =
      db.collection("profiles");

    const balanceDoc =
      await balancesCol.findOne({ userId });

    const inventoryDoc =
      await inventoryCol.findOne({ userId });

    const userCollection =
      await collectionsCol.find({ userId }).toArray();

    const tradeData =
      await tradePassesCol.findOne({ userId });

    const profileData =
      await profilesCol.findOne({ userId });

    const allCards =
      getCardsArray();

    const coins =
      balanceDoc?.coins || 0;

    const ultronChips =
      balanceDoc?.ultronChips ||
      balanceDoc?.ultronchips ||
      balanceDoc?.chips ||
      inventoryDoc?.items?.ultronChip ||
      inventoryDoc?.items?.ultron_chips ||
      inventoryDoc?.items?.token ||
      0;

    const userInventory =
      inventoryDoc?.items || {};

    const gauntlets =
      userInventory.gauntlet || 0;

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

    const ownedStones =
      stoneTypes.filter(
        stone => (userInventory[stone] || 0) > 0
      ).length;

    const totalShards =
      shardTypes.reduce(
        (total, shard) =>
          total + (userInventory[shard] || 0),
        0
      );

    const tierCounts = {
      common: 0,
      uncommon: 0,
      rare: 0,
      epic: 0,
      legendary: 0
    };

    const ownedCardInfos = [];

    for (const entry of userCollection) {
      const cardInfo =
        allCards.find(
          c => Number(c.id) === Number(entry.cardId)
        );

      if (!cardInfo) continue;

      const tier =
        String(cardInfo.tier || "").toLowerCase();

      if (tierCounts[tier] !== undefined) {
        tierCounts[tier]++;
      }

      ownedCardInfos.push({
        entry,
        cardInfo
      });
    }

    const tierRank = {
      legendary: 5,
      epic: 4,
      rare: 3,
      uncommon: 2,
      common: 1
    };

    ownedCardInfos.sort((a, b) => {
      const rankA =
        tierRank[String(a.cardInfo.tier).toLowerCase()] || 0;

      const rankB =
        tierRank[String(b.cardInfo.tier).toLowerCase()] || 0;

      if (rankB !== rankA) return rankB - rankA;

      return (a.entry.serial || 999999) -
        (b.entry.serial || 999999);
    });

    const rarest =
      ownedCardInfos[0];

    const uniqueCardIds =
      new Set(
        userCollection.map(c => String(c.cardId))
      );

    const completionPercent =
      allCards.length > 0
        ? Math.floor(
            (uniqueCardIds.size / allCards.length) * 100
          )
        : 0;

    const tradeStatus =
      getTradeStatus(tradeData);

    let thumbnail =
      targetUser.displayAvatarURL();

    const files = [];

    const showcaseCode =
      profileData?.showcaseCard ||
      profileData?.favoriteCard;

    if (showcaseCode) {
      const claimedCard =
        userCollection.find(
          c =>
            String(c.code).toLowerCase() ===
            String(showcaseCode).toLowerCase()
        );

      if (claimedCard) {
        const cardInfo =
          allCards.find(
            c => Number(c.id) === Number(claimedCard.cardId)
          );

        if (cardInfo) {
          const cardImagePath =
            path.join(
              __dirname,
              "../images",
              cardInfo.image
            );

          if (fs.existsSync(cardImagePath)) {
            thumbnail =
              "attachment://showcase.png";

            files.push(
              new AttachmentBuilder(cardImagePath, {
                name: "showcase.png"
              })
            );
          }
        }
      }
    }

    const rarestText =
      rarest
        ? `${getTierEmoji(rarest.cardInfo.tier)} ` +
          `**${rarest.cardInfo.name}** ` +
          `#${rarest.entry.serial}\n` +
          `\`${rarest.entry.code}\` • ${rarest.cardInfo.appearance}`
        : "None";

    const embed =
      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle(`👤 ${targetUser.username}'s Profile`)
        .setThumbnail(thumbnail)
        .setDescription(
          `Welcome to **GrootX**, ${targetUser}.\n` +
          `Here is your collector profile.`
        )
        .addFields(
          {
            name: "💰 Economy",
            value:
              `<:grootcoin:1504742213110861834> **Coins:** ${formatNumber(coins)}\n` +
              `<:chipslogo:1519287944421048320> **Ultron Chips:** ${formatNumber(ultronChips)}`,
            inline: true
          },
          {
            name: "🎴 Collection",
            value:
              `**Total Cards:** ${formatNumber(userCollection.length)}\n` +
              `**Unique Cards:** ${formatNumber(uniqueCardIds.size)}/${formatNumber(allCards.length)}\n` +
              `**Completion:** ${completionPercent}%`,
            inline: true
          },
          {
            name: "💎 Infinity Items",
            value:
              `🧤 **Gauntlets:** ${formatNumber(gauntlets)}\n` +
              `💎 **Stones:** ${ownedStones}/6\n` +
              `🪨 **Shards:** ${formatNumber(totalShards)}`,
            inline: true
          },
          {
            name: "📊 Card Rarity Breakdown",
            value:
              `${getTierEmoji("legendary")} Legendary: **${tierCounts.legendary}**\n` +
              `${getTierEmoji("epic")} Epic: **${tierCounts.epic}**\n` +
              `${getTierEmoji("rare")} Rare: **${tierCounts.rare}**\n` +
              `${getTierEmoji("uncommon")} Uncommon: **${tierCounts.uncommon}**\n` +
              `${getTierEmoji("common")} Common: **${tierCounts.common}**`,
            inline: true
          },
          {
            name: "🏆 Best Card",
            value: rarestText,
            inline: true
          },
          {
            name: "📦 Special",
            value:
              `📜 **Trade Pass:** ${tradeStatus}`,
            inline: true
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