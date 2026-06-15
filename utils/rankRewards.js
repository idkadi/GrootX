const cards = require("../data/cards");
const { getRankEmoji } = require("./ranks");

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

const rankRewards = [
  { id: "rookie_ii", required: 100, name: "Rookie II", coins: 500, cards: { common: 5 } },
  { id: "rookie_iii", required: 200, name: "Rookie III", coins: 750, cards: { common: 5 } },
  { id: "silver_i", required: 300, name: "Silver I", coins: 1000, cards: { uncommon: 3 } },

  { id: "silver_ii", required: 450, name: "Silver II", coins: 1250, cards: { common: 3, uncommon: 3 } },
  { id: "silver_iii", required: 600, name: "Silver III", coins: 1500, cards: { uncommon: 3 } },
  { id: "gold_i", required: 800, name: "Gold I", coins: 2000, cards: { rare: 2 } },

  { id: "gold_ii", required: 1000, name: "Gold II", coins: 2500, cards: { uncommon: 2, rare: 2 } },
  { id: "gold_iii", required: 1250, name: "Gold III", coins: 3000, cards: { rare: 2 } },
  { id: "platinum_i", required: 1500, name: "Platinum I", coins: 4000, cards: { epic: 1 } },

  { id: "platinum_ii", required: 1800, name: "Platinum II", coins: 4500, cards: { rare: 1 } },
  { id: "platinum_iii", required: 2100, name: "Platinum III", coins: 5000, cards: { rare: 1, epic: 1 } },
  { id: "diamond_i", required: 2500, name: "Diamond I", coins: 6500, cards: { epic: 1 } },

  { id: "diamond_ii", required: 3000, name: "Diamond II", coins: 7500, cards: { epic: 1 } },
  { id: "diamond_iii", required: 3500, name: "Diamond III", coins: 8500, cards: { epic: 1, rare: 1 } },
  { id: "master_i", required: 4000, name: "Master I", coins: 10000, cards: { legendary: 1 } },

  { id: "master_ii", required: 4500, name: "Master II", coins: 12000, cards: { epic: 1 } },
  { id: "master_iii", required: 5000, name: "Master III", coins: 15000, cards: { epic: 1 } },
  { id: "elite", required: 6000, name: "Elite", coins: 20000, cards: { legendary: 2 } },

  { id: "elite_6700", required: 6700, name: "Elite Milestone 1", coins: 10000, cards: { legendary: 1 } },
  { id: "elite_7400", required: 7400, name: "Elite Milestone 2", coins: 12000, cards: { legendary: 1 } },
  { id: "elite_8100", required: 8100, name: "Elite Milestone 3", coins: 15000, cards: { legendary: 1 } },
  { id: "elite_8800", required: 8800, name: "Elite Milestone 4", coins: 18000, cards: { legendary: 1 } },
  { id: "elite_9500", required: 9500, name: "Elite Milestone 5", coins: 20000, cards: { legendary: 1 } }
];

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const exists = await collectionsCol.findOne({ code });
    if (!exists) return code;
  }
}

async function giveRandomCard(db, userId, tier) {
  const collectionsCol = db.collection("collections");
  const serialsCol = db.collection("serials");

  const pool = cards.filter(
    card => String(card.tier).toLowerCase() === String(tier).toLowerCase()
  );

  if (!pool.length) return null;

  const card = pool[Math.floor(Math.random() * pool.length)];

  await serialsCol.updateOne(
    { cardId: card.id },
    { $inc: { serial: 1 } },
    { upsert: true }
  );

  const serialDoc = await serialsCol.findOne({ cardId: card.id });
  const serial = serialDoc.serial;

  const code = await generateUniqueCode(collectionsCol);

  await collectionsCol.insertOne({
    userId,
    cardId: card.id,
    serial,
    code,
    tag: null,
    favorite: false
  });

  return {
    name: card.name,
    tier: card.tier,
    serial,
    code
  };
}

async function giveRankRewards(db, userId, oldTrophies, newTrophies, alreadyClaimed = []) {
  const balancesCol = db.collection("balances");

  const rewardsToGive = rankRewards.filter(
    reward =>
      oldTrophies < reward.required &&
      newTrophies >= reward.required &&
      !alreadyClaimed.includes(reward.id)
  );

  if (!rewardsToGive.length) {
    return {
      rewardsGiven: [],
      claimedIds: [],
      text: ""
    };
  }

  let totalCoins = 0;
  const cardsGiven = [];
  const claimedIds = [];

  for (const reward of rewardsToGive) {
    totalCoins += reward.coins || 0;
    claimedIds.push(reward.id);

    for (const [tier, amount] of Object.entries(reward.cards || {})) {
      for (let i = 0; i < amount; i++) {
        const card = await giveRandomCard(db, userId, tier);
        if (card) cardsGiven.push(card);
      }
    }
  }

  if (totalCoins > 0) {
    await balancesCol.updateOne(
      { userId },
      { $inc: { coins: totalCoins } },
      { upsert: true }
    );
  }

  const rewardNames = rewardsToGive
    .map(r =>
      `🎉 **RANK PROMOTION!**\n` +
      `${getRankEmoji(r.name)} **${r.name}** Unlocked`
    )
    .join("\n\n");

  const cardText = cardsGiven.length
    ? cardsGiven
        .map(card =>
          `${getTierEmoji(card.tier)} **${card.name}** #${card.serial} • \`${card.code}\``
        )
        .join("\n")
    : "No cards";

  const text =
    `\n\n━━━━━━━━━━━━━━\n` +
    `${rewardNames}\n\n` +
    `💰 **Coins Earned:** +${totalCoins.toLocaleString()}\n\n` +
    `🎴 **Reward Cards:**\n${cardText}\n` +
    `━━━━━━━━━━━━━━`;

  return {
    rewardsGiven: rewardsToGive,
    claimedIds,
    text
  };
}

module.exports = {
  giveRankRewards,
  rankRewards
};