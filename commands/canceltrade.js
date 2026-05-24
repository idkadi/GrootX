const connectDB =
  require("../database");

module.exports = {

  name: "canceltrade",

  aliases: ["ct"],

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

    const otherUser =
      trade.users.find(
        id => id !== userId
      );

    await tradesCol.deleteOne({

      _id:
        trade._id

    });

    message.reply(

      `❌ Trade between ` +

      `<@${userId}> and ` +

      `<@${otherUser}> has been cancelled.`

    );

  }

};