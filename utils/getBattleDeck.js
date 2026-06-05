const cards = require("../data/cards");
const connectDB = require("../database");

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function getCardData(cardId) {
  return cards.find(c => Number(c.id) === Number(cardId));
}

async function getBattleDeck(userId) {
  const db = await connectDB();

  const decksCol = db.collection("decks");
  const collectionsCol = db.collection("collections");

  const deck = await decksCol.findOne({ userId });

  if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
    return {
      ok: false,
      reason: "NO_DECK",
      cards: []
    };
  }

  const deckCodes = deck.cards.map(normalizeCode);

  const ownedCards = await collectionsCol.find({
    userId
  }).toArray();

  const orderedDeck = deckCodes
    .map(code => {
      const entry = ownedCards.find(e =>
        normalizeCode(e.code) === code
      );

      if (!entry) return null;

      const card = getCardData(entry.cardId);
      if (!card) return null;

      return {
        code: entry.code,
        cardId: entry.cardId,
        serial: entry.serial,
        card
      };
    })
    .filter(Boolean);

  if (orderedDeck.length === 0) {
    return {
      ok: false,
      reason: "NO_VALID_CARDS",
      cards: []
    };
  }

  return {
    ok: true,
    cards: orderedDeck
  };
}

module.exports = getBattleDeck;