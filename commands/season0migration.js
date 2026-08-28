const connectDB = require("../database");

module.exports = {
  name: "season0migration",
  aliases: ["migrates0"],

  async execute(message, args) {
    try {
      // Fetch the bot application's owner automatically
      await message.client.application.fetch();

      const applicationOwner = message.client.application.owner;

      const isOwner =
        applicationOwner?.id === message.author.id ||
        applicationOwner?.members?.some(
          member => member.id === message.author.id
        );

      if (!isOwner) {
        return message.reply(
          "❌ Only the bot owner can run this command."
        );
      }

      if (args?.[0]?.toLowerCase() !== "confirm") {
        return message.reply(
          "⚠️ This will mark all existing owned cards and serial counters " +
          "as **Season 0**.\n\n" +
          "Run `season0migration confirm` to continue."
        );
      }

      const db = await connectDB();

      const collectionsCol = db.collection("collections");
      const serialsCol = db.collection("serials");

      const [cardsResult, serialsResult] = await Promise.all([
        collectionsCol.updateMany(
          { season: { $exists: false } },
          { $set: { season: 0 } }
        ),

        serialsCol.updateMany(
          { season: { $exists: false } },
          { $set: { season: 0 } }
        )
      ]);

      return message.reply(
        "✅ **Season 0 migration completed!**\n\n" +
        `🎴 Owned cards updated: **${cardsResult.modifiedCount}**\n` +
        `🔢 Serial counters updated: **${serialsResult.modifiedCount}**\n\n` +
        "Existing cards are now officially Season 0. " +
        "You can remove this temporary command file."
      );
    } catch (error) {
      console.error("Season 0 migration failed:", error);

      return message.reply(
        "❌ Season 0 migration failed. Check the bot console for details."
      );
    }
  }
};