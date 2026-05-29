const connectDB = require("../database");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

module.exports = {
  name: "give",

  async execute(message, args) {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply(
        "❌ Mention a user.\n\nExample:\n`!give @user q7mz2x`"
      );
    }

    if (!args[1]) {
      return message.reply("❌ Provide a card code.");
    }

    const code = args[1].toLowerCase();

    if (target.id === message.author.id) {
      return message.reply("❌ You cannot give cards to yourself.");
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
      return message.reply("⭐ You cannot give a favorited card.");
    }

    const cardName =
      card.name || card.cardName || "Unknown Card";

    const series =
      card.series || card.anime || card.movie || "Unknown Series";

    const rarity =
      card.rarity || "Unknown";

    const serial =
      card.serial || card.serialNumber || "N/A";

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("🎁 Confirm Card Give")
      .setDescription(
        `${message.author} is giving this card to ${target}.`
      )
      .addFields(
        {
          name: "Card",
          value: cardName,
          inline: true
        },
        {
          name: "Code",
          value: `\`${code}\``,
          inline: true
        },
        {
          name: "Rarity",
          value: rarity,
          inline: true
        },
        {
          name: "Series",
          value: series,
          inline: true
        },
        {
          name: "Serial",
          value: `${serial}`,
          inline: true
        }
      )
      .setFooter({
        text: "Click ✅ to confirm or ❌ to cancel."
      });

    if (card.image && card.image.startsWith("http")) {
      embed.setImage(card.image);
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`give_confirm_${message.author.id}_${code}`)
        .setLabel("Confirm")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`give_cancel_${message.author.id}_${code}`)
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary)
    );

    const confirmMsg = await message.reply({
      embeds: [embed],
      components: [row]
    });

    const collector = confirmMsg.createMessageComponentCollector({
      time: 30000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ Only the giver can confirm this.",
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith("give_cancel_")) {
        collector.stop("cancelled");

        return interaction.update({
          content: "❌ Give cancelled.",
          embeds: [],
          components: []
        });
      }

      if (interaction.customId.startsWith("give_confirm_")) {
        const freshCard = await collectionsCol.findOne({
          _id: card._id,
          userId: giverId,
          code
        });

        if (!freshCard) {
          collector.stop("missing");

          return interaction.update({
            content:
              "❌ This card is no longer in your collection.",
            embeds: [],
            components: []
          });
        }

        if (freshCard.favorite) {
          collector.stop("favorite");

          return interaction.update({
            content:
              "⭐ This card is now favorited, so it cannot be given.",
            embeds: [],
            components: []
          });
        }

        await collectionsCol.updateOne(
          {
            _id: freshCard._id
          },
          {
            $set: {
              userId: receiverId,
              favorite: false
            }
          }
        );

        await removeCardFromAlbums(db, giverId, code);

        collector.stop("confirmed");

        return interaction.update({
          content:
            `✅ Gave **${cardName}** \`${code}\` to ${target}.`,
          embeds: [],
          components: []
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (
        reason === "confirmed" ||
        reason === "cancelled" ||
        reason === "missing" ||
        reason === "favorite"
      ) {
        return;
      }

      await confirmMsg.edit({
        content: "⌛ Give confirmation expired.",
        embeds: [],
        components: []
      }).catch(() => {});
    });
  }
};