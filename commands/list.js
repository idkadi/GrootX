const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

// CUSTOM RARITY EMOJIS
function getTierEmoji(tier) {

  switch (tier.toLowerCase()) {

    case "common":
      return "<:common:1504510702956839033>";

    case "uncommon":
      return "<:uncommon:1504510929210052698>";

    case "rare":
      return "<:rare:1504510606718275764>";

    case "epic":
      return "<:epic:1504510771214680175>";

    case "legendary":
      return "<:legendary:1504511435974377552>";

    default:
      return "❓";
  }

}

module.exports = {

  name: "list",
  aliases: ["cards"],

  async execute(message, args) {

    // FILTERED CARDS
    let filteredCards = cards;

    // VALID TIERS
    const validTiers = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary"
    ];

    // FILTER BY TIER
    if (args[0]) {

      const tier =
        args[0].toLowerCase();

      if (
        validTiers.includes(tier)
      ) {

        filteredCards =
          cards.filter(
            c => c.tier === tier
          );

      }

    }

    // NO RESULTS
    if (filteredCards.length === 0) {

      return message.reply(
        "❌ No cards found."
      );

    }

    // PAGE SYSTEM
    let page = 0;

    const cardsPerPage = 14;

    // EMBED GENERATOR
    const generateEmbed = (page) => {

      const start =
        page * cardsPerPage;

      const end =
        start + cardsPerPage;

      const currentCards =
        filteredCards.slice(start, end);

      const description =
        currentCards.map(card => {

          return (
            `${getTierEmoji(card.tier)} ` +
            `• **${card.name}**\n` +
            `↳ ${card.appearance}\n`
          );

        }).join("\n");

      return new EmbedBuilder()

        .setColor(0x00aeff)

        .setTitle("📚 GrootX Card List")

        .setDescription(description)

        .setFooter({
          text:
            `Page ${page + 1}/${Math.ceil(filteredCards.length / cardsPerPage)} • Total Cards: ${filteredCards.length}`
        })

        .setTimestamp();

    };

    // BUTTONS
    const row = new ActionRowBuilder()

      .addComponents(

        new ButtonBuilder()
          .setCustomId("previous")
          .setLabel("⬅️ Previous")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("➡️ Next")
          .setStyle(ButtonStyle.Primary)

      );

    // SEND MESSAGE
    const msg = await message.reply({

      embeds: [generateEmbed(page)],
      components: [row]

    });

    // BUTTON COLLECTOR
    const collector =
      msg.createMessageComponentCollector({
        time: 60000
      });

    collector.on("collect", async interaction => {

      // ONLY COMMAND USER CAN USE
      if (
        interaction.user.id !==
        message.author.id
      ) {

        return interaction.reply({
          content:
            "❌ You cannot use these buttons.",
          ephemeral: true
        });

      }

      // NEXT PAGE
      if (
        interaction.customId === "next"
      ) {

        if (
          (page + 1) *
          cardsPerPage <
          filteredCards.length
        ) {

          page++;

        }

      }

      // PREVIOUS PAGE
      if (
        interaction.customId === "previous"
      ) {

        if (page > 0) {

          page--;

        }

      }

      // UPDATE MESSAGE
      await interaction.update({

        embeds: [generateEmbed(page)],
        components: [row]

      });

    });

  }

};