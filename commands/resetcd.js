const connectDB = require("../database");

module.exports = {
  name: "resetcd",

  async execute(message) {

    if (message.author.id !== "859803575995727872") {
      return message.reply("❌ Owner only command.");
    }

    const db = await connectDB();

    await db.collection("daily").deleteMany({});

    await db.collection("cooldowns").deleteMany({
      type: "weekly"
    });

    await message.reply(
      "✅ Daily and Weekly cooldowns have been reset."
    );
  }
};