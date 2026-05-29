const connectDB = require("../database");

const validItems = [
  "space_shard",
  "mind_shard",
  "reality_shard",
  "power_shard",
  "time_shard",
  "soul_shard",

  "space_stone",
  "mind_stone",
  "reality_stone",
  "power_stone",
  "time_stone",
  "soul_stone"
];

function formatItemName(item) {
  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  name: "additem",

  async execute(message, args) {
    const item = args[0]?.toLowerCase();
    const amount = parseInt(args[1]);

    if (!item || !amount) {
      return message.reply(
        "❌ Use: `!additem <item> <amount>`\n" +
        "Example: `!additem power_shard 50`"
      );
    }

    if (!validItems.includes(item)) {
      return message.reply("❌ Invalid item.");
    }

    if (isNaN(amount) || amount <= 0) {
      return message.reply("❌ Invalid amount.");
    }

    const db = await connectDB();

    const tradesCol = db.collection("trades");
    const inventoryCol = db.collection("inventory");

    const userId = message.author.id;

    const trade = await tradesCol.findOne({
      users: userId
    });

    if (!trade) {
      return message.reply(
        "❌ You are not in an active trade."
      );
    }

    const inventoryDoc = await inventoryCol.findOne({
      userId
    });

    const ownedAmount =
      inventoryDoc?.items?.[item] || 0;

    if (ownedAmount < amount) {
      return message.reply(
        `❌ You only have **${ownedAmount} ${formatItemName(item)}**.`
      );
    }

    if (!trade.offers[userId].items) {
      trade.offers[userId].items = {};
    }

    trade.offers[userId].items[item] = amount;

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
      `✅ Added **${amount} ${formatItemName(item)}** to your trade offer.`
    );
  }
};