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

    function formatRemaining(ms) {
      const days = Math.floor(ms / 86400000);
      const hours = Math.floor((ms % 86400000) / 3600000);
      const minutes = Math.floor((ms % 3600000) / 60000);

      if (days > 0) {
        return `in ${days} day${days > 1 ? "s" : ""}`;
      }

      if (hours > 0) {
        return `in ${hours} hour${hours > 1 ? "s" : ""}`;
      }

      if (minutes > 0) {
        return `in ${minutes} minute${minutes > 1 ? "s" : ""}`;
      }

      return "Ready";
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
        const remaining =
          cooldownTime - (now - timestamp);

        return formatRemaining(remaining);
      }

      return "Ready";
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
        const remaining =
          cooldownTime - (now - timestamp);

        return formatRemaining(remaining);
      }

      return "Ready";
    }

    const dropText =
      await getCooldownText(
        "drop",
        8 * 60 * 1000
      );

    const pickupText =
      await getCooldownText(
        "pickup",
        5 * 60 * 1000
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
`🎴 **Drop :** ${dropText}

🎁 **Daily :** ${dailyText}

📦 **Weekly :** ${weeklyText}

🗳️ **Vote :** ${voteText}

🎯 **Pickup :** ${pickupText}`
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