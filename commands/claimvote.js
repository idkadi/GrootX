const { EmbedBuilder } = require("discord.js");
const Topgg = require("@top-gg/sdk");

const connectDB = require("../database");

const api = new Topgg.Api(process.env.TOPGG_TOKEN);

module.exports = {
  name: "claimvote",
  aliases: ["cv"],

  async execute(message) {
    const userId = message.author.id;

    try {
      const voted = await api.hasVoted(userId);

      if (!voted) {
        return message.reply(
          "❌ You haven't voted yet.\nUse `!vote` first."
        );
      }

      const db = await connectDB();

      const balancesCol = db.collection("balances");
      const cooldownsCol = db.collection("cooldowns");

      const now = Date.now();
      const cooldown = 12 * 60 * 60 * 1000;

      const lastClaim = await cooldownsCol.findOne({
        type: "vote",
        userId
      });

      if (
        lastClaim &&
        now - lastClaim.timestamp < cooldown
      ) {
        return message.reply(
          "⏳ You already claimed your vote reward.\nCome back after your next vote."
        );
      }

      await balancesCol.updateOne(
        { userId },
        {
          $inc: {
            coins: 700,
            ultronChips: 1
          }
        },
        { upsert: true }
      );

      await cooldownsCol.updateOne(
        {
          type: "vote",
          userId
        },
        {
          $set: {
            timestamp: now
          }
        },
        { upsert: true }
      );

      const embed = new EmbedBuilder()
        .setColor(0x00ff99)
        .setTitle("🗳️ Vote Reward Claimed")
        .setDescription(
          "Thank you for voting for GrootX!\n\n" +
          "<:grootcoin:1504742213110861834> **700 Coins**\n" +
          "🎫 **1 Ultron Chip**"
        )
        .setTimestamp();

      return message.reply({
        embeds: [embed]
      });

    } catch (err) {
      console.error(err);

      return message.reply(
        "❌ Failed to verify your vote. Try again later."
      );
    }
  }
};