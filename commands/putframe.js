const connectDB = require("../database");
const frames = require("../data/frames");

module.exports = {
  name: "putframe",
  aliases: ["applyframe"],

  async execute(message, args) {
    const cardCode = args[0]?.toLowerCase();
    const frameItemCode = args[1]?.toUpperCase();

    if (!cardCode || !frameItemCode) {
      return message.reply(
        "❌ Usage: `!putframe cardcode framecode`\n" +
        "Example: `!putframe abc123 A7K92Q`"
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

    if (ownedCard.frameId) {
      return message.reply(
        "❌ This card already has a frame.\n" +
        "Remove/replace system can be added later."
      );
    }

    const frameItem = await frameInventoryCol.findOne({
      userId,
      code: frameItemCode
    });

    if (!frameItem) {
      return message.reply("❌ You don’t own a frame with that code.");
    }

    if (frameItem.used) {
      return message.reply("❌ This frame has already been used.");
    }

    const frameData = frames.find(
      f => Number(f.id) === Number(frameItem.frameId)
    );

    if (!frameData) {
      return message.reply("❌ Frame data not found in frames.js.");
    }

    await collectionsCol.updateOne(
      {
        userId,
        code: cardCode
      },
      {
        $set: {
          frameId: frameData.id
        }
      }
    );

    await frameInventoryCol.updateOne(
      {
        userId,
        code: frameItemCode
      },
      {
        $set: {
          used: true,
          appliedTo: ownedCard.code,
          usedAt: Date.now()
        }
      }
    );

    return message.reply(
      `✅ Applied **${frameData.name}** to card \`${ownedCard.code}\`.\n` +
      `Frame item \`${frameItemCode}\` has been used.`
    );
  }
};