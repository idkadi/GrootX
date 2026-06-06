const connectDB = require("../database");

module.exports = {
  name: "wipedecks",

  async execute(message) {
    if (message.author.id !== "YOUR_DISCORD_ID") {
      return message.reply("❌ Owner only.");
    }

    const db = await connectDB();

    const result = await db.collection("decks").deleteMany({});

    return message.reply(
      `✅ Deleted ${result.deletedCount} battle decks.`
    );
  }
};