const { EmbedBuilder } = require("discord.js");
const connectDB = require("../database");

const {
  getRank,
  getNextRank,
  getRankEmoji
} = require("../utils/ranks");

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

module.exports = {
  name: "rank",
  aliases: ["r"],

  async execute(message) {
    const target =
      message.mentions.users.first() || message.author;

    const db = await connectDB();
    const rankedCol = db.collection("rankedProfiles");

    let profile = await rankedCol.findOne({
      userId: target.id
    });

    if (!profile) {
      profile = {
        userId: target.id,
        trophies: 0,
        wins: 0,
        losses: 0,
        streak: 0,
        highestTrophies: 0,
        rewardsClaimed: []
      };

      await rankedCol.insertOne(profile);
    }

    const rank = getRank(profile.trophies);
    const nextRank = getNextRank(profile.trophies);

    const totalGames =
      Number(profile.wins || 0) + Number(profile.losses || 0);

    const winRate =
      totalGames > 0
        ? Math.round((profile.wins / totalGames) * 100)
        : 0;

    const nextText = nextRank
      ? `${getRankEmoji(nextRank.name)} **${nextRank.name}** at **${formatNumber(nextRank.min)}** trophies\n` +
        `Need **${formatNumber(nextRank.min - profile.trophies)}** more trophies.`
      : `You are at the highest rank.`;

    const embed = new EmbedBuilder()
      .setColor(0xfacc15)
      .setTitle(`${getRankEmoji(rank.name)} ${target.username}'s Ranked Profile`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(
        `**Current Rank:** ${getRankEmoji(rank.name)} **${rank.name}**\n` +
        `**Trophies:** 🏆 **${formatNumber(profile.trophies)}**\n` +
        `**Peak Trophies:** ⭐ **${formatNumber(profile.highestTrophies || profile.trophies)}**`
      )
      .addFields(
        {
          name: "📊 Battle Stats",
          value:
            `✅ **Wins:** ${formatNumber(profile.wins)}\n` +
            `❌ **Losses:** ${formatNumber(profile.losses)}\n` +
            `🔥 **Current Streak:** ${formatNumber(profile.streak)}\n` +
            `📈 **Win Rate:** ${winRate}%`,
          inline: true
        },
        {
          name: "🎯 Next Rank",
          value: nextText,
          inline: true
        }
      )
      .setFooter({
        text: "GrootX Ranked Battle"
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};