const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const cards = require("../data/cards");
const connectDB = require("../database");

const rewards = {
  common: 50,
  uncommon: 100,
  rare: 250,
  epic: 500,
  legendary: 1000
};

function clean(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

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
  name: "series",

  async execute(message, args) {
    if (!args.length) {
      return message.reply(
        "❌ Use: `!series <series name>`\n" +
        "Example: `!series Iron Man`"
      );
    }

    const query = clean(args.join(" "));

    const seriesCards = cards.filter(card =>
      clean(card.appearance) === query
    );

    if (seriesCards.length === 0) {
      return message.reply("❌ Series not found. Use the exact series name.");
    }

    const seriesName = seriesCards[0].appearance;

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");
    const rewardsCol = db.collection("seriesRewards");

    const userId = message.author.id;

    const userCards = await collectionsCol.find({ userId }).toArray();

    const ownedIds = new Set(
      userCards.map(c => Number(c.cardId))
    );

    const completed = seriesCards.every(card =>
      ownedIds.has(Number(card.id))
    );

    const alreadyClaimed = await rewardsCol.findOne({
      userId,
      series: seriesName
    });

    const totalReward = seriesCards.reduce((total, card) => {
      return total + (rewards[card.tier] || 0);
    }, 0);

    const sortedCards = seriesCards.sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const perPage = 15;
    let page = 0;

    const totalPages = Math.ceil(sortedCards.length / perPage);

    function generateEmbed() {
      const start = page * perPage;
      const currentCards = sortedCards.slice(start, start + perPage);

      const list = currentCards.map((card, index) => {
        const owned = ownedIds.has(Number(card.id));

        return (
          `${owned ? "✅" : "☐"} ` +
          `**${start + index + 1}. ${card.name}** ` +
          `${getTierEmoji(card.tier)}`
        );
      }).join("\n");

      return new EmbedBuilder()
        .setColor(completed ? 0x00ff99 : 0x00aeff)
        .setTitle(`📘 ${seriesName}`)
        .setDescription(list || "No cards found.")
        .addFields(
          {
            name: "🎁 Completion Reward",
            value: `<:grootcoin:1504742213110861834> **${totalReward} Coins**`,
            inline: true
          },
          {
            name: "📊 Progress",
            value:
              `**${seriesCards.filter(c => ownedIds.has(Number(c.id))).length}/${seriesCards.length}**`,
            inline: true
          }
        )
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            (
              alreadyClaimed
                ? "Reward already claimed."
                : completed
                  ? "Completed. Claim your reward!"
                  : "Collect all cards to claim reward."
            )
        })
        .setTimestamp();
    }

    function getRows() {
      const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("series_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages <= 1),

        new ButtonBuilder()
          .setCustomId("series_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages <= 1)
      );

      const claimRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("series_claim")
          .setLabel(alreadyClaimed ? "Claimed" : "Claim Reward")
          .setEmoji(alreadyClaimed ? "✅" : "🎁")
          .setStyle(alreadyClaimed ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(!completed || !!alreadyClaimed)
      );

      return totalPages > 1
        ? [navRow, claimRow]
        : [claimRow];
    }

    const msg = await message.reply({
      embeds: [generateEmbed()],
      components: getRows()
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "❌ This series menu is not for you.",
          ephemeral: true
        });
      }

      if (interaction.customId === "series_next") {
        page++;
        if (page >= totalPages) page = 0;

        return interaction.update({
          embeds: [generateEmbed()],
          components: getRows()
        });
      }

      if (interaction.customId === "series_prev") {
        page--;
        if (page < 0) page = totalPages - 1;

        return interaction.update({
          embeds: [generateEmbed()],
          components: getRows()
        });
      }

      if (interaction.customId === "series_claim") {
        const freshClaim = await rewardsCol.findOne({
          userId,
          series: seriesName
        });

        if (freshClaim) {
          return interaction.reply({
            content: "❌ You already claimed this reward.",
            ephemeral: true
          });
        }

        const freshCards = await collectionsCol.find({ userId }).toArray();

        const freshOwnedIds = new Set(
          freshCards.map(c => Number(c.cardId))
        );

        const stillCompleted = seriesCards.every(card =>
          freshOwnedIds.has(Number(card.id))
        );

        if (!stillCompleted) {
          return interaction.reply({
            content: "❌ You no longer complete this series.",
            ephemeral: true
          });
        }

        await balancesCol.updateOne(
          { userId },
          {
            $inc: {
              coins: totalReward
            }
          },
          { upsert: true }
        );

        await rewardsCol.insertOne({
          userId,
          series: seriesName,
          reward: totalReward,
          claimedAt: Date.now()
        });

        return interaction.update({
          content:
            `🎉 You claimed **${totalReward} Coins** for completing **${seriesName}**!`,
          embeds: [generateEmbed()],
          components: getRows()
        });
      }
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};