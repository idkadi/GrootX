const connectDB =
  require("../database");

module.exports = {

  name: "addcard",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(

        "❌ Provide a card code.\n\n" +

        "Example:\n" +

        "`!addcard q7mz2x`"

      );

    }

    const code =
      args[0]
        .toLowerCase();

    const db =
      await connectDB();

    const tradesCol =
      db.collection("trades");

    const collectionsCol =
      db.collection("collections");

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

    const card =
      await collectionsCol.findOne({

        userId,

        code

      });

    if (!card) {

      return message.reply(

        "❌ You do not own this card."

      );

    }

    if (card.favorite) {

      return message.reply(

        "❌ You cannot trade a favorite card."

      );

    }

    const alreadyAdded =
      trade.offers[userId]
        .cards
        .includes(code);

    if (alreadyAdded) {

      return message.reply(

        "❌ This card is already added."

      );

    }

    trade.offers[userId]
      .cards
      .push(code);

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

      `✅ Added \`${code}\` to your trade offer.`

    );

  }

};