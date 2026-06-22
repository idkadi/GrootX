const connectDB = require("../database");

module.exports = {
  name: "deletetag",
  aliases: ["deltag", "removetag"],

  async execute(message, args) {
    if (!args[0]) {
      return message.reply("❌ Provide a tag name.");
    }

    const tagName = args[0].toLowerCase();

    const db = await connectDB();

    const createdTagsCol = db.collection("createdtags");
    const collectionsCol = db.collection("collections");

    const userId = message.author.id;

    const existingTag = await createdTagsCol.findOne({
      userId,
      name: tagName
    });

    if (!existingTag) {
      return message.reply("❌ That tag does not exist.");
    }

    await createdTagsCol.deleteOne({
      userId,
      name: tagName
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

    return message.reply(`✅ Deleted tag **${tagName}**`);
  }
};