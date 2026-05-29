const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

module.exports = {
  name: "give",

  async execute(message, args) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply(
        "❌ Mention a user.\n\n" +
        "Example:\n" +
        "`!give @user q7mz2x`"
      );
    }

    if (!args[1]) {
      return message.reply("❌ Provide a card code.");
    }

    const code = args[1].toLowerCase();

    if (target.id === message.author.id) {
      return message.reply(
        "❌ You cannot give cards to yourself."
      );
    }

    const db = await connectDB();

    const collectionsCol = db.collection("collections");

    const giverId = message.author.id;
    const receiverId = target.id;

    const card = await collectionsCol.findOne({
      userId: giverId,
      code
    });

    if (!card) {
      return message.reply("❌ You do not own this card.");
    }

    if (card.favorite) {
      return message.reply(
        "⭐ You cannot give a favorited card."
      );
    }

    const cardInfo = cards.find(
      c => Number(c.id) === Number(card.cardId)
    );

    const confirmEmbed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("🎁 Confirm Gift")
      .setDescription(
        `**${cardInfo?.name || "Unknown Card"}**\n` +
        `└ \`${card.code}\` • #${card.serial}\n\n` +
        `Recipient: ${target}`
      )
      .setFooter({
        text: "This action cannot be undone."
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("give_confirm")
        .setLabel("Confirm")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("give_cancel")
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary)
    );

    const confirmMsg = await message.reply({
      embeds: [confirmEmbed],
      components: [row]
    });

    const collector = confirmMsg.createMessageComponentCollector({
      time: 30000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== giverId) {
        return interaction.reply({
          content: "❌ This is not your gift confirmation.",
          ephemeral: true
        });
      }

      if (interaction.customId === "give_cancel") {
        collector.stop();

        return interaction.update({
          content: "❌ Gift cancelled.",
          embeds: [],
          components: []
        });
      }

      if (interaction.customId === "give_confirm") {
        collector.stop();

        const freshCard = await collectionsCol.findOne({
          _id: card._id,
          userId: giverId,
          code
        });

        if (!freshCard) {
          return interaction.update({
            content:
              "❌ This card is no longer available to give.",
            embeds: [],
            components: []
          });
        }

        await collectionsCol.updateOne(
          {
            _id: card._id
          },
          {
            $set: {
              userId: receiverId,
              favorite: false
            }
          }
        );

        await removeCardFromAlbums(
          db,
          giverId,
          code
        );

        return interaction.update({
          content:
            `✅ Successfully gave \`${code}\` to ${target}.`,
          embeds: [],
          components: []
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await confirmMsg.edit({
          content: "⌛ Gift confirmation expired.",
          embeds: [],
          components: []
        }).catch(() => {});
      }
    });
  }
};