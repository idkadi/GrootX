const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
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

async function reply(ctx, payload) {
  if (typeof payload === "string") payload = { content: payload };

  if (ctx.interaction) {
    if (ctx.interaction.replied || ctx.interaction.deferred) {
      return ctx.interaction.followUp(payload);
    }

    return ctx.interaction.reply({
      ...payload,
      fetchReply: true
    });
  }

  return ctx.message.reply(payload);
}

async function send(ctx, payload) {
  if (typeof payload === "string") payload = { content: payload };

  if (ctx.interaction) {
    if (ctx.interaction.replied || ctx.interaction.deferred) {
      return ctx.interaction.followUp(payload);
    }

    return ctx.interaction.reply({
      ...payload,
      fetchReply: true
    });
  }

  return ctx.message.channel.send(payload);
}

async function showWishlist(ctx, targetUser) {
  const db = await connectDB();
  const wishCol = db.collection("wishlists");

  const allCards = getCardsArray();
  const viewerId = ctx.user.id;
  const targetId = targetUser.id;

  const data = await wishCol.findOne({ userId: targetId });

  if (!data || !data.cards || data.cards.length === 0) {
    return reply(
      ctx,
      targetId === viewerId
        ? "💫 Your wishlist is empty.\nUse: `!wishlist add Spider-Man` or `/wishlist add card:Spider-Man`"
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

    const embed = new EmbedBuilder()
      .setColor(0xffc107)
      .setTitle(card.name)
      .setDescription(
        `${getTierEmoji(getRarity(card))} **${getRarity(card)}**\n\n` +
        `Series: **${card.appearance || "Unknown"}**\n` +
        `Card ID: \`${card.id}\`\n` +
        `Wishlist Card: **${imageIndex + 1}/${wishedCards.length}**`
      )
      .setFooter({
        text:
          `Image View • Total Wished: ${wishedCards.length} • ` +
          `Sort: ${currentSort}`
      })
      .setTimestamp();

    if (imageName) embed.setImage(`attachment://${imageName}`);

    return embed;
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

  const msg = await reply(ctx, getPayload());

  const collector = msg.createMessageComponentCollector({
    time: 120000
  });

  collector.on("collect", async interaction => {
    collector.resetTimer();

    if (interaction.user.id !== viewerId) {
      return interaction.reply({
        content: "❌ This is not your wishlist menu.",
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
}

async function addOrRemoveWishlist(ctx, sub, query) {
  const db = await connectDB();
  const wishCol = db.collection("wishlists");

  const userId = ctx.user.id;

  if (!query) {
    return reply(
      ctx,
      `❌ Use: \`!wishlist ${sub} <card name>\` or \`/wishlist ${sub} card:<card name>\``
    );
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
    return reply(ctx, `❌ No card found matching **${query}**.`);
  }

  async function handleCard(card) {
    const fresh = await wishCol.findOne({ userId }) || {
      userId,
      cards: []
    };

    fresh.cards = fresh.cards || [];

    const cardId = normalizeId(card.id);
    const existingCards = fresh.cards.map(normalizeId);

    if (sub === "add") {
      if (existingCards.includes(cardId)) {
        return send(
          ctx,
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

      return send(
        ctx,
        `💫 Added ${getTierEmoji(getRarity(card))} **${card.name}** to your wishlist.`
      );
    }

    if (sub === "remove") {
      if (!existingCards.includes(cardId)) {
        return send(
          ctx,
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

      return send(
        ctx,
        `🗑️ Removed **${card.name}** from your wishlist.`
      );
    }
  }

  if (matches.length === 1) {
    return handleCard(matches[0]);
  }

  const options = matches.slice(0, 25).map(card => ({
    label: card.name.slice(0, 100),
    description: `${getRarity(card)} • ${card.appearance || "Unknown"}`.slice(0, 100),
    value: String(card.id)
  }));

  const embed = new EmbedBuilder()
    .setColor(0xffc107)
    .setTitle("🔎 Multiple Cards Found")
    .setDescription("Select the card you want.")
    .setFooter({
      text: matches.length > 25
        ? "Only first 25 matches are shown. Search more specifically if needed."
        : "Selection expires in 2 minutes."
    });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("wish_card_select")
      .setPlaceholder("Choose a card")
      .addOptions(options)
  );

  const msg = await reply(ctx, {
    embeds: [embed],
    components: [row]
  });

  const collector = msg.createMessageComponentCollector({
    time: 120000
  });

  collector.on("collect", async interaction => {
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: "❌ This is not your wishlist selection.",
        ephemeral: true
      });
    }

    const selectedId = interaction.values[0];

    const selectedCard = matches.find(card =>
      String(card.id) === selectedId
    );

    if (!selectedCard) {
      return interaction.reply({
        content: "❌ Selected card not found.",
        ephemeral: true
      });
    }

    collector.stop("selected");

    await interaction.update({
      embeds: [],
      components: [],
      content: "✅ Card selected."
    }).catch(() => {});

    return handleCard(selectedCard);
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "selected") {
      await msg.edit({
        content: "⌛ Wishlist selection timed out.",
        embeds: [],
        components: []
      }).catch(() => {});
    }
  });
}

async function runPrefix(message, args) {
  const user = message.author;
  const sub = args[0]?.toLowerCase();

  const ctx = {
    message,
    user
  };

  if (!sub || message.mentions.users.size > 0) {
    const targetUser =
      message.mentions.users.first() ||
      message.author;

    return showWishlist(ctx, targetUser);
  }

  if (!["add", "remove"].includes(sub)) {
    return reply(
      ctx,
      "❌ Use:\n" +
      "`!wishlist`\n" +
      "`!wishlist @user`\n" +
      "`!wishlist add <card name>`\n" +
      "`!wishlist remove <card name>`"
    );
  }

  args.shift();

  const query = args.join(" ").trim();

  return addOrRemoveWishlist(ctx, sub, query);
}

async function runSlash(interaction) {
  const sub = interaction.options.getSubcommand();

  const ctx = {
    interaction,
    user: interaction.user
  };

  if (sub === "view") {
    const targetUser =
      interaction.options.getUser("user") ||
      interaction.user;

    return showWishlist(ctx, targetUser);
  }

  if (sub === "add") {
    const query = interaction.options.getString("card");

    return addOrRemoveWishlist(ctx, "add", query);
  }

  if (sub === "remove") {
    const query = interaction.options.getString("card");

    return addOrRemoveWishlist(ctx, "remove", query);
  }
}

module.exports = {
  name: "wishlist",
  aliases: ["wish"],

  data: new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("View or manage your wishlist")
    .addSubcommand(sub =>
      sub
        .setName("view")
        .setDescription("View your or another user's wishlist")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User whose wishlist you want to view")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("add")
        .setDescription("Add a card to your wishlist")
        .addStringOption(option =>
          option
            .setName("card")
            .setDescription("Card name")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a card from your wishlist")
        .addStringOption(option =>
          option
            .setName("card")
            .setDescription("Card name")
            .setRequired(true)
        )
    ),

  async execute(message, args) {
    return runPrefix(message, args);
  },

  async slashExecute(interaction) {
    return runSlash(interaction);
  }
};