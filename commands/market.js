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

const PRICES = {
  common: 1000,
  uncommon: 2000,
  rare: 5000,
  epic: 10000,
  legendary: 20000
};

const TIERS = ["common", "uncommon", "rare", "epic", "legendary"];

function pickRandomCard(tier) {
  const pool = cards.filter(c => c.tier?.toLowerCase() === tier);
  return pool[Math.floor(Math.random() * pool.length)];
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

async function getMarket(db) {
  const marketCol = db.collection("market");
  const now = Date.now();

  let market = await marketCol.findOne({ _id: "daily_market" });

  if (!market || now - market.updatedAt >= MARKET_REFRESH) {
    const marketCards = TIERS.map(tier => {
      const card = pickRandomCard(tier);

      return {
        tier,
        cardId: card.id,
        price: PRICES[tier]
      };
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
  }

  return market;
}

module.exports = {
  name: "market",
  aliases: ["m"],

  async execute(message) {
    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");

    const market = await getMarket(db);

    const marketCards = market.cards.map(item => {
      const card = cards.find(c => String(c.id) === String(item.cardId));

      return {
        ...card,
        tier: item.tier,
        price: item.price
      };
    });

    const nextUpdate = Math.floor((market.updatedAt + MARKET_REFRESH) / 1000);

    const image = await createMarketImage(marketCards);
    const attachment = new AttachmentBuilder(image, {
      name: "market.png"
    });

    const row = new ActionRowBuilder();

    for (const card of marketCards) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`market_buy_${card.tier}`)
          .setLabel(`Buy ${card.tier}`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    const marketMsg = await message.reply({
      content:
        `🛒 **Daily Market**\n` +
        `Updates <t:${nextUpdate}:R>\n\n` +
        marketCards.map(card =>
          `**${card.tier.toUpperCase()}** — ${card.name} — 🪙 ${card.price.toLocaleString()}`
        ).join("\n"),
      files: [attachment],
      components: [row]
    });

    const collector = marketMsg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      const tier = interaction.customId.replace("market_buy_", "");
      const selected = marketCards.find(c => c.tier === tier);

      if (!selected) {
        return interaction.reply({
          content: "❌ This market item was not found.",
          ephemeral: true
        });
      }

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_market_${tier}`)
          .setLabel("Confirm Buy")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`cancel_market_${tier}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        content:
          `🛒 Buy **${selected.name}** for 🪙 **${selected.price.toLocaleString()} coins**?`,
        components: [confirmRow],
        ephemeral: true
      });
    });

    message.client.on("interactionCreate", async interaction => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("confirm_market_") &&
          !interaction.customId.startsWith("cancel_market_")) return;

      const tier = interaction.customId.split("_")[2];

      if (interaction.customId.startsWith("cancel_market_")) {
        return interaction.update({
          content: "❌ Purchase cancelled.",
          components: []
        });
      }

      const freshMarket = await getMarket(db);

      const marketItem = freshMarket.cards.find(c => c.tier === tier);
      const selected = cards.find(c => String(c.id) === String(marketItem.cardId));

      const price = marketItem.price;
      const userId = interaction.user.id;

      const balanceDoc = await balancesCol.findOne({ userId });
      const coins = balanceDoc?.coins || 0;

      if (coins < price) {
        return interaction.update({
          content: `❌ You need 🪙 **${price.toLocaleString()} coins** to buy this card.`,
          components: []
        });
      }

      await balancesCol.updateOne(
        { userId },
        { $inc: { coins: -price } },
        { upsert: true }
      );

      await serialsCol.updateOne(
        { cardId: selected.id },
        { $inc: { serial: 1 } },
        { upsert: true }
      );

      const serialDoc = await serialsCol.findOne({
        cardId: selected.id
      });

      const code = await generateUniqueCode(collectionsCol);

      await collectionsCol.insertOne({
        userId,
        cardId: selected.id,
        serial: serialDoc.serial,
        code,
        tag: null,
        favorite: false
      });

      await interaction.update({
        content:
          `✅ You bought **${selected.name}** #${serialDoc.serial}\n` +
          `Code: \`${code}\`\n` +
          `Cost: 🪙 **${price.toLocaleString()} coins**`,
        components: []
      });
    });
  }
};