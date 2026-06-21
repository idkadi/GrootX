const cards = require("../data/cards");
const connectDB = require("../database");
const createMarketImage = require("../utils/createMarketImage");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const MARKET_REFRESH = 20 * 60 * 60 * 1000;
const LEGENDARY_REFRESH = 7 * 24 * 60 * 60 * 1000;

const COIN = "<:grootcoin:1504742213110861834>";

const PRICES = {
  common: 1000,
  uncommon: 2000,
  rare: 5000,
  epic: 10000,
  legendary: 20000
};

const TIERS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "epic"
];

function pickRandomCard(tier) {
  const pool = cards.filter(
    c => c.tier?.toLowerCase() === tier
  );

  return pool[Math.floor(Math.random() * pool.length)];
}

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

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const exists = await collectionsCol.findOne({ code });
    if (!exists) return code;
  }
}

async function getWeeklyLegendary(marketCol, now) {
  let weeklyLegendary = await marketCol.findOne({
    _id: "weekly_legendary"
  });

  if (
    !weeklyLegendary ||
    now - weeklyLegendary.updatedAt >= LEGENDARY_REFRESH
  ) {
    const legendaryCard = pickRandomCard("legendary");

    weeklyLegendary = {
      _id: "weekly_legendary",
      updatedAt: now,
      cardId: legendaryCard.id
    };

    await marketCol.updateOne(
      { _id: "weekly_legendary" },
      { $set: weeklyLegendary },
      { upsert: true }
    );
  }

  return weeklyLegendary;
}

async function getMarket(db) {
  const marketCol = db.collection("market");
  const now = Date.now();

  let market = await marketCol.findOne({
    _id: "daily_market"
  });

  const weeklyLegendary = await getWeeklyLegendary(marketCol, now);

  if (!market || now - market.updatedAt >= MARKET_REFRESH) {
    const marketCards = TIERS.map(tier => {
      const card = pickRandomCard(tier);

      return {
        tier,
        cardId: card.id,
        price: PRICES[tier],
        type: "daily"
      };
    });

    marketCards.push({
      tier: "legendary",
      cardId: weeklyLegendary.cardId,
      price: PRICES.legendary,
      type: "weekly"
    });

    market = {
      _id: "daily_market",
      updatedAt: now,
      cards: marketCards
    };

    await marketCol.updateOne(
      { _id: "daily_market" },
      { $set: market },
      { upsert: true }
    );
  } else {
    const hasWeeklyLegendary = market.cards.some(
      item => item.type === "weekly"
    );

    if (!hasWeeklyLegendary) {
      market.cards.push({
        tier: "legendary",
        cardId: weeklyLegendary.cardId,
        price: PRICES.legendary,
        type: "weekly"
      });

      await marketCol.updateOne(
        { _id: "daily_market" },
        { $set: { cards: market.cards } }
      );
    }
  }

  return market;
}

module.exports = {
  name: "market",
  aliases: ["shop"],

  async execute(message) {
    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");

    const market = await getMarket(db);

    const marketCards = market.cards
      .map(item => {
        const card = cards.find(
          c => String(c.id) === String(item.cardId)
        );

        if (!card) return null;

        return {
          ...card,
          tier: item.tier,
          price: item.price,
          type: item.type || "daily"
        };
      })
      .filter(Boolean);

    const nextUpdate = Math.floor(
      (market.updatedAt + MARKET_REFRESH) / 1000
    );

    const weeklyLegendary = market.cards.find(
      item => item.type === "weekly"
    );

    let weeklyUpdateText = "";

    if (weeklyLegendary) {
      const marketCol = db.collection("market");

      const weeklyDoc = await marketCol.findOne({
        _id: "weekly_legendary"
      });

      if (weeklyDoc?.updatedAt) {
        const weeklyNextUpdate = Math.floor(
          (weeklyDoc.updatedAt + LEGENDARY_REFRESH) / 1000
        );

        weeklyUpdateText =
          `👑 Weekly Legendary refreshes <t:${weeklyNextUpdate}:R>\n`;
      }
    }

    const image = await createMarketImage(marketCards);

    const attachment = new AttachmentBuilder(image, {
      name: "market.png"
    });

    const rows = [];
    let row = new ActionRowBuilder();

    for (let i = 0; i < marketCards.length; i++) {
      if (row.components.length === 5) {
        rows.push(row);
        row = new ActionRowBuilder();
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`market_buy_${i}`)
          .setLabel(marketCards[i].name.slice(0, 30))
          .setStyle(
            marketCards[i].type === "weekly"
              ? ButtonStyle.Success
              : ButtonStyle.Primary
          )
      );
    }

    if (row.components.length) rows.push(row);

    const marketMsg = await message.reply({
      content:
        `🛒 **Daily Market**\n` +
        `⏳ Daily cards refresh <t:${nextUpdate}:R>\n` +
        weeklyUpdateText +
        `\n` +
        marketCards.map(card => {
          const weeklyText =
            card.type === "weekly"
              ? " 👑 Weekly"
              : "";

          return (
            `${getTierEmoji(card.tier)} **${card.name}**${weeklyText} — ` +
            `${COIN} ${card.price.toLocaleString()}`
          );
        }).join("\n"),
      files: [attachment],
      components: rows
    });

    const collector = marketMsg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (!interaction.customId.startsWith("market_buy_")) return;

      const index = Number(
        interaction.customId.replace("market_buy_", "")
      );

      const selected = marketCards[index];

      if (!selected) {
        return interaction.reply({
          content: "❌ This market item was not found.",
          ephemeral: true
        });
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("market_confirm")
          .setLabel("Confirm")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("market_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
      );

      const confirmMsg = await interaction.reply({
        content:
          `🛒 **Confirm Purchase**\n\n` +
          `${getTierEmoji(selected.tier)} **${selected.name}**\n` +
          `Price: ${COIN} **${selected.price.toLocaleString()}**`,
        components: [confirmRow],
        ephemeral: true,
        fetchReply: true
      });

      try {
        const confirmInteraction =
          await confirmMsg.awaitMessageComponent({
            time: 30000,
            filter: i => i.user.id === interaction.user.id
          });

        if (confirmInteraction.customId === "market_cancel") {
          return confirmInteraction.update({
            content: "❌ Purchase cancelled.",
            components: []
          });
        }

        await confirmInteraction.deferUpdate();

        const freshMarket = await getMarket(db);
        const freshItem = freshMarket.cards[index];

        if (!freshItem) {
          return interaction.editReply({
            content: "❌ This market item no longer exists.",
            components: []
          });
        }

        const cardToBuy = cards.find(
          c => String(c.id) === String(freshItem.cardId)
        );

        if (!cardToBuy) {
          return interaction.editReply({
            content: "❌ Card data not found.",
            components: []
          });
        }

        const price = freshItem.price;
        const userId = interaction.user.id;

        const balanceDoc = await balancesCol.findOne({
          userId
        });

        const coins = balanceDoc?.coins || 0;

        if (coins < price) {
          return interaction.editReply({
            content:
              `❌ Not enough coins.\n\n` +
              `Needed: ${COIN} **${price.toLocaleString()}**\n` +
              `You have: ${COIN} **${coins.toLocaleString()}**`,
            components: []
          });
        }

        await balancesCol.updateOne(
          { userId },
          {
            $inc: {
              coins: -price
            }
          },
          { upsert: true }
        );

        await serialsCol.updateOne(
          {
            cardId: cardToBuy.id
          },
          {
            $inc: {
              serial: 1
            }
          },
          { upsert: true }
        );

        const serialDoc = await serialsCol.findOne({
          cardId: cardToBuy.id
        });

        const code = await generateUniqueCode(collectionsCol);

        await collectionsCol.insertOne({
          userId,
          cardId: cardToBuy.id,
          serial: serialDoc.serial,
          code,
          tag: null,
          favorite: false
        });

        return interaction.editReply({
          content:
            `✅ **Purchase Successful!**\n\n` +
            `${getTierEmoji(cardToBuy.tier)} **${cardToBuy.name}** #${serialDoc.serial}\n` +
            `Code: \`${code}\`\n` +
            `Paid: ${COIN} **${price.toLocaleString()}**`,
          components: []
        });

      } catch {
        return interaction.editReply({
          content: "⌛ Purchase timed out.",
          components: []
        });
      }
    });

    collector.on("end", async () => {
      await marketMsg.edit({
        components: []
      }).catch(() => {});
    });
  }
};