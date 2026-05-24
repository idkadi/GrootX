const connectDB =
  require("../database");

module.exports = {

  name: "addcoins",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(

        "❌ Provide an amount.\n\n" +

        "Example:\n" +

        "`!addcoins 500`"

      );

    }

    const amount =
      parseInt(args[0]);

    if (

      isNaN(amount) ||
      amount <= 0

    ) {

      return message.reply(

        "❌ Invalid coin amount."

      );

    }

    const db =
      await connectDB();

    const tradesCol =
      db.collection("trades");

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

    const balanceDoc =
      await balancesCol.findOne({
        userId
      });

    const balance =
      balanceDoc?.coins || 0;

    if (balance < amount) {

      return message.reply(

        "❌ You do not have enough coins."

      );

    }

    trade.offers[userId]
      .coins = amount;

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

      `<:grootcoin:1504742213110861834> ` +

      `Added **${amount} coins** ` +

      `to your trade offer.`

    );

  }

};