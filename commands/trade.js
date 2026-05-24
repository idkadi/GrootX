const connectDB = require("../database");

module.exports = {
  name: "trade",

  async execute(message) {
    const target =
      message.mentions.users.first();

    if (!target) {
      return message.reply(
        "❌ Mention a user to trade with."
      );
    }

    if (
      target.id === message.author.id
    ) {
      return message.reply(
        "❌ You cannot trade with yourself."
      );
    }

    const db =
      await connectDB();

    const tradesCol =
      db.collection("trades");

    const tradePassesCol =
      db.collection("tradePasses");

    const authorPass =
      await tradePassesCol.findOne({
        userId: message.author.id
      });

    const targetPass =
      await tradePassesCol.findOne({
        userId: target.id
      });

    if (
      !authorPass ||
      authorPass.expiresAt <= Date.now()
    ) {

      return message.reply(
        "❌ You need an active Trade Voucher."
      );

    }

    if (
      !targetPass ||
      targetPass.expiresAt <= Date.now()
    ) {

      return message.reply(
        "❌ That user does not have an active Trade Voucher."
      );

    }

    const alreadyTrading =
      await tradesCol.findOne({

        users: {
          $in: [
            message.author.id,
            target.id
          ]
        }

      });

    if (alreadyTrading) {

      return message.reply(

        "❌ One of the users is already in a trade."

      );

    }

    const tradeId =
      `${message.author.id}_${target.id}`;

    await tradesCol.insertOne({

      tradeId,

      users: [
        message.author.id,
        target.id
      ],

      offers: {

        [message.author.id]: {

          cards: [],
          coins: 0

        },

        [target.id]: {

          cards: [],
          coins: 0

        }

      },

      confirmed: {

        [message.author.id]:
          false,

        [target.id]:
          false

      }

    });

    message.reply(

      `🤝 Trade started between ` +

      `${message.author} and ${target}.\n\n` +

      `Use:\n` +

      "`!addcard code`\n" +

      "`!addcoins amount`\n" +

      "`!confirmtrade`\n" +

      "`!canceltrade`"

    );

  }

};