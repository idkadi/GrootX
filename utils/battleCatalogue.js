const fs = require("fs");
const path = require("path");
const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const clean = value =>
  String(value ?? "").trim().toLowerCase();

function seasonNumber(value) {
  const match = clean(value).match(
    /^(?:s|season\s*)?(\d+)$/
  );

  return match ? Number(match[1]) : null;
}

function arrayOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cards)) return data.cards;

  return [];
}

function cardKey(season, event, id) {
  return JSON.stringify([
    season,
    clean(event),
    String(id).trim()
  ]);
}

// Automatically discover future season2.js, season3.js, etc.
// Restart the bot after adding a new catalogue.
function loadCatalogue() {
  const sources = new Map([
    [0, cards0],
    [1, cards1]
  ]);

  const directory = path.join(__dirname, "../data");

  for (const filename of fs.readdirSync(directory)) {
    const match = filename.match(/^season(\d+)\.js$/i);

    if (!match || Number(match[1]) <= 1) continue;

    sources.set(
      Number(match[1]),
      require(path.join(directory, filename))
    );
  }

  const catalogue = new Map();

  for (const [fallbackSeason, source] of sources) {
    for (const card of arrayOf(source)) {
      if (!card || card.id == null) continue;

      const season = seasonNumber(
        card.season ??
        card.cardSeason ??
        fallbackSeason
      );

      if (season === null) continue;

      const event = clean(card.event);
      const key = cardKey(season, event, card.id);

      catalogue.set(key, {
        key,
        season,
        event,
        card
      });
    }
  }

  const byId = new Map();

  for (const record of catalogue.values()) {
    const key = cardKey(
      record.season,
      "",
      record.card.id
    );

    if (!byId.has(key)) {
      byId.set(key, []);
    }

    byId.get(key).push(record);
  }

  return { catalogue, byId };
}

const CATALOGUE = loadCatalogue();

function resolveEntry(entry) {
  const season = seasonNumber(
    entry.season ?? entry.cardSeason ?? 0
  );

  if (season === null || entry.cardId == null) {
    return null;
  }

  const event = clean(entry.event);

  const exact = CATALOGUE.catalogue.get(
    cardKey(season, event, entry.cardId)
  );

  if (exact) return exact;

  // Explicit event metadata must match.
  if (event) return null;

  // Only infer missing event metadata for an unambiguous match.
  const candidates = CATALOGUE.byId.get(
    cardKey(season, "", entry.cardId)
  ) || [];

  return candidates.length === 1
    ? candidates[0]
    : null;
}

function getCardData(entry) {
  return resolveEntry(entry)?.card || null;
}


module.exports = { resolveEntry, getCardData, cardKey, seasonNumber };
