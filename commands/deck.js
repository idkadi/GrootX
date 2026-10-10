const fs = require("fs");
const path = require("path");

const cards0 = require("../data/cards");
const cards1 = require("../data/season1");
const connectDB = require("../database");

const { createCanvas, loadImage } = require("canvas");
const renderCard = require("../utils/renderCard");

const {
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const MAX_DECK_SIZE = 12;
const MAX_LEGENDARY = 4;
const MAX_EPIC = 4;

const DECK_PRICES = {
  1: 0,
  2: 30000,
  3: 50000
};

async function createDeckImage(cards) {
  const canvas = createCanvas(1120, 1260);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, 1120, 1260);

  for (let i = 0; i < MAX_DECK_SIZE; i++) {
    const x = 20 + (i % 4) * 275;
    const y = 20 + Math.floor(i / 4) * 410;

    ctx.fillStyle = "#1f2937";
    ctx.fillRect(x, y, 255, 361);

    if (!cards[i]) continue;

    const { card, entry } = cards[i];

    const buffer = await renderCard(
      card,
      entry.serial ??
      entry.serialNumber ??
      entry.code ??
      "?",
      entry
    );

    const image = await loadImage(buffer);

    ctx.drawImage(image, x, y, 255, 361);

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.font = "16px sans-serif";

    ctx.fillText(
      String(entry.code || ""),
      x + 127,
      y + 386,
      250
    );
  }

  return canvas.toBuffer("image/png");
}

function getTierEmoji(tier) {
  switch ((tier || "").toLowerCase()) {
    case "common":
      return "<:common:1504510702956839033>";

    case "uncommon":
      return "<:uncommon:1504510929210052698>";

    case "rare":
      return "<:rare:1504510606718275764>";

    case "epic":
      return "<:epic:1504510771214680175>";

    case "legendary":
      return "<:legendary:1504511435974377552>";

    default:
      return "❓";
  }
}

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

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function normalizeDeckNo(value) {
  const deckNo = Number(value);

  return [1, 2, 3].includes(deckNo)
    ? deckNo
    : null;
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

async function ensureDeckDoc(col, userId) {
  await col.updateOne(
    { userId },
    {
      $setOnInsert: {
        userId,
        activeDeck: 1,
        decks: createDefaultDecks()
      }
    },
    { upsert: true }
  );

  const doc = await col.findOne({ userId });

  if (!doc.decks) {
    await col.updateOne(
      {
        _id: doc._id,
        decks: { $exists: false }
      },
      {
        $set: {
          decks: createDefaultDecks(doc.cards || []),
          activeDeck: doc.activeDeck || 1
        },
        $unset: {
          cards: ""
        }
      }
    );
  }

  for (const n of ["1", "2", "3"]) {
    await col.updateOne(
      {
        userId,
        [`decks.${n}`]: { $exists: false }
      },
      {
        $set: {
          [`decks.${n}`]: {
            unlocked: n === "1",
            name: `Deck ${n}`,
            cards: []
          }
        }
      }
    );
  }

  return col.findOne({ userId });
}

const data = new SlashCommandBuilder()
  .setName("deck")
  .setDescription("Manage battle decks");

for (const action of [
  "view",
  "list",
  "help",
  "add",
  "remove",
  "clear",
  "unlock",
  "select",
  "rename"
]) {
  data.addSubcommand(sub => {
    sub
      .setName(action)
      .setDescription(`${action} your battle deck`);

    if (!["list", "help"].includes(action)) {
      sub.addIntegerOption(option =>
        option
          .setName("number")
          .setDescription("Deck number")
          .setMinValue(1)
          .setMaxValue(3)
          .setRequired(action !== "view")
      );
    }

    if (["add", "remove"].includes(action)) {
      sub.addStringOption(option =>
        option
          .setName("code")
          .setDescription("Owned card code")
          .setRequired(true)
          .setMaxLength(100)
      );
    }

    if (action === "rename") {
      sub.addStringOption(option =>
        option
          .setName("name")
          .setDescription("Deck name")
          .setRequired(true)
          .setMaxLength(20)
      );
    }

    return sub;
  });
}

function getHelpText() {
  return (
    "**Deck Commands**\n\n" +
    "Slash: `/deck view`, `/deck add`, `/deck remove`, " +
    "`/deck select` and more.\n\n" +
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

async function execute(target, args = []) {
  const slash =
    typeof target.isChatInputCommand === "function" &&
    target.isChatInputCommand();

  if (slash && !target.deferred && !target.replied) {
    await target.deferReply();
  }

  const message = {
    author: slash ? target.user : target.author,

    reply: payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      return slash
        ? target.editReply(payload)
        : target.reply(payload);
    }
  };

  if (slash) {
    args = [
      target.options.getSubcommand(),
      String(target.options.getInteger("number") ?? ""),
      target.options.getString("code") ??
      target.options.getString("name") ??
      ""
    ];
  }

  try {
    const db = await connectDB();

    const decksCol = db.collection("decks");
    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");

    const userId = message.author.id;
    const sub = (args[0] || "view").toLowerCase();

    const deckDoc = await ensureDeckDoc(decksCol, userId);

    const originalDecks = structuredClone(deckDoc.decks);
    const originalActive = deckDoc.activeDeck;

    for (const deck of Object.values(deckDoc.decks)) {
      deck.cards = (deck.cards || []).map(normalizeCode);
    }

    async function saveDecks() {
      const result = await decksCol.updateOne(
        {
          userId,
          decks: originalDecks,
          activeDeck: originalActive
        },
        {
          $set: {
            decks: deckDoc.decks,
            activeDeck: deckDoc.activeDeck
          }
        }
      );

      if (!result.matchedCount) {
        throw new Error("Deck changed. Please try again.");
      }
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

            const status = deck.unlocked
              ? "Unlocked"
              : `Locked • ${DECK_PRICES[deckNo].toLocaleString()} coins`;

            const active =
              Number(deckDoc.activeDeck) === deckNo
                ? " ⭐ Active"
                : "";

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
        return message.reply(
          "❌ Use: `!deck unlock 2` or `!deck unlock 3`"
        );
      }

      const deck = getDeck(deckNo);

      if (deck.unlocked) {
        return message.reply(
          `❌ Deck ${deckNo} is already unlocked.`
        );
      }

      const price = DECK_PRICES[deckNo];

      if (!db.client?.startSession) {
        return message.reply(
          "Deck unlocking requires transaction support in database.js."
        );
      }

      const session = db.client.startSession();

      try {
        await session.withTransaction(async () => {
          const unlocked = await decksCol.updateOne(
            {
              userId,
              [`decks.${deckNo}.unlocked`]: false
            },
            {
              $set: {
                [`decks.${deckNo}.unlocked`]: true
              }
            },
            { session }
          );

          if (!unlocked.modifiedCount) {
            throw new Error(
              "That deck was already unlocked. Please try again."
            );
          }

          const payment = await balancesCol.updateOne(
            {
              userId,
              coins: { $gte: price }
            },
            {
              $inc: {
                coins: -price
              }
            },
            { session }
          );

          if (!payment.modifiedCount) {
            throw new Error(
              `You need ${price.toLocaleString()} coins to unlock this deck.`
            );
          }
        });
      } finally {
        await session.endSession();
      }

      return message.reply(
        `✅ Unlocked **Deck ${deckNo}** for ` +
        `**${price.toLocaleString()} coins**.`
      );
    }

    if (sub === "select") {
      const deckNo = normalizeDeckNo(args[1]);

      if (!deckNo) {
        return message.reply(
          "❌ Use: `!deck select 1`, `!deck select 2`, or `!deck select 3`"
        );
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked. Unlock it first.`
        );
      }

      deckDoc.activeDeck = deckNo;
      await saveDecks();

      return message.reply(
        `✅ Active battle deck set to **Deck ${deckNo}**.`
      );
    }

    if (sub === "rename") {
      const deckNo = normalizeDeckNo(args[1]);
      const newName = args.slice(2).join(" ").trim();

      if (!deckNo || !newName) {
        return message.reply(
          "❌ Use: `!deck rename 2 Avengers`"
        );
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked.`
        );
      }

      if (newName.length > 20) {
        return message.reply(
          "❌ Deck name must be 20 characters or less."
        );
      }

      getDeck(deckNo).name = newName;
      await saveDecks();

      return message.reply(
        `✅ Renamed Deck ${deckNo} to **${newName}**.`
      );
    }

    if (sub === "add") {
      const deckNo = normalizeDeckNo(args[1]);
      const inputCode = normalizeCode(args[2]);

      if (!deckNo || !inputCode) {
        return message.reply(
          "❌ Use: `!deck add 1 CARDCODE`"
        );
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked.`
        );
      }

      const deck = getDeck(deckNo);

      if (deck.cards.includes(inputCode)) {
        return message.reply(
          "❌ This card is already in that deck."
        );
      }

      if (deck.cards.length >= MAX_DECK_SIZE) {
        return message.reply(
          `❌ Deck ${deckNo} is full. ` +
          `Max deck size is **${MAX_DECK_SIZE} cards**.`
        );
      }

      const escapedCode = inputCode.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const ownedCard = await collectionsCol.findOne({
        userId,
        code: {
          $regex: `^${escapedCode}$`,
          $options: "i"
        }
      });

      if (!ownedCard) {
        return message.reply(
          "❌ You don't own a card with that code."
        );
      }

      const card = getCardData(ownedCard);

      if (!card) {
        return message.reply(
          "❌ Card data not found for this season/event."
        );
      }

      const entries = await collectionsCol
        .find({ userId })
        .toArray();

      const currentDeckCards = deck.cards
        .map(code =>
          entries.find(
            entry =>
              normalizeCode(entry.code) === normalizeCode(code)
          )
        )
        .filter(Boolean);

      if (
        currentDeckCards.length !== deck.cards.length ||
        currentDeckCards.some(entry => !getCardData(entry))
      ) {
        return message.reply(
          "Remove missing or unmatched cards before adding another card."
        );
      }

      const newIdentity = resolveEntry(ownedCard).key;

      if (
        currentDeckCards.some(
          entry => resolveEntry(entry).key === newIdentity
        )
      ) {
        return message.reply(
          "This card version is already in the deck. " +
          "A version from a different season is allowed."
        );
      }

      let legendaryCount = 0;
      let epicCount = 0;

      for (const entry of currentDeckCards) {
        const deckCard = getCardData(entry);
        const tier = clean(deckCard.tier);

        if (tier === "legendary") legendaryCount++;
        if (tier === "epic") epicCount++;
      }

      const newTier = clean(card.tier);

      if (
        newTier === "legendary" &&
        legendaryCount >= MAX_LEGENDARY
      ) {
        return message.reply(
          `❌ You can only have **${MAX_LEGENDARY} Legendary** ` +
          "cards in a battle deck, including Legendary event cards."
        );
      }

      if (
        newTier === "epic" &&
        epicCount >= MAX_EPIC
      ) {
        return message.reply(
          `❌ You can only have **${MAX_EPIC} Epic** ` +
          "cards in a battle deck, including Epic event cards."
        );
      }

      deck.cards.push(normalizeCode(ownedCard.code));
      await saveDecks();

      return message.reply(
        `✅ Added ${getTierEmoji(card.tier)} **${card.name}** ` +
        `\`${ownedCard.code}\` to **Deck ${deckNo}**.`
      );
    }

    if (sub === "remove") {
      const deckNo = normalizeDeckNo(args[1]);
      const inputCode = normalizeCode(args[2]);

      if (!deckNo || !inputCode) {
        return message.reply(
          "❌ Use: `!deck remove 1 CARDCODE`"
        );
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked.`
        );
      }

      const deck = getDeck(deckNo);

      if (!deck.cards.includes(inputCode)) {
        return message.reply(
          "❌ That card is not in this deck."
        );
      }

      deck.cards = deck.cards.filter(
        code => code !== inputCode
      );

      await saveDecks();

      return message.reply(
        `✅ Removed \`${inputCode}\` from **Deck ${deckNo}**.`
      );
    }

    if (sub === "clear") {
      const deckNo = normalizeDeckNo(args[1]);

      if (!deckNo) {
        return message.reply(
          "❌ Use: `!deck clear 1`"
        );
      }

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked.`
        );
      }

      getDeck(deckNo).cards = [];
      await saveDecks();

      return message.reply(
        `✅ **Deck ${deckNo}** has been cleared.`
      );
    }

    if (sub === "view" || ["1", "2", "3"].includes(sub)) {
      const deckNo = ["1", "2", "3"].includes(sub)
        ? Number(sub)
        : normalizeDeckNo(args[1]) ||
          Number(deckDoc.activeDeck) ||
          1;

      if (!isUnlocked(deckNo)) {
        return message.reply(
          `❌ Deck ${deckNo} is locked.`
        );
      }

      const deck = getDeck(deckNo);

      const entries = await collectionsCol
        .find({ userId })
        .toArray();

      const orderedDeckCards = deck.cards
        .map(deckCode => {
          const entry = entries.find(
            owned =>
              normalizeCode(owned.code) === normalizeCode(deckCode)
          );

          if (!entry) return null;

          const card = getCardData(entry);

          if (!card) return null;

          return { entry, card };
        })
        .filter(Boolean);

      const missing =
        deck.cards.length - orderedDeckCards.length;

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
        .setTitle(
          `⚔️ ${deck.name} — Deck ${deckNo}${activeText}`
        )
        .setDescription(
          "12 cards • Common/Uncommon/Rare: 1 energy • " +
          "Epic: 2 • Legendary: 3\n" +
          "Event cards follow their actual tier. " +
          "Battle bonuses stack." +
          (
            missing
              ? `\n⚠️ ${missing} missing/unmatched entries. ` +
                "Remove their codes before battling."
              : ""
          )
        )
        .setImage("attachment://battle-deck.png")
        .setFooter({
          text:
            `${orderedDeckCards.length}/${MAX_DECK_SIZE} Cards • ` +
            `Max ${MAX_LEGENDARY} Legendary • Max ${MAX_EPIC} Epic`
        });

      return message.reply({
        embeds: [embed],
        files: [attachment]
      });
    }

    return message.reply(getHelpText());
  } catch (error) {
    console.error("[deck]", error);

    const content =
      error.message?.startsWith("You need") ||
      error.message?.includes("Please try again")
        ? error.message
        : "Could not update or display this deck. Please try again.";

    await message.reply(content).catch(() => {});
  }
}

module.exports = {
  name: "deck",
  aliases: ["battledeck"],

  data,
  slashData: data,

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};