const connectDB = require("../database");

const OWNER_ID = "YOUR_DISCORD_ID_HERE";

module.exports = {
  name: "resettags",

  async execute(message) {
    if (message.author.id !== 859803575995727872) {
      return message.reply("❌ Only owner can use this.");
    }

    const db = await connectDB();

    await db.collection("tags").deleteMany({});
    await db.collection("createdtags").deleteMany({});
    await db.collection("cardtags").deleteMany({});

    return message.reply("✅ All tag databases cleared.");
  }
};