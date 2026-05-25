const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const connectDB = require("../database");

function getTierEmoji(tier) {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

module.exports = {
  name: "collection",
  aliases: ["col"],

  async execute(message, args) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const cardTagsCol = db.collection("cardtags");

    const userId = message.author.id;

    let userCards = await collectionsCol
      .find({ userId })
      .sort({ _id: -1 })
      .toArray();

    if (!userCards || userCards.length === 0) {
      return message.reply("❌ Your collection is empty.");
    }

    const userTagsDocs = await cardTagsCol
      .find({ userId })
      .toArray();

    const userTags = {};

    for (const tag of userTagsDocs) {
      userTags[String(tag.code).toLowerCase()] = tag.emoji;
    }

    const validTiers = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary"
    ];

    let filteredCards = [...userCards];

    if (args[0]) {
      const tier = args[0].toLowerCase();

      if (validTiers.includes(tier)) {
        filteredCards = userCards.filter(entry => {
          const card = cards.find(
            c => Number(c.id) === Number(entry.cardId)
          );

          return card && card.tier === tier;
        });
      }
    }

    if (filteredCards.length === 0) {
      return message.reply("❌ No cards found.");
    }

    const perPage = 10;
    let page = 0;
    let currentSort = "latest";

    function applySort(sortType) {
      currentSort = sortType;

      switch (sortType) {
        case "latest":
          filteredCards.sort((a, b) =>
            b._id.toString().localeCompare(
              a._id.toString()
            )
          );
          break;

        case "name":
          filteredCards.sort((a, b) => {
            const cardA = cards.find(
              c => Number(c.id) === Number(a.cardId)
            );

            const cardB = cards.find(
              c => Number(c.id) === Number(b.cardId)
            );

            return (cardA?.name || "").localeCompare(
              cardB?.name || ""
            );
          });
          break;

        case "serial_low":
          filteredCards.sort((a, b) =>
            a.serial - b.serial
          );
          break;

        case "serial_high":
          filteredCards.sort((a, b) =>
            b.serial - a.serial
          );
          break;

        case "tag":
          filteredCards.sort((a, b) => {
            const tagA =
              userTags[String(a.code).toLowerCase()] || "";

            const tagB =
              userTags[String(b.code).toLowerCase()] || "";

            return tagA.localeCompare(tagB);
          });
          break;
      }
    }

    applySort("latest");

    function getTotalPages() {
      return Math.ceil(filteredCards.length / perPage);
    }

    function generateEmbed() {
      const totalPages = getTotalPages();

      const start = page * perPage;
      const end = start + perPage;

      const currentCards = filteredCards.slice(start, end);

      const description = currentCards.map(entry => {
        const card = cards.find(
          c => Number(c.id) === Number(entry.cardId)
        );

        if (!card) return "❌ Unknown Card";

        const savedTag =
          userTags[String(entry.code).toLowerCase()];

        const tagText = savedTag
          ? `${savedTag} • `
          : "";

        return (
          `🔹 ${tagText}` +
          `\`${entry.code}\` • ` +
          `${getTierEmoji(card.tier)} ` +
          `#${entry.serial} ` +
          `**${card.name}** ` +
          `• ${card.appearance}`
        );
      }).join("\n");

      return new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(`${message.author.username}'s Collection`)
        .setDescription(description || "No cards found.")
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `Total Cards: ${filteredCards.length} • ` +
            `Sort: ${currentSort}`
        })
        .setTimestamp();
    }

    function makeSelectRow() {
      const selectMenu =
        new StringSelectMenuBuilder()
          .setCustomId("col_sort")
          .setPlaceholder("Sort Collection")
          .addOptions([
            {
              label: "Latest",
              value: "latest",
              description: "Newest collected first"
            },
            {
              label: "Name",
              value: "name",
              description: "Sort alphabetically"
            },
            {
              label: "Serial Low",
              value: "serial_low",
              description: "Lowest serial first"
            },
            {
              label: "Serial High",
              value: "serial_high",
              description: "Highest serial first"
            },
            {
              label: "Tag",
              value: "tag",
              description: "Sort by tag"
            }
          ]);

      return new ActionRowBuilder().addComponents(selectMenu);
    }

    function makeButtonRow() {
      const totalPages = getTotalPages();

      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("col_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages <= 1),

        new ButtonBuilder()
          .setCustomId("col_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages <= 1)
      );
    }

    const msg = await message.reply({
      embeds: [generateEmbed()],
      components: [
        makeSelectRow(),
        makeButtonRow()
      ]
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      collector.resetTimer();

      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This is not your collection.",
          ephemeral: true
        });
      }

      if (interaction.customId === "col_sort") {
        applySort(interaction.values[0]);
        page = 0;
      }

      if (interaction.customId === "col_next") {
        page++;
        if (page >= getTotalPages()) page = 0;
      }

      if (interaction.customId === "col_prev") {
        page--;
        if (page < 0) page = getTotalPages() - 1;
      }

      await interaction.update({
        embeds: [generateEmbed()],
        components: [
          makeSelectRow(),
          makeButtonRow()
        ]
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};