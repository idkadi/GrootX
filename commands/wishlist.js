const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");
const cardsData = require("../data/cards.js");

function getCardsArray() {
  if (Array.isArray(cardsData)) return cardsData;
  if (Array.isArray(cardsData.cards)) return cardsData.cards;
  return [];
}

function getRarity(card) {
  return card.tier || card.rarity || "Unknown";
}

function findCards(query) {
  const allCards = getCardsArray();
  const q = query.toLowerCase();

  return allCards.filter(card =>
    card.name.toLowerCase().includes(q)
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

    // !wishlist
    // !wishlist @user
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

      const wishedCards = data.cards
        .map(id => allCards.find(c => Number(c.id) === Number(id)))
        .filter(Boolean);

      const desc = wishedCards
        .map((card, i) => `**${i + 1}.** ${card.name} • ${getRarity(card)}`)
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle(`💫 ${targetUser.username}'s Wishlist`)
        .setDescription(desc)
        .setFooter({ text: `${wishedCards.length}/15 cards wished` });

      return message.reply({ embeds: [embed] });
    }

    // remove first arg: add/remove
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

    // Direct add/remove if only one match
    if (matches.length === 1) {
      const card = matches[0];

      if (sub === "add") {
        if (data.cards.includes(card.id)) {
          return message.reply(`❌ **${card.name}** is already in your wishlist.`);
        }

        if (data.cards.length >= 15) {
          return message.reply("❌ Your wishlist is full. Max limit is **15 cards**.");
        }

        await wishCol.updateOne(
          { userId },
          { $addToSet: { cards: card.id } },
          { upsert: true }
        );

        return message.reply(`💫 Added **${card.name}** to your wishlist.`);
      }

      if (sub === "remove") {
        if (!data.cards.includes(card.id)) {
          return message.reply(`❌ **${card.name}** is not in your wishlist.`);
        }

        await wishCol.updateOne(
          { userId },
          { $pull: { cards: card.id } }
        );

        return message.reply(`🗑️ Removed **${card.name}** from your wishlist.`);
      }
    }

    // Multiple results menu
    const limited = matches.slice(0, 5);

    const embed = new EmbedBuilder()
      .setColor(0xffc107)
      .setTitle("🔎 Multiple cards found")
      .setDescription(
        limited
          .map((card, i) => `**${i + 1}.** ${card.name} • ${getRarity(card)}`)
          .join("\n")
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
          content: `💫 Added **${card.name}** to your wishlist.`,
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