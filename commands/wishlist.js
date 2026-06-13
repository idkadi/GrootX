const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require("discord.js");

const path = require("path");
const connectDB = require("../database");
const cardsData = require("../data/cards.js");

const PER_PAGE = 15;

function getCardsArray() {
  if (Array.isArray(cardsData)) return cardsData;
  if (Array.isArray(cardsData.cards)) return cardsData.cards;
  return [];
}

function getTierEmoji(tier = "") {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

function getRarity(card) {
  return card.tier || card.rarity || "Unknown";
}

function normalizeId(id) {
  return String(id);
}

function findCards(query) {
  const allCards = getCardsArray();
  const q = query.toLowerCase();

  return allCards.filter(card =>
    card.name?.toLowerCase().includes(q)
  );
}

module.exports = {
  name: "wishlist",
  aliases: ["wish"],

  async execute(message, args) {
    const db = await connectDB();
    const wishCol = db.collection("wishlists");

    const allCards = getCardsArray();
    const userId = message.author.id;
    const sub = args[0]?.toLowerCase();

    if (!sub || message.mentions.users.size > 0) {
      const targetUser = message.mentions.users.first() || message.author;
      const targetId = targetUser.id;

      const data = await wishCol.findOne({ userId: targetId });

      if (!data || !data.cards || data.cards.length === 0) {
        return message.reply(
          targetId === userId
            ? "💫 Your wishlist is empty.\nUse: `!wishlist add Spider-Man`"
            : `💫 **${targetUser.username}**'s wishlist is empty.`
        );
      }

      let wishedCards = data.cards
        .map(id => allCards.find(c => Number(c.id) === Number(id)))
        .filter(Boolean);

      let page = 0;
      let imageIndex = 0;
      let viewMode = "list";
      let currentSort = "default";

      function applySort(sortType) {
        currentSort = sortType;

        if (sortType === "default") {
          wishedCards = data.cards
            .map(id => allCards.find(c => Number(c.id) === Number(id)))
            .filter(Boolean);
        }

        if (sortType === "name") {
          wishedCards.sort((a, b) =>
            (a.name || "").localeCompare(b.name || "")
          );
        }

        if (sortType === "tier") {
          wishedCards.sort((a, b) =>
            getRarity(a).localeCompare(getRarity(b))
          );
        }

        if (sortType === "series") {
          wishedCards.sort((a, b) =>
            (a.appearance || "").localeCompare(b.appearance || "")
          );
        }
      }

      function getTotalPages() {
        return Math.max(1, Math.ceil(wishedCards.length / PER_PAGE));
      }

      function generateListEmbed() {
        const totalPages = getTotalPages();
        const start = page * PER_PAGE;
        const currentCards = wishedCards.slice(start, start + PER_PAGE);

        const description = currentCards.map((card, i) => {
          return (
            `🔹 **${start + i + 1}.** ` +
            `\`${card.id}\` • ` +
            `${getTierEmoji(getRarity(card))} ` +
            `**${card.name}** ` +
            `• ${card.appearance || "Unknown"}`
          );
        }).join("\n");

        return new EmbedBuilder()
          .setColor(0xffc107)
          .setTitle(`${targetUser.username}'s Wishlist`)
          .setDescription(description || "No cards found.")
          .setFooter({
            text:
              `List View • Page ${page + 1}/${totalPages} • ` +
              `Total Wished: ${wishedCards.length} • ` +
              `Sort: ${currentSort}`
          })
          .setTimestamp();
      }

      function generateImageEmbed() {
        const card = wishedCards[imageIndex];

        const imageName = card.image?.split("/").pop();

        return new EmbedBuilder()
          .setColor(0xffc107)
          .setTitle(card.name)
          .setDescription(
            `${getTierEmoji(getRarity(card))} **${getRarity(card)}**\n\n` +
            `Series: **${card.appearance || "Unknown"}**\n` +
            `Card ID: \`${card.id}\`\n` +
            `Wishlist Card: **${imageIndex + 1}/${wishedCards.length}**`
          )
          .setImage(imageName ? `attachment://${imageName}` : null)
          .setFooter({
            text:
              `Image View • Total Wished: ${wishedCards.length} • ` +
              `Sort: ${currentSort}`
          })
          .setTimestamp();
      }

      function getImageFile() {
        const card = wishedCards[imageIndex];

        if (!card?.image) return null;

        const imageName = card.image.split("/").pop();

        const imagePath = path.join(
          __dirname,
          "..",
          "images",
          card.image
        );

        return new AttachmentBuilder(imagePath, {
          name: imageName
        });
      }

      function makeSelectRow() {
        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("wish_sort")
            .setPlaceholder("Sort Wishlist")
            .addOptions([
              {
                label: "Default",
                value: "default",
                description: "Original wishlist order"
              },
              {
                label: "Name",
                value: "name",
                description: "Sort alphabetically"
              },
              {
                label: "Tier",
                value: "tier",
                description: "Sort by card tier"
              },
              {
                label: "Series",
                value: "series",
                description: "Sort by appearance / series"
              }
            ])
        );
      }

      function makeButtonRow() {
        const totalPages = getTotalPages();

        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("wish_prev")
            .setLabel("⬅️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(
              viewMode === "list"
                ? totalPages <= 1
                : wishedCards.length <= 1
            ),

          new ButtonBuilder()
            .setCustomId("wish_view")
            .setLabel(viewMode === "list" ? "Image View" : "List View")
            .setEmoji("🖼️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("wish_next")
            .setLabel("➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(
              viewMode === "list"
                ? totalPages <= 1
                : wishedCards.length <= 1
            )
        );
      }

      function getPayload() {
        if (viewMode === "image") {
          const file = getImageFile();

          return {
            embeds: [generateImageEmbed()],
            files: file ? [file] : [],
            components: [
              makeSelectRow(),
              makeButtonRow()
            ]
          };
        }

        return {
          embeds: [generateListEmbed()],
          files: [],
          components: [
            makeSelectRow(),
            makeButtonRow()
          ]
        };
      }

      const msg = await message.reply(getPayload());

      const collector = msg.createMessageComponentCollector({
        time: 120000
      });

      collector.on("collect", async interaction => {
        collector.resetTimer();

        if (interaction.user.id !== message.author.id) {
          return interaction.reply({
            content: "❌ This is not your wishlist.",
            ephemeral: true
          });
        }

        if (interaction.customId === "wish_sort") {
          applySort(interaction.values[0]);
          page = 0;
          imageIndex = 0;

          return interaction.update(getPayload());
        }

        if (interaction.customId === "wish_view") {
          viewMode = viewMode === "list" ? "image" : "list";

          return interaction.update(getPayload());
        }

        if (interaction.customId === "wish_next") {
          if (viewMode === "list") {
            page++;
            if (page >= getTotalPages()) page = 0;
          } else {
            imageIndex++;
            if (imageIndex >= wishedCards.length) imageIndex = 0;
          }

          return interaction.update(getPayload());
        }

        if (interaction.customId === "wish_prev") {
          if (viewMode === "list") {
            page--;
            if (page < 0) page = getTotalPages() - 1;
          } else {
            imageIndex--;
            if (imageIndex < 0) imageIndex = wishedCards.length - 1;
          }

          return interaction.update(getPayload());
        }
      });

      collector.on("end", async () => {
        await msg.edit({ components: [] }).catch(() => {});
      });

      return;
    }

    args.shift();

    const query = args.join(" ").trim();

    if (!["add", "remove"].includes(sub)) {
      return message.reply(
        "❌ Use:\n" +
        "`!wishlist`\n" +
        "`!wishlist @user`\n" +
        "`!wishlist add <card name>`\n" +
        "`!wishlist remove <card name>`"
      );
    }

    if (!query) {
      return message.reply(`❌ Use: \`!wishlist ${sub} <card name>\``);
    }

    let data = await wishCol.findOne({ userId });

    if (!data) {
      data = {
        userId,
        cards: []
      };

      await wishCol.insertOne(data);
    }

    data.cards = data.cards || [];

    const matches = findCards(query);

    if (!matches.length) {
      return message.reply(`❌ No card found matching **${query}**.`);
    }

    async function addOrRemoveCard(card) {
      const fresh = await wishCol.findOne({ userId }) || {
        userId,
        cards: []
      };

      fresh.cards = fresh.cards || [];

      const cardId = normalizeId(card.id);
      const existingCards = fresh.cards.map(normalizeId);

      if (sub === "add") {
        if (existingCards.includes(cardId)) {
          return message.channel.send(
            `❌ **${card.name}** is already in your wishlist.`
          );
        }

        await wishCol.updateOne(
          { userId },
          {
            $addToSet: {
              cards: card.id
            }
          },
          { upsert: true }
        );

        return message.channel.send(
          `💫 Added ${getTierEmoji(getRarity(card))} **${card.name}** to your wishlist.`
        );
      }

      if (sub === "remove") {
        if (!existingCards.includes(cardId)) {
          return message.channel.send(
            `❌ **${card.name}** is not in your wishlist.`
          );
        }

        await wishCol.updateOne(
          { userId },
          {
            $pull: {
              cards: card.id
            }
          }
        );

        return message.channel.send(
          `🗑️ Removed **${card.name}** from your wishlist.`
        );
      }
    }

    if (matches.length === 1) {
      return addOrRemoveCard(matches[0]);
    }

    const totalPages = Math.ceil(matches.length / PER_PAGE);
    let page = 0;

    async function sendSelectionPage() {
      const start = page * PER_PAGE;
      const currentMatches = matches.slice(start, start + PER_PAGE);

      const embed = new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle("🔎 Multiple Cards Found")
        .setDescription(
          currentMatches.map((card, i) =>
            `**${start + i + 1}.** ${getTierEmoji(getRarity(card))} **${card.name}** • ${card.appearance || "Unknown"}`
          ).join("\n")
        )
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • Reply with a number, "next", "prev", or "cancel".`
        });

      return message.channel.send({ embeds: [embed] });
    }

    await sendSelectionPage();

    const collector = message.channel.createMessageCollector({
      filter: m => m.author.id === userId,
      time: 120000
    });

    collector.on("collect", async m => {
      const response = m.content.trim().toLowerCase();

      if (response === "cancel") {
        collector.stop("cancelled");
        return message.channel.send("❌ Wishlist selection cancelled.");
      }

      if (response === "next") {
        page++;
        if (page >= totalPages) page = 0;

        return sendSelectionPage();
      }

      if (response === "prev" || response === "back") {
        page--;
        if (page < 0) page = totalPages - 1;

        return sendSelectionPage();
      }

      const selectedNumber = parseInt(response);

      if (
        isNaN(selectedNumber) ||
        selectedNumber < 1 ||
        selectedNumber > matches.length
      ) {
        return message.channel.send(
          `❌ Invalid selection. Enter a number from **1-${matches.length}**, or type \`cancel\`.`
        );
      }

      const selectedCard = matches[selectedNumber - 1];

      collector.stop("selected");

      return addOrRemoveCard(selectedCard);
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "selected" && reason !== "cancelled") {
        await message.channel.send("⌛ Wishlist selection timed out.").catch(() => {});
      }
    });
  }
};