const connectDB = require("../database");

const OWNER_ID = "859803575995727872";

module.exports = {
  name: "resettags",

  async execute(message) {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ Only owner can use this.");
    }

    const db = await connectDB();

    await db.collection("tags").deleteMany({});
    await db.collection("createdtags").deleteMany({});
    await db.collection("cardtags").deleteMany({});

    return message.reply("✅ All tag databases cleared.");
  }
};