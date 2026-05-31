const connectDB = require("../database");

module.exports = {
  name: "wipecards",

  async execute(message) {

    // YOUR OWNER ID HERE
    if (message.author.id !== "859803575995727872") {
      return message.reply("❌ Owner only command.");
    }

    const db = await connectDB();

    await db.collection("collections").deleteMany({});
    await db.collection("serials").deleteMany({});

    await db.collection("albums").deleteMany({});
    await db.collection("albumPages").deleteMany({});
    await db.collection("albumSlots").deleteMany({});

    // Only if these collections exist
    await db.collection("albumBackgrounds").deleteMany({});
    await db.collection("albumLayouts").deleteMany({});

    await message.reply(
      "✅ Wipe completed.\n" +
      "🎴 Collections cleared\n" +
      "🔢 Serials reset\n" +
      "📚 Albums deleted\n" +
      "🖼️ Album backgrounds/layouts removed\n\n" +
      "💰 Coins preserved\n" +
      "🎫 Ultron Chips preserved\n" +
      "🎒 Inventory preserved"
    );
  }
};