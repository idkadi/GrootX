const connectDB =
  require("../database");

module.exports = {

  name: "removecard",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(

        "❌ Provide a GX code.\n\n" +

        "Example:\n" +

        "`!removecard GX-000001`"

      );

    }

    const code =
      args[0]
        .toLowerCase();

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

    const index =
      trade.offers[userId]
        .cards
        .indexOf(code);

    if (index === -1) {

      return message.reply(

        "❌ That card is not in your trade offer."

      );

    }

    trade.offers[userId]
      .cards
      .splice(index, 1);

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

      `✅ Removed **${code}** from your trade offer.`

    );

  }

};