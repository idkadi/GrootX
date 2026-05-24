const connectDB =
  require("../database");

module.exports = {

  name: "deletetag",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(
        "❌ Provide a tag name."
      );

    }

    const tagName =
      args[0]
        .toLowerCase();

    const db =
      await connectDB();

    const tagsCol =
      db.collection("tags");

    const collectionsCol =
      db.collection("collections");

    const userId =
      message.author.id;

    const existingTag =
      await tagsCol.findOne({

        userId,

        tag: tagName

      });

    if (!existingTag) {

      return message.reply(

        "❌ That tag does not exist."

      );

    }

    await tagsCol.deleteMany({

      userId,

      tag: tagName

    });

    await collectionsCol.updateMany(

      {

        userId,

        tag: tagName

      },

      {

        $set: {
          tag: null
        }

      }

    );

    message.reply(

      `✅ Deleted tag ` +

      `**${tagName}**`

    );

  }

};