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

  if (s <= 20) return 5;
  if (s <= 50) return 4;
  if (s <= 100) return 3;
  if (s <= 200) return 2;
  if (s <= 500) return 1;

  return 0;
}

// ✅ Same-name buff removed
// ✅ Only same-appearance synergy remains
function getSynergyBoost(card, cardsAtLocation = []) {
  let boost = 0;

  const sameAppearance = cardsAtLocation.filter(c =>
    normalize(c.appearance) === normalize(card.appearance)
  ).length;

  if (sameAppearance > 1) boost += sameAppearance - 1;

  return boost;
}

function getLocationBoost(card, location, serial) {
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
      name.includes("namor") ||
      appearance.includes("black panther") ||
      appearance.includes("wakanda") ||
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
      name.includes("hela") ||
      name.includes("gorr") ||
      name.includes("doctor doom") ||
      name.includes("galactus") ||
      name.includes("ebony maw") ||
      name.includes("corvus glaive") ||
      name.includes("proxima midnight") ||
      name.includes("black dwarf") ||
      name.includes("cull obsidian") ||
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
      name.includes("wanda") ||
      name.includes("vision") ||
      name.includes("ant-man") ||
      name.includes("wasp") ||
      appearance.includes("avengers")
    ) return 3;
  }

  if (loc.includes("knowhere")) {
    if (
      name.includes("venom") ||
      name.includes("knull") ||
      name.includes("galactus") ||
      name.includes("silver surfer") ||
      name.includes("groot") ||
      name.includes("rocket") ||
      name.includes("star-lord") ||
      name.includes("star") ||
      name.includes("gamora") ||
      name.includes("drax") ||
      name.includes("mantis") ||
      appearance.includes("guardians") ||
      appearance.includes("fantastic four")
    ) return 3;
  }

  if (loc.includes("spider")) {
    if (
      name.includes("spider") ||
      name.includes("venom") ||
      name.includes("carnage") ||
      name.includes("miles") ||
      name.includes("gwen") ||
      name.includes("2099") ||
      appearance.includes("spider")
    ) return 3;
  }

  if (loc.includes("kamar")) {
    if (
      name.includes("doctor strange") ||
      name.includes("strange") ||
      name.includes("ancient one") ||
      name.includes("wong") ||
      name.includes("mordo") ||
      name.includes("clea") ||
      name.includes("agatha") ||
      name.includes("wanda") ||
      appearance.includes("doctor strange") ||
      appearance.includes("multiverse")
    ) return 3;
  }

  if (loc.includes("sakaar")) {
    if (
      name.includes("hulk") ||
      name.includes("thor") ||
      name.includes("valkyrie") ||
      name.includes("grandmaster") ||
      name.includes("korg") ||
      name.includes("miek") ||
      name.includes("loki") ||
      appearance.includes("ragnarok")
    ) return 3;
  }

  if (loc.includes("void")) {
    if (
      name.includes("loki") ||
      name.includes("sylvie") ||
      name.includes("mobius") ||
      name.includes("deadpool") ||
      name.includes("wolverine") ||
      name.includes("x-23") ||
      name.includes("laura") ||
      appearance.includes("loki") ||
      appearance.includes("deadpool & wolverine")
    ) return 3;
  }

  if (loc.includes("baxter")) {
    if (
      name.includes("reed richard") ||
      name.includes("sue storm") ||
      name.includes("the thing") ||
      name.includes("human torch") ||
      appearance.includes("fantastic four")
    ) return 3;
  }

  if (loc.includes("kitchen")) {
    if (
      name.includes("daredevil") ||
      name.includes("punisher") ||
      name.includes("bullseye") ||
      name.includes("kingpin") ||
      name.includes("fisk") ||
      appearance.includes("daredevil") ||
      appearance.includes("punisher")
    ) return 3;
  }

  if (
    loc.includes("new avenger") ||
    loc.includes("thunderbolt")
  ) {
    if (
      name.includes("yelena") ||
      name.includes("winter soldier") ||
      name.includes("bucky") ||
      name.includes("red guardian") ||
      name.includes("ghost") ||
      name.includes("taskmaster") ||
      name.includes("u.s. agent") ||
      name.includes("us agent") ||
      name.includes("john walker") ||
      name.includes("sentry") ||
      name.includes("bob reynolds") ||
      name.includes("valentina") ||
      appearance.includes("thunderbolt")
    ) return 3;
  }

  if (loc.includes("quantum")) {
    if (
      name.includes("ant") ||
      name.includes("wasp") ||
      name.includes("kang") ||
      appearance.includes("quantum")
    ) return 3;
  }

  if (loc.includes("ta lo")) {
    if (
      name.includes("shang") ||
      appearance.includes("shang")
    ) return 3;
  }

  if (loc.includes("red room")) {
    if (
      name.includes("widow") ||
      name.includes("yelena") ||
      name.includes("red guardian") ||
      appearance.includes("widow")
    ) return 3;
  }

  return 0;
}

function calculateBattlePower(card, options = {}) {
  const basePower = getBasePower(card);
  const serialBoost = getSerialBoost(options.serial);
  const synergyBoost = getSynergyBoost(card, options.cardsAtLocation || []);

  const locationBoost = getLocationBoost(
    card,
    options.location,
    options.serial
  );

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