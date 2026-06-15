const { EmbedBuilder } = require("discord.js");
const connectDB = require("../database");
const { getRank, getRankEmoji } = require("../utils/ranks");

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

module.exports = {
  name: "leaderboard",
  aliases: ["lb", "ranklb"],

  async execute(message) {
    const db = await connectDB();
    const rankedCol = db.collection("rankedProfiles");

    const topPlayers = await rankedCol
      .find({})
      .sort({ trophies: -1, wins: -1 })
      .limit(10)
      .toArray();

    if (!topPlayers.length) {
      return message.reply("No ranked players yet. Start battling first!");
    }

    let description = "";

    for (let i = 0; i < topPlayers.length; i++) {
      const player = topPlayers[i];
      const rank = getRank(player.trophies);

      let username = `<@${player.userId}>`;

      description +=
        `**#${i + 1}** ${getRankEmoji(rank.name)} ${username}\n` +
        `🏆 **${formatNumber(player.trophies)}** trophies • ${rank.name}\n\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(0xfacc15)
      .setTitle("🏆 GrootX Ranked Leaderboard")
      .setDescription(description)
      .setFooter({
        text: "Top 10 ranked players"
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};