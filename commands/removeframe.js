const connectDB = require("../database");
const frames = require("../data/frames");

module.exports = {
  name: "removeframe",
  aliases: ["unframe"],

  async execute(message, args) {
    const cardCode = args[0]?.toLowerCase();

    if (!cardCode) {
      return message.reply(
        "❌ Usage: `!removeframe cardcode`\n" +
        "Example: `!removeframe abc123`"
      );
    }

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const frameInventoryCol = db.collection("frameInventory");

    const userId = message.author.id;

    const ownedCard = await collectionsCol.findOne({
      userId,
      code: cardCode
    });

    if (!ownedCard) {
      return message.reply("❌ You don’t own a card with that code.");
    }

    if (!ownedCard.frameId) {
      return message.reply("❌ This card does not have any frame equipped.");
    }

    const frameData = frames.find(
      f => Number(f.id) === Number(ownedCard.frameId)
    );

    const frameItem = await frameInventoryCol.findOne({
      userId,
      appliedTo: ownedCard.code,
      used: true
    });

    await collectionsCol.updateOne(
      {
        userId,
        code: cardCode
      },
      {
        $unset: {
          frameId: ""
        }
      }
    );

    if (frameItem) {
      await frameInventoryCol.updateOne(
        {
          _id: frameItem._id
        },
        {
          $set: {
            used: false
          },
          $unset: {
            appliedTo: "",
            usedAt: ""
          }
        }
      );
    }

    return message.reply(
      `✅ Removed **${frameData?.name || "Frame"}** from card \`${ownedCard.code}\`.\n` +
      (frameItem
        ? `Frame item \`${frameItem.code}\` is now available again.`
        : "⚠️ Frame was removed, but no matching frame item was found in inventory.")
    );
  }
};