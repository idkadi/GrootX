const connectDB = require("../database");

module.exports = {
  name: "wipedecks",

  async execute(message) {
    if (message.author.id !== "859803575995727872") {
      return message.reply("❌ Owner only.");
    }

    const db = await connectDB();

    const result = await db.collection("decks").deleteMany({});

    return message.reply(
      `✅ Deleted ${result.deletedCount} battle decks.`
    );
  }
};