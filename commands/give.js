const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const cards = require("../data/cards");
const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

async function runGive({ message, interaction, target, code }) {
  const isSlash = !!interaction;

  const author = isSlash ? interaction.user : message.author;
  const replyTarget = isSlash ? interaction : message;

  if (!target) {
    return replyTarget.reply({
      content: "❌ Mention/select a user.\nExample: `!give @user q7mz2x`",
      ephemeral: isSlash ? true : undefined
    });
  }

  if (!code) {
    return replyTarget.reply({
      content: "❌ Provide a card code.",
      ephemeral: isSlash ? true : undefined
    });
  }

  code = code.toLowerCase();

  if (target.id === author.id) {
    return replyTarget.reply({
      content: "❌ You cannot give cards to yourself.",
      ephemeral: isSlash ? true : undefined
    });
  }

  const db = await connectDB();

  const collectionsCol = db.collection("collections");

  const giverId = author.id;
  const receiverId = target.id;

  const card = await collectionsCol.findOne({
    userId: giverId,
    code
  });

  if (!card) {
    return replyTarget.reply({
      content: "❌ You do not own this card.",
      ephemeral: isSlash ? true : undefined
    });
  }

  if (card.favorite) {
    return replyTarget.reply({
      content: "⭐ You cannot give a favorited card.",
      ephemeral: isSlash ? true : undefined
    });
  }

  const cardInfo = cards.find(
    c => Number(c.id) === Number(card.cardId)
  );

  if (!cardInfo) {
    return replyTarget.reply({
      content: "❌ Card data not found.",
      ephemeral: isSlash ? true : undefined
    });
  }

  const buffer = await renderCard(cardInfo, card.serial, card);

  const file = new AttachmentBuilder(buffer, {
    name: "givecard.png"
  });

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle("🎁 Confirm Gift")
    .setDescription(
      `**${cardInfo.name}**\n` +
      `└ \`${card.code}\` • #${card.serial}\n\n` +
      `Recipient: ${target}`
    )
    .setImage("attachment://givecard.png")
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

  let confirmMsg;

  if (isSlash) {
    confirmMsg = await interaction.reply({
      embeds: [confirmEmbed],
      files: [file],
      components: [row],
      fetchReply: true
    });
  } else {
    confirmMsg = await message.reply({
      embeds: [confirmEmbed],
      files: [file],
      components: [row]
    });
  }

  const collector = confirmMsg.createMessageComponentCollector({
    time: 30000
  });

  collector.on("collect", async btn => {
    if (btn.user.id !== giverId) {
      return btn.reply({
        content: "❌ This is not your gift confirmation.",
        ephemeral: true
      });
    }

    if (btn.customId === "give_cancel") {
      collector.stop("cancelled");

      return btn.update({
        content: "❌ Gift cancelled.",
        embeds: [],
        files: [],
        components: []
      });
    }

    if (btn.customId === "give_confirm") {
      collector.stop("confirmed");

      const freshCard = await collectionsCol.findOne({
        _id: card._id,
        userId: giverId,
        code
      });

      if (!freshCard) {
        return btn.update({
          content: "❌ This card is no longer available.",
          embeds: [],
          files: [],
          components: []
        });
      }

      await collectionsCol.updateOne(
        { _id: card._id },
        {
          $set: {
            userId: receiverId,
            favorite: false
          }
        }
      );

      await removeCardFromAlbums(db, giverId, code);

      const finalBuffer = await renderCard(cardInfo, freshCard.serial, freshCard);

      const finalFile = new AttachmentBuilder(finalBuffer, {
        name: "given-card.png"
      });

      const successEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Card Given")
        .setDescription(
          `${author} gave **${cardInfo.name}** to ${target}\n\n` +
          `Code: \`${freshCard.code}\`\n` +
          `Serial: **#${freshCard.serial}**`
        )
        .setImage("attachment://given-card.png")
        .setTimestamp();

      return btn.update({
        content: "",
        embeds: [successEmbed],
        files: [finalFile],
        components: []
      });
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "time") {
      await confirmMsg.edit({
        content: "⌛ Gift confirmation expired.",
        embeds: [],
        files: [],
        components: []
      }).catch(() => {});
    }
  });
}

module.exports = {
  name: "give",
  aliases: ["gift"],

  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give a card to another user")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("User to give the card to")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription("Card code")
        .setRequired(true)
    ),

  async execute(message, args) {
    const target = message.mentions.users.first();
    const code = args.find(arg => !arg.startsWith("<@"));

    return runGive({
      message,
      target,
      code
    });
  },

  async slashExecute(interaction) {
    const target = interaction.options.getUser("user");
    const code = interaction.options.getString("code");

    return runGive({
      interaction,
      target,
      code
    });
  }
};