const connectDB =
  require("../database");

module.exports = {

  name: "createtag",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(
        "❌ Provide a tag name."
      );

    }

    if (!args[1]) {

      return message.reply(
        "❌ Provide a tag emoji."
      );

    }

    const tagName =
      args[0]
        .toLowerCase();

    const emoji =
      args[1];

    const db =
      await connectDB();

    const tagsCol =
      db.collection("tags");

    const userId =
      message.author.id;

    const existing =
      await tagsCol.findOne({

        userId,

        tag: tagName

      });

    if (existing) {

      return message.reply(
        "❌ Tag already exists."
      );

    }

    await tagsCol.insertOne({

      userId,

      tag:
        tagName,

      emoji,

      cardCode: null

    });

    message.reply(

      `✅ Created tag ` +

      `**${tagName}** ${emoji}`

    );

  }

};