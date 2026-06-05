const TIER_STATS = {
  common: { attack: 4, defense: 1 },
  uncommon: { attack: 6, defense: 2 },
  rare: { attack: 8, defense: 3 },
  epic: { attack: 12, defense: 4 },
  legendary: { attack: 16, defense: 5 }
};

function normalize(text = "") {
  return String(text).trim().toLowerCase();
}

function getTierStats(card) {
  const tier = normalize(card.tier);
  return TIER_STATS[tier] || TIER_STATS.common;
}

function getSerialBoost(serial) {
  const s = Number(serial) || 999999;

  if (s <= 10) return 5;
  if (s <= 50) return 4;
  if (s <= 100) return 3;
  if (s <= 500) return 2;
  if (s <= 1000) return 1;

  return 0;
}

function getSynergyBoost(card, cardsAtLocation = []) {
  let boost = 0;

  const sameNameCount = cardsAtLocation.filter(c =>
    normalize(c.name) === normalize(card.name)
  ).length;

  const sameAppearanceCount = cardsAtLocation.filter(c =>
    normalize(c.appearance) === normalize(card.appearance)
  ).length;

  if (sameNameCount > 1) boost += sameNameCount - 1;
  if (sameAppearanceCount > 1) boost += sameAppearanceCount - 1;

  return boost;
}

function getLocationBoost(card, location) {
  const locName = normalize(location?.name || location);
  const name = normalize(card.name);
  const aka = (card.aka || []).map(a => normalize(a));
  const appearance = normalize(card.appearance);

  if (locName.includes("asgard")) {
    if (
      name.includes("thor") ||
      name.includes("loki") ||
      name.includes("odin") ||
      name.includes("heimdall") ||
      appearance.includes("thor") ||
      appearance.includes("loki")
    ) return 3;
  }

  if (locName.includes("wakanda")) {
    if (
      name.includes("black panther") ||
      name.includes("shuri") ||
      name.includes("okoye") ||
      name.includes("namor") ||
      appearance.includes("black panther") ||
      aka.includes("black panther")
    ) return 3;
  }

  if (locName.includes("titan")) {
    if (
      name.includes("thanos") ||
      name.includes("ultron") ||
      name.includes("kang") ||
      name.includes("knull") ||
      name.includes("green goblin") ||
      name.includes("venom") ||
      name.includes("carnage") ||
      name.includes("kingpin") ||
      name.includes("loki")
    ) return 3;
  }

  if (locName.includes("avengers")) {
    if (
      name.includes("iron man") ||
      name.includes("captain america") ||
      name.includes("thor") ||
      name.includes("hulk") ||
      name.includes("black widow") ||
      name.includes("hawkeye") ||
      name.includes("spider-man") ||
      name.includes("spider man") ||
      appearance.includes("avengers")
    ) return 3;
  }

  if (locName.includes("knowhere")) {
    if (
      name.includes("venom") ||
      name.includes("knull") ||
      name.includes("galactus") ||
      name.includes("silver surfer") ||
      name.includes("loki") ||
      appearance.includes("guardians") ||
      appearance.includes("fantastic four")
    ) return 3;
  }

  return 0;
}

function calculateBattlePower(card, options = {}) {
  const stats = getTierStats(card);

  const basePower = stats.attack - stats.defense;
  const serialBoost = getSerialBoost(options.serial);
  const synergyBoost = getSynergyBoost(card, options.cardsAtLocation || []);
  const locationBoost = getLocationBoost(card, options.location);

  const finalPower =
    basePower +
    serialBoost +
    synergyBoost +
    locationBoost;

  return {
    attack: stats.attack,
    defense: stats.defense,
    basePower,
    serialBoost,
    synergyBoost,
    locationBoost,
    finalPower
  };
}

module.exports = {
  calculateBattlePower,
  getSerialBoost,
  getSynergyBoost,
  getLocationBoost
};