const TIER_POWER = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 5,
  legendary: 7
};

function normalize(text = "") {
  return String(text).trim().toLowerCase();
}

function getBasePower(card) {
  if (typeof card.power === "number") return card.power;

  const tier = normalize(card.tier);
  return TIER_POWER[tier] || 1;
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

  const sameName = cardsAtLocation.filter(c =>
    normalize(c.name) === normalize(card.name)
  ).length;

  const sameAppearance = cardsAtLocation.filter(c =>
    normalize(c.appearance) === normalize(card.appearance)
  ).length;

  if (sameName > 1) boost += sameName - 1;
  if (sameAppearance > 1) boost += sameAppearance - 1;

  return boost;
}

function getLocationBoost(card, location) {
  const loc = normalize(location?.name || location);
  const name = normalize(card.name);
  const appearance = normalize(card.appearance);
  const aka = (card.aka || []).map(a => normalize(a));

  if (loc.includes("asgard")) {
    if (
      name.includes("thor") ||
      name.includes("loki") ||
      name.includes("odin") ||
      name.includes("heimdall") ||
      appearance.includes("thor") ||
      appearance.includes("loki")
    ) return 3;
  }

  if (loc.includes("wakanda")) {
    if (
      name.includes("black panther") ||
      name.includes("shuri") ||
      name.includes("okoye") ||
      appearance.includes("black panther") ||
      aka.includes("black panther")
    ) return 3;
  }

  if (loc.includes("titan")) {
    if (
      name.includes("thanos") ||
      name.includes("ultron") ||
      name.includes("kang") ||
      name.includes("knull") ||
      name.includes("goblin") ||
      name.includes("venom") ||
      name.includes("carnage") ||
      name.includes("kingpin") ||
      name.includes("loki")
    ) return 3;
  }

  if (loc.includes("avengers")) {
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

  if (loc.includes("knowhere")) {
    if (
      name.includes("venom") ||
      name.includes("knull") ||
      name.includes("galactus") ||
      name.includes("silver surfer") ||
      appearance.includes("guardians") ||
      appearance.includes("fantastic four")
    ) return 3;
  }

  return 0;
}

function calculateBattlePower(card, options = {}) {
  const basePower = getBasePower(card);
  const serialBoost = getSerialBoost(options.serial);
  const synergyBoost = getSynergyBoost(card, options.cardsAtLocation || []);
  const locationBoost = getLocationBoost(card, options.location);

  return {
    basePower,
    serialBoost,
    synergyBoost,
    locationBoost,
    finalPower: basePower + serialBoost + synergyBoost + locationBoost
  };
}

module.exports = {
  calculateBattlePower,
  getBasePower,
  getSerialBoost,
  getSynergyBoost,
  getLocationBoost
};