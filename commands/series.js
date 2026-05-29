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

    const query = args.join(" ").toLowerCase().trim();

    const seriesCards = cards.filter(card =>
      (card.appearance || "")
        .toLowerCase()
        .trim()
        .includes(query)
    );

    if (seriesCards.length === 0) {
      return message.reply("❌ Series not found.");
    }

    const seriesName = seriesCards[0].appearance;

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");
    const rewardsCol = db.collection("seriesRewards");

    const userId = message.author.id;

    const userCards = await collectionsCol
      .find({ userId })
      .toArray();

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

    const list = seriesCards
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((card, index) => {
        const owned = ownedIds.has(Number(card.id));

        return (
          `${owned ? "✅" : "☐"} ` +
          `**${index + 1}. ${card.name}** ` +
          `${getTierEmoji(card.tier)}`
        );
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(completed ? 0x00ff99 : 0x00aeff)
      .setTitle(`📘 ${seriesName}`)
      .setDescription(list)
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
        text: alreadyClaimed
          ? "Reward already claimed."
          : completed
            ? "You completed this series. Claim your reward!"
            : "Collect all cards to claim the reward."
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("series_claim")
        .setLabel(
          alreadyClaimed
            ? "Claimed"
            : "Claim Reward"
        )
        .setEmoji(
          alreadyClaimed
            ? "✅"
            : "🎁"
        )
        .setStyle(
          alreadyClaimed
            ? ButtonStyle.Secondary
            : ButtonStyle.Success
        )
        .setDisabled(!completed || !!alreadyClaimed)
    );

    const msg = await message.reply({
      embeds: [embed],
      components: [row]
    });

    const collector = msg.createMessageComponentCollector({
      time: 60000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "❌ This series menu is not for you.",
          ephemeral: true
        });
      }

      if (interaction.customId !== "series_claim") return;

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

      const freshCards = await collectionsCol
        .find({ userId })
        .toArray();

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
        {
          upsert: true
        }
      );

      await rewardsCol.insertOne({
        userId,
        series: seriesName,
        reward: totalReward,
        claimedAt: Date.now()
      });

      const claimedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("series_claimed")
          .setLabel("Claimed")
          .setEmoji("✅")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await interaction.update({
        content:
          `🎉 You claimed **${totalReward} Coins** for completing **${seriesName}**!`,
        components: [claimedRow]
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};