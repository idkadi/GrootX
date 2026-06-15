// utils/ranks.js

const RANK_EMOJIS = {
  Rookie: "<:rookie:1515739693973770371>",
  Silver: "<:silver:1515745357236273293>",
  Gold: "<:gold:1515736449402802299>",
  Platinum: "<:platinum:1515736668475490314>",
  Diamond: "<:diamond:1515736699471265822>",
  Master: "<:master:1515736775295893504>",
  Elite: "<:elite:1515738270393438348>"
};

const ranks = [
  { name: "Rookie I", tier: "Rookie", min: 0, max: 99 },
  { name: "Rookie II", tier: "Rookie", min: 100, max: 199 },
  { name: "Rookie III", tier: "Rookie", min: 200, max: 299 },

  { name: "Silver I", tier: "Silver", min: 300, max: 449 },
  { name: "Silver II", tier: "Silver", min: 450, max: 599 },
  { name: "Silver III", tier: "Silver", min: 600, max: 799 },

  { name: "Gold I", tier: "Gold", min: 800, max: 999 },
  { name: "Gold II", tier: "Gold", min: 1000, max: 1249 },
  { name: "Gold III", tier: "Gold", min: 1250, max: 1499 },

  { name: "Platinum I", tier: "Platinum", min: 1500, max: 1799 },
  { name: "Platinum II", tier: "Platinum", min: 1800, max: 2099 },
  { name: "Platinum III", tier: "Platinum", min: 2100, max: 2499 },

  { name: "Diamond I", tier: "Diamond", min: 2500, max: 2999 },
  { name: "Diamond II", tier: "Diamond", min: 3000, max: 3499 },
  { name: "Diamond III", tier: "Diamond", min: 3500, max: 3999 },

  { name: "Master I", tier: "Master", min: 4000, max: 4499 },
  { name: "Master II", tier: "Master", min: 4500, max: 4999 },
  { name: "Master III", tier: "Master", min: 5000, max: 5999 },

  { name: "Elite", tier: "Elite", min: 6000, max: Infinity }
];

function getRank(trophies = 0) {
  trophies = Number(trophies) || 0;

  let currentRank = ranks[0];

  for (const rank of ranks) {
    if (trophies >= rank.min) {
      currentRank = rank;
    }
  }

  return currentRank;
}

function getNextRank(trophies = 0) {
  trophies = Number(trophies) || 0;

  return ranks.find(rank => rank.min > trophies) || null;
}

function getRankEmoji(rankOrTier) {
  const text = String(rankOrTier || "");

  const tier =
    text.split(" ")[0];

  return RANK_EMOJIS[tier] || "🏆";
}

function getTrophyChange(rankName) {
  const tier =
    String(rankName || "Rookie").split(" ")[0];

  switch (tier) {
    case "Rookie":
      return { win: 30, loss: -5 };

    case "Silver":
      return { win: 28, loss: -8 };

    case "Gold":
      return { win: 25, loss: -10 };

    case "Platinum":
      return { win: 22, loss: -14 };

    case "Diamond":
      return { win: 20, loss: -16 };

    case "Master":
      return { win: 18, loss: -18 };

    case "Elite":
      return { win: 15, loss: -20 };

    default:
      return { win: 30, loss: -5 };
  }
}

function getRankFloor(trophies = 0) {
  trophies = Number(trophies) || 0;

  if (trophies >= 6000) return 6000;
  if (trophies >= 4000) return 4000;
  if (trophies >= 2500) return 2500;
  if (trophies >= 1500) return 1500;
  if (trophies >= 800) return 800;
  if (trophies >= 300) return 300;

  return 0;
}

module.exports = {
  ranks,
  getRank,
  getNextRank,
  getRankEmoji,
  getTrophyChange,
  getRankFloor
};