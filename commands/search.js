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
  name: "search",
  aliases: ["s"],

  async execute(message, args) {
    if (!args.length) {
      return message.reply(
        "❌ Provide a search.\n\n" +
        "**Examples:**\n" +
        "`!search n: iron man`\n" +
        "`!search s: daredevil`\n" +
        "`!search t: burn`"
      );
    }

    const fullQuery = args.join(" ");
    const userId = message.author.id;

    let searchType;
    let searchValue;

    if (fullQuery.toLowerCase().startsWith("n:")) {
      searchType = "name";
      searchValue = fullQuery.slice(2).trim().toLowerCase();
    } else if (fullQuery.toLowerCase().startsWith("s:")) {
      searchType = "show";
      searchValue = fullQuery.slice(2).trim().toLowerCase();
    } else if (fullQuery.toLowerCase().startsWith("t:")) {
      searchType = "tag";
      searchValue = fullQuery.slice(2).trim().toLowerCase();
    } else {
      return message.reply(
        "❌ Invalid search type.\n\n" +
        "**Use:**\n" +
        "`n:` = name\n" +
        "`s:` = series\n" +
        "`t:` = tag"
      );
    }

    const db = await connectDB();
    const collectionsCol = db.collection("collections");

    const userCollection = await collectionsCol
      .find({ userId })
      .toArray();

    const matchingCards = userCollection.filter(entry => {
      const card = cards.find(
        c => Number(c.id) === Number(entry.cardId)
      );

      if (!card) return false;

      if (searchType === "name") {
        return card.name.toLowerCase().includes(searchValue);
      }

      if (searchType === "show") {
        const series = (card.show || card.appearance || "")
          .toLowerCase()
          .replace(/\s+/g, "");

        return series.includes(
          searchValue.replace(/\s+/g, "")
        );
      }

      if (searchType === "tag") {
        return (
          entry.tag &&
          entry.tag.toLowerCase() === searchValue
        );
      }

      return false;
    });

    if (matchingCards.length === 0) {
      return message.reply(
        `❌ No cards found for:\n\`${searchValue}\``
      );
    }

    let page = 0;

    const totalPages = Math.ceil(
      matchingCards.length / CARDS_PER_PAGE
    );

    function createEmbed() {
      const start = page * CARDS_PER_PAGE;
      const end = start + CARDS_PER_PAGE;

      const currentCards = matchingCards.slice(start, end);

      const results = currentCards.map(entry => {
        const card = cards.find(
          c => Number(c.id) === Number(entry.cardId)
        );

        const emoji = rarityEmojis[card.tier] || "🎴";

        const tagText = entry.tag
          ? `🏷️ ${entry.tag} • `
          : "";

        return (
          `🔹 ${tagText}` +
          `\`${entry.code}\` • ` +
          `${emoji} ` +
          `#${entry.serial} ` +
          `**${card.name}** ` +
          `• ${card.show || card.appearance}`
        );
      });

      return new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle("🔎 Search Results")
        .setDescription(
          `Search:\n\`${searchValue}\`\n\n` +
          results.join("\n")
        )
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `${matchingCards.length} card(s) found`
        })
        .setTimestamp();
    }

    function getButtons() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("search_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),

        new ButtonBuilder()
          .setCustomId("search_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      );
    }

    const msg = await message.reply({
      embeds: [createEmbed()],
      components: totalPages > 1 ? [getButtons()] : []
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      time: 60000
    });

    collector.on("collect", async interaction => {
      collector.resetTimer();

      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This is not your search menu.",
          ephemeral: true
        });
      }

      if (interaction.customId === "search_next") page++;
      if (interaction.customId === "search_prev") page--;

      await interaction.update({
        embeds: [createEmbed()],
        components: [getButtons()]
      });
    });
  }
};