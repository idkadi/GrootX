const connectDB =
  require("../database");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

module.exports = {

  name: "confirmtrade",

  async execute(message) {

    const db =
      await connectDB();

    const tradesCol =
      db.collection("trades");

    const collectionsCol =
      db.collection("collections");

    const balancesCol =
      db.collection("balances");

    const inventoryCol =
      db.collection("inventory");

    const userId =
      message.author.id;

    const trade =
      await tradesCol.findOne({
        users: userId
      });

    if (!trade) {
      return message.reply(
        "❌ You are not in an active trade."
      );
    }

    trade.confirmed[userId] = true;

    await tradesCol.updateOne(
      { _id: trade._id },
      {
        $set: {
          confirmed: trade.confirmed
        }
      }
    );

    const user1 = trade.users[0];
    const user2 = trade.users[1];

    if (
      !trade.confirmed[user1] ||
      !trade.confirmed[user2]
    ) {
      return message.reply(
        "✅ Trade confirmed.\n" +
        "Waiting for the other user."
      );
    }

    const offer1 = trade.offers[user1];
    const offer2 = trade.offers[user2];

    // USER1 -> USER2 CARDS
    for (const code of offer1.cards || []) {
      await collectionsCol.updateOne(
        {
          userId: user1,
          code
        },
        {
          $set: {
            userId: user2,
            favorite: false
          }
        }
      );

      await removeCardFromAlbums(
        db,
        user1,
        code
      );
    }

    // USER2 -> USER1 CARDS
    for (const code of offer2.cards || []) {
      await collectionsCol.updateOne(
        {
          userId: user2,
          code
        },
        {
          $set: {
            userId: user1,
            favorite: false
          }
        }
      );

      await removeCardFromAlbums(
        db,
        user2,
        code
      );
    }

    // USER1 -> USER2 COINS
    if ((offer1.coins || 0) > 0) {
      await balancesCol.updateOne(
        { userId: user1 },
        {
          $inc: {
            coins: -offer1.coins
          }
        },
        { upsert: true }
      );

      await balancesCol.updateOne(
        { userId: user2 },
        {
          $inc: {
            coins: offer1.coins
          }
        },
        { upsert: true }
      );
    }

    // USER2 -> USER1 COINS
    if ((offer2.coins || 0) > 0) {
      await balancesCol.updateOne(
        { userId: user2 },
        {
          $inc: {
            coins: -offer2.coins
          }
        },
        { upsert: true }
      );

      await balancesCol.updateOne(
        { userId: user1 },
        {
          $inc: {
            coins: offer2.coins
          }
        },
        { upsert: true }
      );
    }

    // USER1 -> USER2 ITEMS
    if (offer1.items) {
      for (const [item, amount] of Object.entries(offer1.items)) {
        if (amount <= 0) continue;

        await inventoryCol.updateOne(
          { userId: user1 },
          {
            $inc: {
              [`items.${item}`]: -amount
            }
          },
          { upsert: true }
        );

        await inventoryCol.updateOne(
          { userId: user2 },
          {
            $inc: {
              [`items.${item}`]: amount
            }
          },
          { upsert: true }
        );
      }
    }

    // USER2 -> USER1 ITEMS
    if (offer2.items) {
      for (const [item, amount] of Object.entries(offer2.items)) {
        if (amount <= 0) continue;

        await inventoryCol.updateOne(
          { userId: user2 },
          {
            $inc: {
              [`items.${item}`]: -amount
            }
          },
          { upsert: true }
        );

        await inventoryCol.updateOne(
          { userId: user1 },
          {
            $inc: {
              [`items.${item}`]: amount
            }
          },
          { upsert: true }
        );
      }
    }

    await tradesCol.deleteOne({
      _id: trade._id
    });

    message.reply(
      "🤝 Trade completed successfully!"
    );

  }

};