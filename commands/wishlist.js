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

      const perPage = 10;
      let page = 0;
      let imageIndex = 0;
      let viewMode = "list";
      let currentSort = "default";

      function applySort(sortType) {
        currentSort = sortType;

        switch (sortType) {
          case "name":
            wishedCards.sort((a, b) =>
              (a.name || "").localeCompare(b.name || "")
            );
            break;

          case "tier":
            wishedCards.sort((a, b) =>
              getRarity(a).localeCompare(getRarity(b))
            );
            break;

          case "appearance":
            wishedCards.sort((a, b) =>
              (a.appearance || "").localeCompare(b.appearance || "")
            );
            break;

          case "default":
          default:
            wishedCards = data.cards
              .map(id => allCards.find(c => Number(c.id) === Number(id)))
              .filter(Boolean);
            break;
        }
      }

      function getTotalPages() {
        return Math.ceil(wishedCards.length / perPage);
      }

      function generateListEmbed() {
        const totalPages = getTotalPages();
        const start = page * perPage;
        const currentCards = wishedCards.slice(start, start + perPage);

        const description = currentCards.map((card, i) => {
          return (
            `🔹 \`${card.id}\` • ` +
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
              `Total Wished: ${wishedCards.length}/15 • ` +
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
          .setImage(`attachment://${imageName}`)
          .setFooter({
            text:
              `Image View • Total Wished: ${wishedCards.length}/15 • ` +
              `Sort: ${currentSort}`
          })
          .setTimestamp();
      }

      function getImageFile() {
        const card = wishedCards[imageIndex];
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
        const selectMenu = new StringSelectMenuBuilder()
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
              value: "appearance",
              description: "Sort by appearance / series"
            }
          ]);

        return new ActionRowBuilder().addComponents(selectMenu);
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
          return {
            embeds: [generateImageEmbed()],
            files: [getImageFile()],
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
        "❌ Use:\n`!wishlist`\n`!wishlist @user`\n`!wishlist add <card name>`\n`!wishlist remove <card name>`"
      );
    }

    if (!query) {
      return message.reply(`❌ Use: \`!wishlist ${sub} <card name>\``);
    }

    let data = await wishCol.findOne({ userId });

    if (!data) {
      data = { userId, cards: [] };
      await wishCol.insertOne(data);
    }

    const matches = findCards(query);

    if (!matches.length) {
      return message.reply(`❌ No card found matching **${query}**.`);
    }

    async function addOrRemoveCard(card) {
      const fresh = await wishCol.findOne({ userId }) || { userId, cards: [] };

      if (sub === "add") {
        if (fresh.cards.includes(card.id)) {
          return message.reply(`❌ **${card.name}** is already in your wishlist.`);
        }

        if (fresh.cards.length >= 15) {
          return message.reply("❌ Your wishlist is full. Max limit is **15 cards**.");
        }

        await wishCol.updateOne(
          { userId },
          { $addToSet: { cards: card.id } },
          { upsert: true }
        );

        return message.reply(
          `💫 Added ${getTierEmoji(getRarity(card))} **${card.name}** to your wishlist.`
        );
      }

      if (sub === "remove") {
        if (!fresh.cards.includes(card.id)) {
          return message.reply(`❌ **${card.name}** is not in your wishlist.`);
        }

        await wishCol.updateOne(
          { userId },
          { $pull: { cards: card.id } }
        );

        return message.reply(`🗑️ Removed **${card.name}** from your wishlist.`);
      }
    }

    if (matches.length === 1) {
      return addOrRemoveCard(matches[0]);
    }

    const limited = matches.slice(0, 5);

    const embed = new EmbedBuilder()
      .setColor(0xffc107)
      .setTitle("🔎 Multiple Cards Found")
      .setDescription(
        limited.map((card, i) =>
          `**${i + 1}.** ${getTierEmoji(getRarity(card))} **${card.name}** • ${card.appearance || "Unknown"}`
        ).join("\n")
      )
      .setFooter({ text: "Pick the card you want." });

    const row = new ActionRowBuilder();

    limited.forEach((card, i) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`wishlist_${sub}_${card.id}`)
          .setLabel(`${i + 1}`)
          .setStyle(ButtonStyle.Secondary)
      );
    });

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
          content: "❌ This wishlist menu is not for you.",
          ephemeral: true
        });
      }

      const [, action, cardId] = interaction.customId.split("_");
      const card = allCards.find(c => Number(c.id) === Number(cardId));

      if (!card) {
        return interaction.update({
          content: "❌ Card data not found.",
          embeds: [],
          components: []
        });
      }

      const fresh = await wishCol.findOne({ userId }) || { userId, cards: [] };

      if (action === "add") {
        if (fresh.cards.includes(card.id)) {
          return interaction.update({
            content: `❌ **${card.name}** is already in your wishlist.`,
            embeds: [],
            components: []
          });
        }

        if (fresh.cards.length >= 15) {
          return interaction.update({
            content: "❌ Your wishlist is full. Max limit is **15 cards**.",
            embeds: [],
            components: []
          });
        }

        await wishCol.updateOne(
          { userId },
          { $addToSet: { cards: card.id } },
          { upsert: true }
        );

        return interaction.update({
          content: `💫 Added ${getTierEmoji(getRarity(card))} **${card.name}** to your wishlist.`,
          embeds: [],
          components: []
        });
      }

      if (action === "remove") {
        if (!fresh.cards.includes(card.id)) {
          return interaction.update({
            content: `❌ **${card.name}** is not in your wishlist.`,
            embeds: [],
            components: []
          });
        }

        await wishCol.updateOne(
          { userId },
          { $pull: { cards: card.id } }
        );

        return interaction.update({
          content: `🗑️ Removed **${card.name}** from your wishlist.`,
          embeds: [],
          components: []
        });
      }
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  }
};