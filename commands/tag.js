const connectDB = require("../database");

module.exports = {
  name: "tag",

  async execute(message, args) {

    if (!args[0]) {
      return message.reply(
        "❌ Provide a card code."
      );
    }

    if (!args[1]) {
      return message.reply(
        "❌ Provide a tag name."
      );
    }

    const code =
      args[0].toLowerCase();

    const tagName =
      args[1].toLowerCase();

    const db =
      await connectDB();

    const collectionsCol =
      db.collection("collections");

    const tagsCol =
      db.collection("tags");

    const userTagsCol =
      db.collection("usertags");

    const userId =
      message.author.id;

    const card =
      await collectionsCol.findOne({
        userId,
        code
      });

    if (!card) {

      return message.reply(
        "❌ Card not found."
      );

    }

    if (tagName === "remove") {

      await collectionsCol.updateOne(
        {
          _id: card._id
        },
        {
          $set: {
            tag: null
          }
        }
      );

      await tagsCol.deleteOne({
        userId,
        cardCode: code
      });

      return message.reply(
        `✅ Removed tag from **${code}**`
      );

    }

    const existingTag =
      await userTagsCol.findOne({

        userId,
        name: tagName

      });

    if (!existingTag) {

      return message.reply(
        "❌ That tag does not exist."
      );

    }

    const emoji =
      existingTag.emoji;

    await collectionsCol.updateOne(
      {
        _id: card._id
      },
      {
        $set: {
          tag: emoji
        }
      }
    );

    await tagsCol.updateOne(
      {
        userId,
        cardCode: code
      },
      {
        $set: {
          tag: emoji
        }
      },
      {
        upsert: true
      }
    );

    return message.reply(
      `✅ Applied ${emoji} to **${code}**`
    );

  }
};