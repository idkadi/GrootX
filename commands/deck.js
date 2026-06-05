const cards = require("../data/cards");
const connectDB = require("../database");
const createDeckImage = require("../utils/createDeckImage");

const {
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

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

module.exports = {
  name: "deck",
  aliases: ["battledeck"],

  async execute(message, args) {
    const db = await connectDB();

    const decksCol = db.collection("decks");
    const collectionsCol = db.collection("collections");

    const userId = message.author.id;
    const sub = (args[0] || "view").toLowerCase();
    const inputCode = normalizeCode(args[1]);

    let deck = await decksCol.findOne({ userId });

    if (!deck) {
      await decksCol.insertOne({
        userId,
        cards: []
      });

      deck = {
        userId,
        cards: []
      };
    }

    deck.cards = (deck.cards || []).map(normalizeCode);

    if (sub === "add") {
      if (!inputCode) {
        return message.reply("❌ Use: `!deck add CARDCODE`");
      }

      if (deck.cards.includes(inputCode)) {
        return message.reply("❌ This card is already in your deck.");
      }

      if (deck.cards.length >= 15) {
        return message.reply("❌ Your deck is full. Max deck size is **15 cards**.");
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

      const currentEntries = await collectionsCol
        .find({ userId })
        .toArray();

      const currentDeckEntries = currentEntries.filter(entry =>
        deck.cards.includes(normalizeCode(entry.code))
      );

      const currentFullCards = currentDeckEntries
        .map(entry => ({
          entry,
          card: getCardData(entry.cardId)
        }))
        .filter(x => x.card);

      const legendaryCount = currentFullCards.filter(
        x => x.card.tier.toLowerCase() === "legendary"
      ).length;

      const epicCount = currentFullCards.filter(
        x => x.card.tier.toLowerCase() === "epic"
      ).length;

      const tier = card.tier.toLowerCase();

      if (tier === "legendary" && legendaryCount >= 5) {
        return message.reply("❌ You can only have **5 Legendary** cards in your deck.");
      }

      if (tier === "epic" && epicCount >= 7) {
        return message.reply("❌ You can only have **7 Epic** cards in your deck.");
      }

      await decksCol.updateOne(
        { userId },
        { $push: { cards: normalizeCode(ownedCard.code) } }
      );

      return message.reply(
        `✅ Added ${getTierEmoji(card.tier)} **${card.name}** \`${ownedCard.code}\` to your battle deck.`
      );
    }

    if (sub === "remove") {
      if (!inputCode) {
        return message.reply("❌ Use: `!deck remove CARDCODE`");
      }

      if (!deck.cards.includes(inputCode)) {
        return message.reply("❌ That card is not in your deck.");
      }

      await decksCol.updateOne(
        { userId },
        { $pull: { cards: inputCode } }
      );

      return message.reply(`✅ Removed \`${inputCode}\` from your battle deck.`);
    }

    if (sub === "clear") {
      await decksCol.updateOne(
        { userId },
        { $set: { cards: [] } }
      );

      return message.reply("✅ Your battle deck has been cleared.");
    }

    if (sub === "view") {
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

      const legendaryCount = orderedDeckCards.filter(
        x => x.card.tier.toLowerCase() === "legendary"
      ).length;

      const epicCount = orderedDeckCards.filter(
        x => x.card.tier.toLowerCase() === "epic"
      ).length;

      const buffer = await createDeckImage(
        orderedDeckCards,
        message.author.username
      );

      const attachment = new AttachmentBuilder(buffer, {
        name: "battle-deck.png"
      });

      const list = orderedDeckCards.length
        ? orderedDeckCards.map((x, i) => {
            return (
              `**${i + 1}.** ${getTierEmoji(x.card.tier)} ` +
              `\`${x.entry.code}\` • #${x.entry.serial} • **${x.card.name}**`
            );
          }).join("\n")
        : "No cards added yet.";

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle("⚔️ GrootX Battle Deck")
        .setDescription(list)
        .setImage("attachment://battle-deck.png")
        .setFooter({
          text:
            `Cards: ${orderedDeckCards.length}/15 • ` +
            `Legendary: ${legendaryCount}/5 • ` +
            `Epic: ${epicCount}/7`
        });

      return message.reply({
        embeds: [embed],
        files: [attachment]
      });
    }

    return message.reply(
      "❌ Use: `!deck view`, `!deck add CODE`, `!deck remove CODE`, or `!deck clear`"
    );
  }
};