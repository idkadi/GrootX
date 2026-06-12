const cardsData = require("../data/cards.js");
const connectDB = require("../database");

function getCardsArray() {
  if (Array.isArray(cardsData)) return cardsData;
  if (Array.isArray(cardsData.cards)) return cardsData.cards;
  return [];
}

module.exports = {
  name: "place",
  aliases: ["albumadd"],

  async execute(message, args) {

    // Supports album names with spaces
    if (args.length < 4) {
      return message.reply(
        "❌ Use: `!place <album name> <page> <slot> <card code>`\nExample: `!place The Avengers 1 2 abc123`"
      );
    }

    const code = args.pop().toLowerCase();
    const slotArg = args.pop();
    const pageArg = args.pop();
    const albumName = args.join(" ");

    const pageNumber = parseInt(pageArg);
    const slotNumber = parseInt(slotArg);

    if (
      !albumName ||
      isNaN(pageNumber) ||
      isNaN(slotNumber) ||
      !code
    ) {
      return message.reply(
        "❌ Use: `!place <album name> <page> <slot> <card code>`"
      );
    }

    const db = await connectDB();

    const albumsCol = db.collection("albums");
    const collectionsCol = db.collection("collections");

    const userId = message.author.id;

    const allCards = getCardsArray();

    const album = await albumsCol.findOne({
      userId,
      name: {
        $regex: `^${albumName}$`,
        $options: "i"
      }
    });

    if (!album) {
      return message.reply(
        `❌ Album **${albumName}** not found.`
      );
    }

    const page = album.pages?.[pageNumber - 1];

    if (!page) {
      return message.reply(
        "❌ That page does not exist."
      );
    }

    if (!page.layout) {
      return message.reply(
        "❌ This page has no layout."
      );
    }

    const ownedCard = await collectionsCol.findOne({
      userId,
      code
    });

    if (!ownedCard) {
      return message.reply(
        `❌ You don't own card code **${code}**.`
      );
    }

    const cardInfo = allCards.find(
      c => Number(c.id) === Number(ownedCard.cardId)
    );

    if (!cardInfo) {
      return message.reply(
        "❌ Card data not found."
      );
    }

    if (!Array.isArray(page.slots)) {
      page.slots = [];
    }

    page.slots[slotNumber - 1] = {
      cardId: ownedCard.cardId,
      code: ownedCard.code
    };

    await albumsCol.updateOne(
      { _id: album._id },
      {
        $set: {
          pages: album.pages
        }
      }
    );

    return message.reply(
      `✅ Placed **${cardInfo.name}** (${ownedCard.code}) in **${album.name}** • Page **${pageNumber}** • Slot **${slotNumber}**`
    );
  }
};