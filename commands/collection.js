const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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
    const tagsCol = db.collection("tags");

    const userId = message.author.id;

    let userCards = await collectionsCol
      .find({ userId })
      .sort({ serial: 1 })
      .toArray();

    if (!userCards || userCards.length === 0) {
      return message.reply("❌ Your collection is empty.");
    }

    const userTagsDocs = await tagsCol
      .find({ userId })
      .toArray();

    const userTags = {};

    for (const tag of userTagsDocs) {
      userTags[tag.cardCode] = tag.tag;
    }

    const validTiers = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary"
    ];

    let filteredCards = userCards;

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

    const totalPages = Math.ceil(filteredCards.length / perPage);

    function generateEmbed() {
      const start = page * perPage;
      const end = start + perPage;

      const currentCards = filteredCards.slice(start, end);

      const description = currentCards.map(entry => {
        const card = cards.find(
          c => Number(c.id) === Number(entry.cardId)
        );

        if (!card) return "❌ Unknown Card";

        const savedTag = userTags[entry.code];

        const tagText = savedTag
          ? `🏷️ ${savedTag} • `
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
        .setDescription(description)
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `Total Cards: ${filteredCards.length}`
        })
        .setTimestamp();
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("col_prev")
        .setLabel("⬅️")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("col_next")
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
          content: "❌ This is not your collection.",
          ephemeral: true
        });
      }

      if (interaction.customId === "col_next") {
        page++;
        if (page >= totalPages) page = 0;
      }

      if (interaction.customId === "col_prev") {
        page--;
        if (page < 0) page = totalPages - 1;
      }

      await interaction.update({
        embeds: [generateEmbed()],
        components: [row]
      });
    });
  }
};