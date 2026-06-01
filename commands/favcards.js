const cards = require("../data/cards");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");

const rarityEmojis = {
  common: "<:common:1504510702956839033>",
  uncommon: "<:uncommon:1504510929210052698>",
  rare: "<:rare:1504510606718275764>",
  epic: "<:epic:1504510771214680175>",
  legendary: "<:legendary:1504511435974377552>"
};

const CARDS_PER_PAGE = 10;

module.exports = {
  name: "favcards",
  aliases: ["favorites", "favs"],

  async execute(message) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");

    const favoriteCards = await collectionsCol
      .find({
        userId: message.author.id,
        favorite: true
      })
      .toArray();

    if (!favoriteCards.length) {
      return message.reply("❌ You have no favorite cards.");
    }

    let page = 0;
    const totalPages = Math.ceil(
      favoriteCards.length / CARDS_PER_PAGE
    );

    function createEmbed() {
      const start = page * CARDS_PER_PAGE;
      const end = start + CARDS_PER_PAGE;

      const currentCards =
        favoriteCards.slice(start, end);

      const description = currentCards
        .map(entry => {
          const card = cards.find(
            c => Number(c.id) === Number(entry.cardId)
          );

          if (!card) return null;

          const emoji =
            rarityEmojis[card.tier] || "🎴";

          return (
            `⭐ \`${entry.code}\` • ` +
            `${emoji} ` +
            `#${entry.serial} ` +
            `**${card.name}** ` +
            `• ${card.appearance}`
          );
        })
        .filter(Boolean)
        .join("\n");

      return new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(
          `⭐ ${message.author.username}'s Favorite Cards`
        )
        .setDescription(description)
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `${favoriteCards.length} favorite card(s)`
        });
    }

    function getButtons() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("fav_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId("fav_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      );
    }

    const msg = await message.reply({
      embeds: [createEmbed()],
      components:
        totalPages > 1 ? [getButtons()] : []
    });

    if (totalPages <= 1) return;

    const collector =
      msg.createMessageComponentCollector({
        time: 60000
      });

    collector.on("collect", async interaction => {
      if (
        interaction.user.id !== message.author.id
      ) {
        return interaction.reply({
          content:
            "❌ This is not your favorites menu.",
          ephemeral: true
        });
      }

      if (interaction.customId === "fav_next")
        page++;

      if (interaction.customId === "fav_prev")
        page--;

      await interaction.update({
        embeds: [createEmbed()],
        components: [getButtons()]
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};