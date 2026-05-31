const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const cards = require("../data/cards");
const connectDB = require("../database");

const rewards = {
  common: 100,
  uncommon: 200,
  rare: 350,
  epic: 700,
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

    const seriesCards = cards
      .filter(card => clean(card.appearance) === query)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (seriesCards.length === 0) {
      return message.reply(
        "❌ Series not found. Use the exact series name."
      );
    }

    const seriesName = seriesCards[0].appearance;

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");
    const rewardsCol = db.collection("seriesRewards");

    const userId = message.author.id;

    async function getOwnedIds() {
      const userCards = await collectionsCol
        .find({ userId })
        .toArray();

      return new Set(
        userCards.map(c => Number(c.cardId))
      );
    }

    let ownedIds = await getOwnedIds();

    function getCompleted() {
      return seriesCards.every(card =>
        ownedIds.has(Number(card.id))
      );
    }

    let completed = getCompleted();

    let alreadyClaimed = await rewardsCol.findOne({
      userId,
      series: seriesName
    });

    const totalReward = seriesCards.reduce((total, card) => {
      return total + (rewards[card.tier] || 0);
    }, 0);

    const perPage = 15;
    let page = 0;
    let imageIndex = 0;
    let viewMode = "list";

    const totalPages = Math.ceil(seriesCards.length / perPage);

    function ownedCount() {
      return seriesCards.filter(card =>
        ownedIds.has(Number(card.id))
      ).length;
    }

    function generateListEmbed() {
      const start = page * perPage;

      const currentCards = seriesCards.slice(
        start,
        start + perPage
      );

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
            value:
              `<:grootcoin:1504742213110861834> ` +
              `**${totalReward} Coins**`,
            inline: true
          },
          {
            name: "📊 Progress",
            value: `**${ownedCount()}/${seriesCards.length}**`,
            inline: true
          }
        )
        .setFooter({
          text:
            `List View • Page ${page + 1}/${totalPages} • ` +
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

    function generateImageEmbed() {
      const card = seriesCards[imageIndex];
      const owned = ownedIds.has(Number(card.id));

      const imageName =
        card.image.split("/").pop();

      return new EmbedBuilder()
        .setColor(owned ? 0x00ff99 : 0xff5555)
        .setTitle(
          `${owned ? "✅" : "☐"} ${card.name}`
        )
        .setDescription(
          `${getTierEmoji(card.tier)} **${card.tier}**\n\n` +
          `Series: **${seriesName}**\n` +
          `Card: **${imageIndex + 1}/${seriesCards.length}**\n` +
          `Status: **${owned ? "Owned" : "Missing"}**`
        )
        .addFields(
          {
            name: "🎁 Completion Reward",
            value:
              `<:grootcoin:1504742213110861834> ` +
              `**${totalReward} Coins**`,
            inline: true
          },
          {
            name: "📊 Progress",
            value: `**${ownedCount()}/${seriesCards.length}**`,
            inline: true
          }
        )
        .setImage(`attachment://${imageName}`)
        .setFooter({
          text:
            alreadyClaimed
              ? "Reward already claimed."
              : completed
                ? "Completed. Claim your reward!"
                : "Collect all cards to claim reward."
        })
        .setTimestamp();
    }

    function getImageFile() {
      const card = seriesCards[imageIndex];

      const imageName =
        card.image.split("/").pop();

      const imagePath =
        path.join(
          __dirname,
          "..",
          "images",
          card.image
        );

      return new AttachmentBuilder(imagePath, {
        name: imageName
      });
    }

    function makeNavRow() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("series_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : seriesCards.length <= 1
          ),

        new ButtonBuilder()
          .setCustomId("series_view")
          .setLabel(
            viewMode === "list"
              ? "Image View"
              : "List View"
          )
          .setEmoji("🖼️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("series_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : seriesCards.length <= 1
          )
      );
    }

    function makeClaimRow() {
      return new ActionRowBuilder().addComponents(
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
    }

    function getPayload() {
      if (viewMode === "image") {
        return {
          embeds: [generateImageEmbed()],
          files: [getImageFile()],
          components: [
            makeNavRow(),
            makeClaimRow()
          ]
        };
      }

      return {
        embeds: [generateListEmbed()],
        files: [],
        components: [
          makeNavRow(),
          makeClaimRow()
        ]
      };
    }

    const msg = await message.reply(getPayload());

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

      if (interaction.customId === "series_view") {
        viewMode =
          viewMode === "list"
            ? "image"
            : "list";

        return interaction.update(getPayload());
      }

      if (interaction.customId === "series_next") {
        if (viewMode === "list") {
          page++;
          if (page >= totalPages) page = 0;
        } else {
          imageIndex++;
          if (imageIndex >= seriesCards.length) imageIndex = 0;
        }

        return interaction.update(getPayload());
      }

      if (interaction.customId === "series_prev") {
        if (viewMode === "list") {
          page--;
          if (page < 0) page = totalPages - 1;
        } else {
          imageIndex--;
          if (imageIndex < 0) imageIndex = seriesCards.length - 1;
        }

        return interaction.update(getPayload());
      }

      if (interaction.customId === "series_claim") {
        alreadyClaimed = await rewardsCol.findOne({
          userId,
          series: seriesName
        });

        if (alreadyClaimed) {
          return interaction.reply({
            content: "❌ You already claimed this reward.",
            ephemeral: true
          });
        }

        ownedIds = await getOwnedIds();
        completed = getCompleted();

        if (!completed) {
          return interaction.reply({
            content: "❌ You do not complete this series anymore.",
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

        alreadyClaimed = true;

        return interaction.update({
          content:
            `🎉 You claimed **${totalReward} Coins** for completing **${seriesName}**!`,
          ...getPayload()
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