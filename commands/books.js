const {
  EmbedBuilder
} = require("discord.js");

const cards = require("../data/cards");
const connectDB = require("../database");

module.exports = {
  name: "books",
  aliases: ["book"],

  async execute(message) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");

    const userId = message.author.id;

    const userCards = await collectionsCol
      .find({ userId })
      .toArray();

    const ownedCardIds = new Set(
      userCards.map(card => Number(card.cardId))
    );

    const seriesMap = {};

    for (const card of cards) {
      const series =
        card.show ||
        card.appearance ||
        "Unknown";

      if (!seriesMap[series]) {
        seriesMap[series] = {
          total: 0,
          owned: 0
        };
      }

      seriesMap[series].total++;

      if (ownedCardIds.has(Number(card.id))) {
        seriesMap[series].owned++;
      }
    }

    const sortedSeries = Object.entries(seriesMap)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const description = sortedSeries
      .map(([series, data], index) => {
        const complete = data.owned === data.total;

        return (
          `${complete ? "✅" : "☐"} ` +
          `**${index + 1}. ${series}** ` +
          `(${data.owned}/${data.total})`
        );
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle(`📚 ${message.author.username}'s Books`)
      .setDescription(description || "No series found.")
      .setFooter({
        text: "✅ means you own every card from that series."
      })
      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });
  }
};