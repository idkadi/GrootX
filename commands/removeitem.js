const connectDB = require("../database");

function formatItemName(item) {
  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  name: "removeitem",
  aliases: ["ri"],

  async execute(message, args) {
    const item = args[0]?.toLowerCase();

    if (!item) {
      return message.reply(
        "❌ Use: `!removeitem <item>`\n" +
        "Example: `!removeitem power_shard`"
      );
    }

    const db = await connectDB();

    const tradesCol = db.collection("trades");

    const userId = message.author.id;

    const trade = await tradesCol.findOne({
      users: userId
    });

    if (!trade) {
      return message.reply(
        "❌ You are not in an active trade."
      );
    }

    if (
      !trade.offers[userId].items ||
      !trade.offers[userId].items[item]
    ) {
      return message.reply(
        "❌ That item is not in your trade offer."
      );
    }

    delete trade.offers[userId].items[item];

    trade.confirmed[userId] = false;

    const otherUser = trade.users.find(
      id => id !== userId
    );

    trade.confirmed[otherUser] = false;

    await tradesCol.updateOne(
      {
        _id: trade._id
      },
      {
        $set: {
          offers: trade.offers,
          confirmed: trade.confirmed
        }
      }
    );

    return message.reply(
      `✅ Removed **${formatItemName(item)}** from your trade offer.`
    );
  }
};
