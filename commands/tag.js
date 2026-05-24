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

      await tagsCol.deleteOne({
        userId,
        cardCode: code
      });

      return message.reply(
        `✅ Removed tag from **${code}**`
      );

    }

    // FIND CREATED TAG TEMPLATE
    const existingTag =
      await tagsCol.findOne({

        userId,

        tag: tagName,

        cardCode: null

      });

    if (!existingTag) {

      return message.reply(
        "❌ That tag does not exist."
      );

    }

    // APPLY EMOJI
    await tagsCol.updateOne(

      {
        userId,
        cardCode: code
      },

      {
        $set: {

          tag:
            existingTag.emoji

        }

      },

      {
        upsert: true
      }

    );

    return message.reply(

      `✅ Applied ${existingTag.emoji} to **${code}**`

    );

  }
};