const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "remind",
  aliases: ["reminder"],

  async execute(message, args) {

    const db =
      await connectDB();

    const remindersCol =
      db.collection("reminders");

    const userId =
      message.author.id;

    const type =
      args[0]?.toLowerCase();

    const status =
      args[1]?.toLowerCase();

    const allowedTypes =
      [
        "drop",
        "pickup",
        "daily",
        "weekly",
        "vote"
      ];

    if (
      !type ||
      !status ||
      !allowedTypes.includes(type) ||
      !["on", "off"].includes(status)
    ) {
      return message.reply(
        "❌ Usage: `!remind <drop/pickup/daily/weekly/vote> <on/off>`"
      );
    }

    await remindersCol.updateOne(
      {
        userId,
        type
      },
      {
        $set: {
          userId,
          type,
          enabled: status === "on"
        }
      },
      {
        upsert: true
      }
    );

    const embed =
      new EmbedBuilder()
        .setColor(
          status === "on"
            ? 0x22c55e
            : 0xef4444
        )
        .setTitle("🔔 Reminder Updated")
        .setDescription(
          `Your **${type}** reminder is now **${status.toUpperCase()}**.`
        )
        .setFooter({
          text:
            status === "on"
              ? "I will DM you whenever this cooldown is over."
              : "You will no longer receive DMs for this cooldown."
        })
        .setTimestamp();

    await message.reply({
      embeds: [embed]
    });

  }

};