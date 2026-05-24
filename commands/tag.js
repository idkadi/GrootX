const connectDB = require("../database");

module.exports = {
  name: "tag",

  async execute(message, args) {
    if (!args[0]) return message.reply("❌ Provide a card code.");
    if (!args[1]) return message.reply("❌ Provide a tag name.");

    const code = args[0].toLowerCase();
    const tagName = args[1].toLowerCase();

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const createdTagsCol = db.collection("createdtags");
    const cardTagsCol = db.collection("cardtags");

    const userId = message.author.id;

    const card = await collectionsCol.findOne({
      userId,
      code
    });

    if (!card) {
      return message.reply("❌ Card not found.");
    }

    if (tagName === "remove") {
      await cardTagsCol.deleteOne({
        userId,
        code
      });

      return message.reply(`✅ Removed tag from **${code}**`);
    }

    const createdTag = await createdTagsCol.findOne({
      userId,
      name: tagName
    });

    if (!createdTag) {
      return message.reply("❌ That tag does not exist.");
    }

    await cardTagsCol.updateOne(
      {
        userId,
        code
      },
      {
        $set: {
          tagName,
          emoji: createdTag.emoji,
          updatedAt: new Date()
        }
      },
      {
        upsert: true
      }
    );

    return message.reply(
      `✅ Applied ${createdTag.emoji} **${tagName}** to **${code}**`
    );
  }
};