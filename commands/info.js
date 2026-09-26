const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const renderInfo = require("../utils/Inforender");

module.exports = {
  name: "info",
  aliases: ["i"],

  async execute(message, args) {
    if (!args.length) {
      return message.reply("❌ Please provide a card name.");
    }

    const seasonArg = args.find(arg => /^s:(?:0|1)$/i.test(arg));
    const selectedSeason = seasonArg ? Number(seasonArg.slice(2)) : null;
    const query = args
      .filter(arg => !/^s:(?:0|1)$/i.test(arg))
      .join(" ")
      .trim()
      .toLowerCase();

    if (!query) {
      return message.reply(
        "❌ Please provide a card name. Example: `info s:1 spider-man`"
      );
    }

    const results = [
      ...(
        selectedSeason === 1
          ? []
          : searchCards(season0Cards, query).map(card => ({
              card,
              season: 0
            }))
      ),
      ...(
        selectedSeason === 0
          ? []
          : searchCards(season1Cards, query).map(card => ({
              card,
              season: 1
            }))
      )
    ];

    if (results.length === 0) {
      return message.reply("❌ No cards found.");
    }

    if (results.length === 1) {
      return sendCard(
        message,
        results[0].card,
        results[0].season
      );
    }

    let response = "## Multiple cards found:\n\n";

    results.forEach(({ card, season }, index) => {
      response +=
        `${index + 1}. ${card.name} • ${card.appearance} • S${season}\n`;
    });

    response += "\nReply with the number of the card.";

    await message.reply(response);

    const collector = message.channel.createMessageCollector({
      filter: reply => reply.author.id === message.author.id,
      time: 30000,
      max: 1
    });

    collector.on("collect", async reply => {
      const choice = Number.parseInt(reply.content, 10);

      if (
        Number.isNaN(choice) ||
        choice < 1 ||
        choice > results.length
      ) {
        return message.reply("❌ Invalid selection.");
      }

      return sendCard(
        message,
        results[choice - 1].card,
        results[choice - 1].season
      );
    });
  }
};

function searchCards(database, query) {
  return database.filter(card => {
    const nameMatch = card.name
      ?.toLowerCase()
      .includes(query);

    const akaMatch = card.aka?.some(alias =>
      alias.toLowerCase().includes(query)
    );

    return nameMatch || akaMatch;
  });
}

function getSeasonDatabase(season) {
  return season === 1
    ? season1Cards
    : season0Cards;
}

function buildSeasonRow(activeSeason, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("info_season_0")
      .setLabel("Season 0")
      .setEmoji("0️⃣")
      .setStyle(
        activeSeason === 0
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      )
      .setDisabled(disabled || activeSeason === 0),

    new ButtonBuilder()
      .setCustomId("info_season_1")
      .setLabel("Season 1")
      .setEmoji("1️⃣")
      .setStyle(
        activeSeason === 1
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      )
      .setDisabled(disabled || activeSeason === 1)
  );
}

async function buildCardResponse(card, season) {
  const seasonCard = {
    ...card,
    season
  };

  const buffer = await renderInfo(seasonCard, season);
  const imageName = `info-card-s${season}.png`;

  const attachment = new AttachmentBuilder(buffer, {
    name: imageName
  });

  const embed = new EmbedBuilder()
    .setColor(getColor(card.tier))
    .setAuthor({
      name: "Marvel Heroes Database"
    })
    .setTitle(card.name)
    .setDescription(
      `✨ **AKA:** ${
        card.aka?.length
          ? card.aka.join(", ")
          : "None"
      }`
    )
    .addFields(
      {
        name: "🎬 Appearance",
        value: card.appearance || "Unknown",
        inline: true
      },
      {
        name: "⭐ Tier",
        value:
          card.tier.charAt(0).toUpperCase() +
          card.tier.slice(1),
        inline: true
      },
      {
        name: "🆔 Card ID",
        value: `${card.id}`,
        inline: true
      },
      {
        name: "🗓️ Season",
        value: `Season ${season}`,
        inline: true
      }
    )
    .setImage(`attachment://${imageName}`)
    .setFooter({
      text: `GrootX • Season ${season}`
    })
    .setTimestamp();

  return {
    embeds: [embed],
    files: [attachment],
    components: [buildSeasonRow(season)]
  };
}

async function sendCard(message, initialCard, initialSeason) {
  let activeSeason = initialSeason;

  const response = await buildCardResponse(
    initialCard,
    activeSeason
  );

  const sentMessage = await message.reply(response);

  const collector = sentMessage.createMessageComponentCollector({
    filter: interaction =>
      interaction.user.id === message.author.id &&
      interaction.customId.startsWith("info_season_"),
    time: 60000
  });

  collector.on("collect", async interaction => {
    const selectedSeason = Number(
      interaction.customId.split("_").pop()
    );

    const database = getSeasonDatabase(selectedSeason);

    const selectedCard = database.find(card =>
      String(card.name).toLowerCase() ===
        String(initialCard.name).toLowerCase() &&
      String(card.appearance).toLowerCase() ===
        String(initialCard.appearance).toLowerCase()
    );

    if (!selectedCard) {
      return interaction.reply({
        content:
          `❌ This card is not available in Season ${selectedSeason}.`,
        ephemeral: true
      });
    }

    activeSeason = selectedSeason;

    const updatedResponse = await buildCardResponse(
      selectedCard,
      activeSeason
    );

    await interaction.update({
      ...updatedResponse,
      attachments: []
    });
  });

  collector.on("end", async () => {
    await sentMessage
      .edit({
        components: [buildSeasonRow(activeSeason, true)]
      })
      .catch(() => {});
  });
}

function getColor(tier) {
  if (!tier) return 0xffffff;

  switch (tier.toLowerCase()) {
    case "common":
      return 0xcd7f32;
    case "uncommon":
      return 0xc0c0c0;
    case "rare":
      return 0xffd700;
    case "epic":
      return 0x8000ff;
    case "legendary":
      return 0xe53935;
    default:
      return 0xffffff;
  }
}