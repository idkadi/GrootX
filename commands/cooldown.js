const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

async function runCooldown(user, target) {
  const isSlash =
    typeof target.isChatInputCommand === "function" &&
    target.isChatInputCommand();

  if (isSlash && !target.deferred && !target.replied) {
    await target.deferReply();
  }

  const reply = payload =>
    isSlash
      ? target.editReply(payload)
      : target.reply(payload);

  try {
    const db = await connectDB();
    const userId = user.id;
    const now = Date.now();
    const cooldowns = db.collection("cooldowns");

    const [
      effect,
      drop,
      pickup,
      daily,
      weekly,
      legacyWeekly,
      vote
    ] = await Promise.all([
      db.collection("stoneeffects").findOne({ userId }),

      cooldowns.findOne({
        userId,
        type: "drop"
      }),

      cooldowns.findOne({
        userId,
        type: "pickup"
      }),

      db.collection("daily").findOne({ userId }),

      db.collection("weekly").findOne({ userId }),

      cooldowns.findOne({
        userId,
        type: "weekly"
      }),

      cooldowns.findOne({
        userId,
        type: "vote"
      })
    ]);

    const timeActive = Number(effect?.timeUntil) > now;

    const dropDuration =
      (timeActive ? 6 : 12) * 60 * 1000;

    const claimDuration =
      (timeActive ? 2 : 4) * 60 * 1000;

    function cooldownText(doc, duration) {
      const timestamp = doc?.timestamp instanceof Date
        ? doc.timestamp.getTime()
        : Number(doc?.timestamp);

      if (
        !Number.isFinite(timestamp) ||
        timestamp <= 0
      ) {
        return "✅ Ready";
      }

      const end = timestamp + duration;

      return end > now
        ? `<t:${Math.ceil(end / 1000)}:R>`
        : "✅ Ready";
    }

    const embed = new EmbedBuilder()
      .setColor("#00D4FF")
      .setTitle("⌛ COOLDOWNS")
      .setDescription(
        [
          `🎴 **Drop:** ${
            cooldownText(drop, dropDuration)
          }`,

          `🎯 **Claim:** ${
            cooldownText(pickup, claimDuration)
          }`,

          `🎁 **Daily:** ${
            cooldownText(
              daily,
              24 * 60 * 60 * 1000
            )
          }`,

          `📦 **Weekly:** ${
            cooldownText(
              weekly || legacyWeekly,
              7 * 24 * 60 * 60 * 1000
            )
          }`,

          `🗳️ **Vote:** ${
            cooldownText(
              vote,
              12 * 60 * 60 * 1000
            )
          }`
        ].join("\n\n")
      )
      .setThumbnail(user.displayAvatarURL())
      .setFooter({
        text: timeActive
          ? "⏳ Time Stone active • Drop: 6 min • Claim: 2 min"
          : "Drop: 12 min • Claim: 4 min • Auto drops: every 90 min"
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error("[COOLDOWN]", error);

    return reply({
      content:
        "❌ Could not load cooldowns. Please try again."
    }).catch(() => {});
  }
}

module.exports = {
  name: "cooldown",
  aliases: ["cd"],

  data: new SlashCommandBuilder()
    .setName("cooldown")
    .setDescription("View your command cooldowns"),

  async execute(context) {
    const isSlash =
      typeof context.isChatInputCommand === "function" &&
      context.isChatInputCommand();

    return runCooldown(
      isSlash ? context.user : context.author,
      context
    );
  },

  async slashExecute(interaction) {
    return runCooldown(
      interaction.user,
      interaction
    );
  },

  async executeSlash(interaction) {
    return runCooldown(
      interaction.user,
      interaction
    );
  }
};