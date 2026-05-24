const connectDB = require("../database");

module.exports = {
  name: "createtag",

  async execute(message, args) {
    if (!args[0]) return message.reply("❌ Provide a tag name.");
    if (!args[1]) return message.reply("❌ Provide a tag emoji.");

    const tagName = args[0].toLowerCase();
    const emoji = args[1];

    const db = await connectDB();
    const createdTagsCol = db.collection("createdtags");

    const userId = message.author.id;

    const existing = await createdTagsCol.findOne({
      userId,
      name: tagName
    });

    if (existing) {
      return message.reply("❌ Tag already exists.");
    }

    await createdTagsCol.insertOne({
      userId,
      name: tagName,
      emoji,
      createdAt: new Date()
    });

    return message.reply(`✅ Created tag **${tagName}** ${emoji}`);
  }
};