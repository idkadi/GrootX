const connectDB =
  require("../database");

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

    trade.confirmed[userId] =
      true;

    await tradesCol.updateOne(

      {
        _id:
          trade._id
      },

      {
        $set: {
          confirmed:
            trade.confirmed
        }
      }

    );

    const user1 =
      trade.users[0];

    const user2 =
      trade.users[1];

    if (

      !trade.confirmed[user1] ||

      !trade.confirmed[user2]

    ) {

      return message.reply(

        "✅ Trade confirmed.\n" +

        "Waiting for the other user."

      );

    }

    const offer1 =
      trade.offers[user1];

    const offer2 =
      trade.offers[user2];

    // ===== USER1 -> USER2 =====

    for (const code of offer1.cards) {

      await collectionsCol.updateOne(

        {
          userId: user1,
          code
        },

        {
          $set: {

            userId:
              user2,

            favorite:
              false

          }
        }

      );

    }

    // ===== USER2 -> USER1 =====

    for (const code of offer2.cards) {

      await collectionsCol.updateOne(

        {
          userId: user2,
          code
        },

        {
          $set: {

            userId:
              user1,

            favorite:
              false

          }
        }

      );

    }

    // ===== COINS =====

    if (
      offer1.coins > 0
    ) {

      await balancesCol.updateOne(

        {
          userId:
            user1
        },

        {
          $inc: {
            coins:
              -offer1.coins
          }
        },

        {
          upsert: true
        }

      );

      await balancesCol.updateOne(

        {
          userId:
            user2
        },

        {
          $inc: {
            coins:
              offer1.coins
          }
        },

        {
          upsert: true
        }

      );

    }

    if (
      offer2.coins > 0
    ) {

      await balancesCol.updateOne(

        {
          userId:
            user2
        },

        {
          $inc: {
            coins:
              -offer2.coins
          }
        },

        {
          upsert: true
        }

      );

      await balancesCol.updateOne(

        {
          userId:
            user1
        },

        {
          $inc: {
            coins:
              offer2.coins
          }
        },

        {
          upsert: true
        }

      );

    }

    await tradesCol.deleteOne({

      _id:
        trade._id

    });

    message.reply(

      "🤝 Trade completed successfully!"

    );

  }

};