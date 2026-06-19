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
const COIN = "<:grootcoin:1504742213110861834>";

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
  aliases: ["shop"],

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

    console.log(
      "Market cards:",
      marketCards.map(c => ({
        name: c.name,
        image: c.image,
        tier: c.tier
      }))
    );

    const nextUpdate = Math.floor((market.updatedAt + MARKET_REFRESH) / 1000);

    const image = await createMarketImage(marketCards);

    const attachment = new AttachmentBuilder(image, {
      name: "market.png"
    });

    const row = new ActionRowBuilder();

    for (let i = 0; i < marketCards.length; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`market_buy_${i}`)
          .setLabel(marketCards[i].name.slice(0, 30))
          .setStyle(ButtonStyle.Primary)
      );
    }

    const marketMsg = await message.reply({
      content:
        `🛒 **Daily Market**\n` +
        `⏳ Refreshes <t:${nextUpdate}:R>\n\n` +
        marketCards.map(card =>
          `${getTierEmoji(card.tier)} **${card.name}** — ${COIN} ${card.price.toLocaleString()}`
        ).join("\n"),
      files: [attachment],
      components: [row]
    });

    const collector = marketMsg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      const userId = interaction.user.id;

      if (interaction.customId.startsWith("market_buy_")) {
        const index = Number(interaction.customId.replace("market_buy_", ""));
        const selected = marketCards[index];

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`market_confirm_${index}_${userId}`)
            .setLabel("Confirm")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(`market_cancel_${index}_${userId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.reply({
          content:
            `🛒 **Confirm Purchase**\n\n` +
            `${getTierEmoji(selected.tier)} **${selected.name}**\n` +
            `Price: ${COIN} **${selected.price.toLocaleString()}**`,
          components: [confirmRow],
          ephemeral: true
        });
      }

      if (
        !interaction.customId.startsWith("market_confirm_") &&
        !interaction.customId.startsWith("market_cancel_")
      ) return;

      const parts = interaction.customId.split("_");
      const action = parts[1];
      const index = Number(parts[2]);
      const ownerId = parts[3];

      if (interaction.user.id !== ownerId) {
        return interaction.reply({
          content: "❌ This confirmation is not for you.",
          ephemeral: true
        });
      }

      if (action === "cancel") {
        return interaction.update({
          content: "❌ Purchase cancelled.",
          components: []
        });
      }

      const freshMarket = await getMarket(db);
      const freshItem = freshMarket.cards[index];

      const selected = cards.find(
        c => String(c.id) === String(freshItem.cardId)
      );

      const price = freshItem.price;

      const balanceDoc = await balancesCol.findOne({ userId });
      const coins = balanceDoc?.coins || 0;

      if (coins < price) {
        return interaction.update({
          content:
            `❌ Not enough coins.\n\n` +
            `Needed: ${COIN} **${price.toLocaleString()}**\n` +
            `You have: ${COIN} **${coins.toLocaleString()}**`,
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

      return interaction.update({
        content:
          `✅ **Purchase Successful!**\n\n` +
          `${getTierEmoji(selected.tier)} **${selected.name}** #${serialDoc.serial}\n` +
          `Code: \`${code}\`\n` +
          `Paid: ${COIN} **${price.toLocaleString()}**`,
        components: []
      });
    });

    collector.on("end", async () => {
      await marketMsg.edit({
        components: []
      }).catch(() => {});
    });
  }
};