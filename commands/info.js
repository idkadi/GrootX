const cards = require("../data/cards");
const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const renderInfo = require("../utils/renderInfo");

const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "info",
  aliases: ["i"],

  async execute(message, args) {

    if (!args.length) {
      return message.reply(
        "❌ Please provide a card name."
      );
    }

    const query =
      args.join(" ").toLowerCase();

    // SEARCH RESULTS
    const results = cards.filter(c => {

      const nameMatch =
        c.name &&
        c.name.toLowerCase().includes(query);

      const akaMatch =
        c.aka &&
        c.aka.some(a =>
          a.toLowerCase().includes(query)
        );

      return nameMatch || akaMatch;

    });

    // NO RESULTS
    if (results.length === 0) {
      return message.reply(
        "❌ No cards found."
      );
    }

    // SINGLE RESULT
    if (results.length === 1) {

      return sendCard(
        message,
        results[0]
      );

    }

    // MULTIPLE RESULTS
    let response =
      "## Multiple cards found:\n\n";

    results.forEach((card, index) => {

      response +=
        `${index + 1}. ${card.name} • ${card.appearance}\n`;

    });

    response +=
      "\nReply with the number of the card.";

    await message.reply(response);

    // WAIT FOR USER RESPONSE
    const filter = m =>
      m.author.id === message.author.id;

    const collector =
      message.channel.createMessageCollector({
        filter,
        time: 30000,
        max: 1
      });

    collector.on("collect", async msg => {

      const choice =
        parseInt(msg.content);

      // INVALID CHOICE
      if (
        isNaN(choice) ||
        choice < 1 ||
        choice > results.length
      ) {

        return message.reply(
          "❌ Invalid selection."
        );

      }

      const selectedCard =
        results[choice - 1];

      await sendCard(
        message,
        selectedCard
      );

    });

  }
};

// SEND CARD EMBED
async function sendCard(message, card) {
  const buffer = await renderInfo(card);

  const attachment = new AttachmentBuilder(buffer, {
    name: "info-card.png",
  });

  const embed = new EmbedBuilder()
    .setColor(getColor(card.tier))
    .setAuthor({
      name: "Marvel Heroes Database",
    })
    .setTitle(card.name)
    .setDescription(
      `✨ **AKA:** ${
        card.aka && card.aka.length > 0
          ? card.aka.join(", ")
          : "None"
      }`
    )
    .addFields(
      {
        name: "🎬 Appearance",
        value: card.appearance || "Unknown",
        inline: true,
      },
      {
        name: "⭐ Tier",
        value:
          card.tier.charAt(0).toUpperCase() +
          card.tier.slice(1),
        inline: true,
      },
      {
        name: "🆔 Card ID",
        value: `${card.id}`,
        inline: true,
      }
    )
    .setImage("attachment://info-card.png")
    .setFooter({
      text: "GrootX • Marvel Card Collection",
    })
    .setTimestamp();

  await message.reply({
    embeds: [embed],
    files: [attachment],
  });
}

// RARITY COLORS
function getColor(tier) {

  if (!tier) return 0xffffff;

  switch (tier.toLowerCase()) {

    // Bronze
    case "common":
      return 0xcd7f32;

    // Silver
    case "uncommon":
      return 0xc0c0c0;

    // Gold
    case "rare":
      return 0xffd700;

    // Purple
    case "epic":
      return 0x8000ff;

    // Red
    case "legendary":
      return 0xff0000;

    default:
      return 0xffffff;
  }

}