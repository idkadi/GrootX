const connectDB = require("../database");

module.exports = {
  name: "tradepass",

  async execute(message) {
    const db = await connectDB();

    const tradePassesCol =
      db.collection("tradePasses");

    const data =
      await tradePassesCol.findOne({
        userId: message.author.id
      });

    if (!data) {
      return message.reply(
        "❌ You do not own a Trade Voucher."
      );
    }

    const remaining =
      data.expiresAt - Date.now();

    if (remaining <= 0) {
      return message.reply(
        "❌ Your Trade Voucher expired."
      );
    }

    const days = Math.floor(
      remaining /
      (1000 * 60 * 60 * 24)
    );

    message.reply(
      `🎟️ Trade Voucher active for ${days} more day(s).`
    );
  }
};