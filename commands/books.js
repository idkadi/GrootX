const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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
      const originalSeries =
        (card.appearance || "Unknown").trim();

      const normalizedSeries =
        originalSeries.toLowerCase();

      if (!seriesMap[normalizedSeries]) {
        seriesMap[normalizedSeries] = {
          name: originalSeries,
          total: 0,
          owned: 0
        };
      }

      seriesMap[normalizedSeries].total++;

      if (ownedCardIds.has(Number(card.id))) {
        seriesMap[normalizedSeries].owned++;
      }
    }

    const sortedSeries = Object.values(seriesMap)
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );

    const perPage = 12;
    let page = 0;

    const totalPages = Math.ceil(
      sortedSeries.length / perPage
    );

    function generateEmbed() {
      const start = page * perPage;

      const currentSeries = sortedSeries.slice(
        start,
        start + perPage
      );

      const description = currentSeries
        .map((data, index) => {
          const complete = data.owned === data.total;

          return (
            `${complete ? "✅" : "☐"} ` +
            `**${start + index + 1}. ${data.name}** ` +
            `(${data.owned}/${data.total})`
          );
        })
        .join("\n");

      return new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(`📚 ${message.author.username}'s Books`)
        .setDescription(description || "No series found.")
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `Series: ${sortedSeries.length} • ` +
            `✅ = completed`
        })
        .setTimestamp();
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("books_prev")
        .setLabel("⬅️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("books_next")
        .setLabel("➡️")
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({
      embeds: [generateEmbed()],
      components: totalPages > 1 ? [row] : []
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      collector.resetTimer();

      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This is not your books menu.",
          ephemeral: true
        });
      }

      if (interaction.customId === "books_next") {
        page++;
        if (page >= totalPages) page = 0;
      }

      if (interaction.customId === "books_prev") {
        page--;
        if (page < 0) page = totalPages - 1;
      }

      await interaction.update({
        embeds: [generateEmbed()],
        components: [row]
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};