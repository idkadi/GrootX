const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "cooldown",
  aliases: ["cd"],

  async execute(message) {

    const db =
      await connectDB();

    const cooldownsCol =
      db.collection("cooldowns");

    const userId =
      message.author.id;

    const now =
      Date.now();

    async function getCooldownText(type, cooldownTime) {

      const doc =
        await cooldownsCol.findOne({
          type,
          userId
        });

      const timestamp =
        doc?.timestamp;

      if (
        timestamp &&
        now - timestamp < cooldownTime
      ) {

        const remaining =
          cooldownTime -
          (now - timestamp);

        const hours =
          Math.floor(
            remaining / 3600000
          );

        const minutes =
          Math.floor(
            (remaining % 3600000) /
            60000
          );

        const seconds =
          Math.floor(
            (remaining % 60000) /
            1000
          );

        if (hours > 0) {
          return `⏳ ${hours}h ${minutes}m ${seconds}s`;
        }

        return `⏳ ${minutes}m ${seconds}s`;

      }

      return "✅ Ready";

    }

    // Drop
    const dropText =
      await getCooldownText(
        "drop",
        8 * 60 * 1000
      );

    // Pickup
    const pickupText =
      await getCooldownText(
        "pickup",
        5 * 60 * 1000
      );

    // Daily (separate collection)
    let dailyText =
      "✅ Ready";

    const dailyDoc =
      await db.collection("daily")
        .findOne({ userId });

    if (dailyDoc?.timestamp) {

      const remaining =
        (24 * 60 * 60 * 1000) -
        (now - dailyDoc.timestamp);

      if (remaining > 0) {

        const hours =
          Math.floor(
            remaining / 3600000
          );

        const minutes =
          Math.floor(
            (remaining % 3600000) /
            60000
          );

        const seconds =
          Math.floor(
            (remaining % 60000) /
            1000
          );

        dailyText =
          `⏳ ${hours}h ${minutes}m ${seconds}s`;

      }

    }

    // Weekly (separate collection)
    let weeklyText =
      "✅ Ready";

    const weeklyDoc =
      await db.collection("weekly")
        .findOne({ userId });

    if (weeklyDoc?.timestamp) {

      const remaining =
        (7 * 24 * 60 * 60 * 1000) -
        (now - weeklyDoc.timestamp);

      if (remaining > 0) {

        const days =
          Math.floor(
            remaining / 86400000
          );

        const hours =
          Math.floor(
            (remaining % 86400000) /
            3600000
          );

        weeklyText =
          `⏳ ${days}d ${hours}h`;

      }

    }

    // Vote
    const voteText =
      await getCooldownText(
        "vote",
        12 * 60 * 60 * 1000
      );

    const embed =
      new EmbedBuilder()

        .setColor(0x8b5cf6)

        .setTitle(
          "⏱️ Cooldowns"
        )

        .addFields(

          {
            name: "🎴 Drop Cooldown",
            value: dropText,
            inline: false
          },

          {
            name: "🎯 Pickup Cooldown",
            value: pickupText,
            inline: false
          },

          {
            name: "🎁 Daily Cooldown",
            value: dailyText,
            inline: false
          },

          {
            name: "📦 Weekly Cooldown",
            value: weeklyText,
            inline: false
          },

          {
            name: "🗳️ Vote Cooldown",
            value: voteText,
            inline: false
          }

        )

        .setFooter({
          text:
            "GrootX Cooldown System"
        })

        .setTimestamp();

    await message.reply({
      embeds: [embed]
    });

  }

};