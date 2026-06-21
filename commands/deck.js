const cards = require("../data/cards");
const connectDB = require("../database");
const createDeckImage = require("../utils/createDeckImage");

const {
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const MAX_DECK_SIZE = 12;
const MAX_LEGENDARY = 4;
const MAX_EPIC = 4;

const DECK_PRICES = {
  1: 0,
  2: 30000,
  3: 50000
};

function getTierEmoji(tier) {
  switch ((tier || "").toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

function getCardData(cardId) {
  return cards.find(c => Number(c.id) === Number(cardId));
}

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function normalizeDeckNo(value) {
  const deckNo = Number(value);
  return [1, 2, 3].includes(deckNo) ? deckNo : null;
}

function createDefaultDecks(oldCards = []) {
  return {
    "1": {
      unlocked: true,
      name: "Deck 1",
      cards: (oldCards || []).map(normalizeCode)
    },
    "2": {
      unlocked: false,
      name: "Deck 2",
      cards: []
    },
    "3": {
      unlocked: false,
      name: "Deck 3",
      cards: []
    }
  };
}

async function ensureDeckDoc(decksCol, userId) {
  let deckDoc = await decksCol.findOne({ userId });

  if (!deckDoc) {
    deckDoc = {
      userId,
      activeDeck: 1,
      decks: createDefaultDecks()
    };

    await decksCol.insertOne(deckDoc);
    return deckDoc;
  }

  if (!deckDoc.decks) {
    deckDoc.decks = createDefaultDecks(deckDoc.cards || []);
    deckDoc.activeDeck = deckDoc.activeDeck || 1;

    await decksCol.updateOne(
      { userId },
      {
        $set: {
          decks: deckDoc.decks,
          activeDeck: deckDoc.activeDeck
        },
        $unset: {
          cards: ""
        }
      }
    );
  }

  for (const deckNo of ["1", "2", "3"]) {
    if (!deckDoc.decks[deckNo]) {
      deckDoc.decks[deckNo] = {
        unlocked: deckNo === "1",
        name: `Deck ${deckNo}`,
        cards: []
      };
    }

    deckDoc.decks[deckNo].cards =
      (deckDoc.decks[deckNo].cards || []).map(normalizeCode);
  }

  if (!deckDoc.activeDeck) deckDoc.activeDeck = 1;

  await decksCol.updateOne(
    { userId },
    {
      $set: {
        decks: deckDoc.decks,
        activeDeck: deckDoc.activeDeck
      }
    }
  );

  return deckDoc;
}

function getHelpText() {
  return (
    "**Deck Commands**\n\n" +
    "`!deck` - View active deck\n" +
    "`!deck view 1` - View deck 1\n" +
    "`!deck add 1 CODE` - Add card to deck 1\n" +
    "`!deck remove 1 CODE` - Remove card from deck 1\n" +
    "`!deck clear 1` - Clear deck 1\n" +
    "`!deck unlock 2` - Unlock deck 2 for 30,000 coins\n" +
    "`!deck unlock 3` - Unlock deck 3 for 50,000 coins\n" +
    "`!deck select 2` - Set active deck\n" +
    "`!deck rename 2 Avengers` - Rename deck"
  );
}

module.exports = {
  name: "deck",
  aliases: ["battledeck"],

  async execute(message, args) {
    const db = await connectDB();

    const decksCol = db.collection("decks");
    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");

    const userId = message.author.id;
    const sub = (args[0] || "view").toLowerCase();

    const deckDoc = await ensureDeckDoc(decksCol, userId);

    async function saveDecks() {
      await decksCol.updateOne(
        { userId },
        {
          $set: {
            decks: deckDoc.decks,
            activeDeck: deckDoc.activeDeck
          }
        }
      );
    }

    function getDeck(deckNo) {
      return deckDoc.decks[String(deckNo)];
    }

    function isUnlocked(deckNo) {
      return getDeck(deckNo)?.unlocked === true;
    }

    if (sub === "help") {
      return message.reply(getHelpText());
    }

    if (sub === "list") {
      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle("⚔️ Your Battle Decks")
        .setDescription(
          [1, 2, 3].map(deckNo => {
            const deck = getDeck(deckNo);
            const status = deck.unlocked ? "Unlocked" : `Locked • ${DECK_PRICES[deckNo].toLocaleString()} coins`;
            const active = Number(deckDoc.activeDeck) === deckNo ? " ⭐ Active" : "";

            return (
              `**Deck ${deckNo}: ${deck.name}**${active}\n` +
              `${status} • ${deck.cards.length}/${MAX_DECK_SIZE} cards`
            );
          }).join("\n\n")
        );

      return message.reply({ embeds: [embed] });
    }

    if (sub === "unlock") {
      const deckNo = normalizeDeckNo(args[1]);

      if (!deckNo || deckNo === 1) {
        return message.reply("❌ Use: `!deck unlock 2` or `!deck unlock 3`");
      }

      const deck = getDeck(deckNo);

      if (deck.unlocked) {
        return message.reply(`❌ Deck ${deckNo} is already unlocked.`);
      }

      const price = DECK_PRICES[deckNo];

      const balance = await balancesCol.findOne({ userId });
      const coins = Number(balance?.coins || 0);

      if (coins < price) {
        return message.reply(
          `❌ You need **${price.toLocaleString()} coins** to unlock Deck ${deckNo}.\n` +
          `You only have **${coins.toLocaleString()} coins**.`
        );
      }

      await balancesCol.updateOne(
        { userId },
        { $inc: { coins: -price } }
      );

      deck.unlocked = true;
      await saveDecks();

      return message.reply(
        `✅ Unlocked **Deck ${deckNo}** for **${price.toLocaleString()} coins**.`
      );
    }

    if (sub === "select") {
      const deckNo = normalizeDeckNo(args[1]);

      if (!deckNo) {
        return message.reply("❌ Use: `!deck select 1`, `!deck select 2`, or `!deck select 3`");
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked. Unlock it first.`);
      }

      deckDoc.activeDeck = deckNo;
      await saveDecks();

      return message.reply(`✅ Active battle deck set to **Deck ${deckNo}**.`);
    }

    if (sub === "rename") {
      const deckNo = normalizeDeckNo(args[1]);
      const newName = args.slice(2).join(" ").trim();

      if (!deckNo || !newName) {
        return message.reply("❌ Use: `!deck rename 2 Avengers`");
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked.`);
      }

      if (newName.length > 20) {
        return message.reply("❌ Deck name must be 20 characters or less.");
      }

      getDeck(deckNo).name = newName;
      await saveDecks();

      return message.reply(`✅ Renamed Deck ${deckNo} to **${newName}**.`);
    }

    if (sub === "add") {
      const deckNo = normalizeDeckNo(args[1]);
      const inputCode = normalizeCode(args[2]);

      if (!deckNo || !inputCode) {
        return message.reply("❌ Use: `!deck add 1 CARDCODE`");
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked.`);
      }

      const deck = getDeck(deckNo);

      if (deck.cards.includes(inputCode)) {
        return message.reply("❌ This card is already in that deck.");
      }

      if (deck.cards.length >= MAX_DECK_SIZE) {
        return message.reply(
          `❌ Deck ${deckNo} is full. Max deck size is **${MAX_DECK_SIZE} cards**.`
        );
      }

      const ownedCard = await collectionsCol.findOne({
        userId,
        code: { $regex: `^${inputCode}$`, $options: "i" }
      });

      if (!ownedCard) {
        return message.reply("❌ You don't own a card with that code.");
      }

      const card = getCardData(ownedCard.cardId);

      if (!card) {
        return message.reply("❌ Card data not found.");
      }

      const entries = await collectionsCol.find({ userId }).toArray();

      const currentDeckCards = deck.cards
        .map(code =>
          entries.find(e => normalizeCode(e.code) === normalizeCode(code))
        )
        .filter(Boolean);

      let legendaryCount = 0;
      let epicCount = 0;

      for (const entry of currentDeckCards) {
        const deckCard = getCardData(entry.cardId);
        if (!deckCard) continue;

        const tier = (deckCard.tier || "").toLowerCase();

        if (tier === "legendary") legendaryCount++;
        if (tier === "epic") epicCount++;
      }

      const newTier = (card.tier || "").toLowerCase();

      if (newTier === "legendary" && legendaryCount >= MAX_LEGENDARY) {
        return message.reply(
          `❌ You can only have **${MAX_LEGENDARY} Legendary** cards in a battle deck.`
        );
      }

      if (newTier === "epic" && epicCount >= MAX_EPIC) {
        return message.reply(
          `❌ You can only have **${MAX_EPIC} Epic** cards in a battle deck.`
        );
      }

      deck.cards.push(normalizeCode(ownedCard.code));
      await saveDecks();

      return message.reply(
        `✅ Added ${getTierEmoji(card.tier)} **${card.name}** \`${ownedCard.code}\` to **Deck ${deckNo}**.`
      );
    }

    if (sub === "remove") {
      const deckNo = normalizeDeckNo(args[1]);
      const inputCode = normalizeCode(args[2]);

      if (!deckNo || !inputCode) {
        return message.reply("❌ Use: `!deck remove 1 CARDCODE`");
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked.`);
      }

      const deck = getDeck(deckNo);

      if (!deck.cards.includes(inputCode)) {
        return message.reply("❌ That card is not in this deck.");
      }

      deck.cards = deck.cards.filter(code => code !== inputCode);
      await saveDecks();

      return message.reply(`✅ Removed \`${inputCode}\` from **Deck ${deckNo}**.`);
    }

    if (sub === "clear") {
      const deckNo = normalizeDeckNo(args[1]);

      if (!deckNo) {
        return message.reply("❌ Use: `!deck clear 1`");
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked.`);
      }

      getDeck(deckNo).cards = [];
      await saveDecks();

      return message.reply(`✅ **Deck ${deckNo}** has been cleared.`);
    }

    if (sub === "view" || ["1", "2", "3"].includes(sub)) {
      const deckNo =
        ["1", "2", "3"].includes(sub)
          ? Number(sub)
          : normalizeDeckNo(args[1]) || Number(deckDoc.activeDeck) || 1;

      if (!isUnlocked(deckNo)) {
        return message.reply(`❌ Deck ${deckNo} is locked.`);
      }

      const deck = getDeck(deckNo);

      const entries = await collectionsCol
        .find({ userId })
        .toArray();

      const orderedDeckCards = deck.cards
        .map(deckCode => {
          const entry = entries.find(e =>
            normalizeCode(e.code) === normalizeCode(deckCode)
          );

          if (!entry) return null;

          const card = getCardData(entry.cardId);
          if (!card) return null;

          return {
            entry,
            card
          };
        })
        .filter(Boolean);

      const buffer = await createDeckImage(orderedDeckCards);

      const attachment = new AttachmentBuilder(buffer, {
        name: "battle-deck.png"
      });

      const activeText =
        Number(deckDoc.activeDeck) === deckNo
          ? " • Active Deck"
          : "";

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(`⚔️ ${deck.name} — Deck ${deckNo}${activeText}`)
        .setImage("attachment://battle-deck.png")
        .setFooter({
          text: `${orderedDeckCards.length}/${MAX_DECK_SIZE} Cards • Max ${MAX_LEGENDARY} Legendary • Max ${MAX_EPIC} Epic`
        });

      return message.reply({
        embeds: [embed],
        files: [attachment]
      });
    }

    return message.reply(getHelpText());
  }
};