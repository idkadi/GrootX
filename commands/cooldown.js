const { EmbedBuilder } = require("discord.js");
const connectDB = require("../database");

module.exports = {
  name: "cooldown",
  aliases: ["cd"],

  async execute(message) {
    const db = await connectDB();
    const cooldownsCol = db.collection("cooldowns");

    const userId = message.author.id;
    const now = Date.now();

    function getDiscordTimestamp(timestamp, cooldownTime) {
      const endTime = Math.floor(
        (timestamp + cooldownTime) / 1000
      );

      return `<t:${endTime}:R>`;
    }

    async function getCooldownText(type, cooldownTime) {
      const doc = await cooldownsCol.findOne({
        type,
        userId
      });

      const timestamp = doc?.timestamp;

      if (
        timestamp &&
        now - timestamp < cooldownTime
      ) {
        return getDiscordTimestamp(
          timestamp,
          cooldownTime
        );
      }

      return "✅ Ready";
    }

    async function getDailyCooldownText() {
      const dailyDoc =
        await db.collection("daily").findOne({
          userId
        });

      const timestamp =
        dailyDoc?.timestamp;

      const cooldownTime =
        24 * 60 * 60 * 1000;

      if (
        timestamp &&
        now - timestamp < cooldownTime
      ) {
        return getDiscordTimestamp(
          timestamp,
          cooldownTime
        );
      }

      return "✅ Ready";
    }

    const dropText =
      await getCooldownText(
        "drop",
        8 * 60 * 1000
      );

    const pickupText =
      await getCooldownText(
        "pickup",
        4 * 60 * 1000
      );

    const dailyText =
      await getDailyCooldownText();

    const weeklyText =
      await getCooldownText(
        "weekly",
        7 * 24 * 60 * 60 * 1000
      );

    const voteText =
      await getCooldownText(
        "vote",
        12 * 60 * 60 * 1000
      );

    const embed = new EmbedBuilder()
      .setColor("#00D4FF")
      .setTitle("⌛ COOLDOWNS")
      .setDescription(
`🎴 **Drop:** ${dropText}

🎯 **Claim:** ${pickupText}

🎁 **Daily:** ${dailyText}

📦 **Weekly:** ${weeklyText}

🗳️ **Vote:** ${voteText}`
      )
      .setThumbnail(
        message.author.displayAvatarURL({
          dynamic: true
        })
      );

    await message.reply({
      embeds: [embed]
    });
  }
};