const connectDB =
  require("../database");

module.exports = {

  name: "removecoins",

  async execute(message) {

    const db =
      await connectDB();

    const tradesCol =
      db.collection("trades");

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

    trade.offers[userId]
      .coins = 0;

    trade.confirmed[userId] =
      false;

    const otherUser =
      trade.users.find(
        id => id !== userId
      );

    trade.confirmed[otherUser] =
      false;

    await tradesCol.updateOne(

      {
        _id:
          trade._id
      },

      {
        $set: {

          offers:
            trade.offers,

          confirmed:
            trade.confirmed

        }
      }

    );

    message.reply(

      "✅ Removed coins from your trade offer."

    );

  }

};