const connectDB = require("../database");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

module.exports = {
  name: "give",

  async execute(message, args) {
    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply(
        "❌ Mention a user.\n\n" +
        "Example:\n" +
        "`!give @user q7mz2x`"
      );
    }

    if (!args[1]) {
      return message.reply(
        "❌ Provide a card code."
      );
    }

    const code =
      args[1].toLowerCase();

    if (
      target.id ===
      message.author.id
    ) {
      return message.reply(
        "❌ You cannot give cards to yourself."
      );
    }

    const db =
      await connectDB();

    const collectionsCol =
      db.collection("collections");

    const giverId =
      message.author.id;

    const receiverId =
      target.id;

    const card =
      await collectionsCol.findOne({
        userId: giverId,
        code
      });

    if (!card) {
      return message.reply(
        "❌ You do not own this card."
      );
    }

    if (card.favorite) {
      return message.reply(
        "⭐ You cannot give a favorited card."
      );
    }

    await collectionsCol.updateOne(
      {
        _id: card._id
      },
      {
        $set: {
          userId: receiverId,
          favorite: false
        }
      }
    );

    await removeCardFromAlbums(
  db,
  giverId,
  code
);

    message.reply(
      `✅ Gave \`${code}\` to ${target}.`
    );
  }
};