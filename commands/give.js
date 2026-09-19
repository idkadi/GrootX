const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const cards = require("../data/cards");       // Season 0
const season1 = require("../data/season1");   // Season 1
const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

async function runGive({ message, interaction, target, code }) {
  const isSlash = !!interaction;

  const author = isSlash ? interaction.user : message.author;
  const replyTarget = isSlash ? interaction : message;

  // =====================================================
  // VALIDATION
  // =====================================================

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

  // =====================================================
  // DATABASE
  // =====================================================

  const db = await connectDB();
  const collectionsCol = db.collection("collections");

  const giverId = author.id;
  const receiverId = target.id;

  // Find owned card
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

  // Favorited cards cannot be given
  if (card.favorite) {
    return replyTarget.reply({
      content: "⭐ You cannot give a favorited card.",
      ephemeral: isSlash ? true : undefined
    });
  }

  // =====================================================
  // RESOLVE CARD DATA BY SEASON
  // =====================================================

  // Legacy cards without season are treated as Season 0
  const season = Number(card.season ?? 0);

  let cardInfo;

  if (season === 1) {
    // Season 1
    cardInfo = season1.find(
      c => Number(c.id) === Number(card.cardId)
    );
  } else {
    // Season 0
    cardInfo = cards.find(
      c => Number(c.id) === Number(card.cardId)
    );
  }

  if (!cardInfo) {
    return replyTarget.reply({
      content: `❌ Card data not found for Season ${season}.`,
      ephemeral: isSlash ? true : undefined
    });
  }

  // =====================================================
  // RENDER CARD
  // =====================================================

  let buffer;

  try {
    /*
      IMPORTANT:
      Passing the owned card as the third argument lets renderCard()
      detect season and frameId.

      S0 -> old coloured format
      S1 -> rawImage + default/custom frame
    */
    buffer = await renderCard(
      cardInfo,
      card.serial,
      card
    );
  } catch (error) {
    console.error("[GIVE] Card render failed:", error);

    return replyTarget.reply({
      content: "❌ Failed to render this card.",
      ephemeral: isSlash ? true : undefined
    });
  }

  const file = new AttachmentBuilder(buffer, {
    name: "givecard.png"
  });

  // =====================================================
  // CONFIRMATION EMBED
  // =====================================================

  const confirmEmbed = new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle("🎁 Confirm Gift")
    .setDescription(
      `**${cardInfo.name}**\n` +
      `└ \`${card.code}\` • #${card.serial}\n` +
      `└ Season ${season}\n\n` +
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

  // =====================================================
  // SEND CONFIRMATION
  // =====================================================

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

  // =====================================================
  // BUTTON COLLECTOR
  // =====================================================

  const collector = confirmMsg.createMessageComponentCollector({
    time: 30000
  });

  collector.on("collect", async btn => {

    // Only giver can use buttons
    if (btn.user.id !== giverId) {
      return btn.reply({
        content: "❌ This is not your gift confirmation.",
        ephemeral: true
      });
    }

    // ===================================================
    // CANCEL
    // ===================================================

    if (btn.customId === "give_cancel") {
      collector.stop("cancelled");

      return btn.update({
        content: "❌ Gift cancelled.",
        embeds: [],
        files: [],
        components: []
      });
    }

    // ===================================================
    // CONFIRM
    // ===================================================

    if (btn.customId === "give_confirm") {
      await btn.deferUpdate();

      collector.stop("confirmed");

      /*
        Re-check ownership.

        This prevents duplicate transfers if the card was
        traded/given/burned while the confirmation was open.
      */
      const freshCard = await collectionsCol.findOne({
        _id: card._id,
        userId: giverId,
        code
      });

      if (!freshCard) {
        return confirmMsg.edit({
          content: "❌ This card is no longer available.",
          embeds: [],
          files: [],
          components: []
        });
      }

      // Check favorite again in case it changed
      if (freshCard.favorite) {
        return confirmMsg.edit({
          content: "⭐ This card is now favorited and cannot be given.",
          embeds: [],
          files: [],
          components: []
        });
      }

      // =================================================
      // TRANSFER OWNERSHIP
      // =================================================

      /*
        Only userId + favorite are changed.

        season
        cardId
        serial
        frameId
        code

        all remain untouched.
      */

      const transferResult = await collectionsCol.updateOne(
        {
          _id: card._id,
          userId: giverId
        },
        {
          $set: {
            userId: receiverId,
            favorite: false
          }
        }
      );

      // Extra protection against race conditions
      if (transferResult.modifiedCount !== 1) {
        return confirmMsg.edit({
          content: "❌ Card transfer failed because the card is no longer available.",
          embeds: [],
          files: [],
          components: []
        });
      }

      // Remove from giver's albums
      await removeCardFromAlbums(
        db,
        giverId,
        code
      );

      // =================================================
      // FINAL CARD RENDER
      // =================================================

      let finalBuffer;

      try {
        /*
          freshCard still contains:
          season
          frameId
          serial

          so renderCard knows exactly how to render it.
        */
        finalBuffer = await renderCard(
          cardInfo,
          freshCard.serial,
          freshCard
        );
      } catch (error) {
        console.error("[GIVE] Final card render failed:", error);

        /*
          Transfer already happened, so don't tell the user
          that the transfer itself failed.
        */
        return confirmMsg.edit({
          content:
            `✅ ${author} gave **${cardInfo.name}** to ${target}\n\n` +
            `Code: \`${freshCard.code}\`\n` +
            `Serial: **#${freshCard.serial}**\n` +
            `Season: **${season}**`,
          embeds: [],
          files: [],
          components: []
        });
      }

      const finalFile = new AttachmentBuilder(finalBuffer, {
        name: "given-card.png"
      });

      // =================================================
      // SUCCESS EMBED
      // =================================================

      const successEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Card Given")
        .setDescription(
          `${author} gave **${cardInfo.name}** to ${target}\n\n` +
          `Code: \`${freshCard.code}\`\n` +
          `Serial: **#${freshCard.serial}**\n` +
          `Season: **${season}**`
        )
        .setImage("attachment://given-card.png")
        .setTimestamp();

      return confirmMsg.edit({
        content: "",
        embeds: [successEmbed],
        files: [finalFile],
        components: []
      });
    }
  });

  // =====================================================
  // CONFIRMATION TIMEOUT
  // =====================================================

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

// =======================================================
// COMMAND EXPORT
// =======================================================

module.exports = {
  name: "give",
  aliases: ["gift"],

  // =====================================================
  // SLASH COMMAND
  // =====================================================

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

  // =====================================================
  // PREFIX COMMAND
  // =====================================================

  async execute(message, args) {
    const target = message.mentions.users.first();

    /*
      Example:
      !give @Spidey abc123

      Find argument that isn't the mention.
    */
    const code = args.find(
      arg => !arg.startsWith("<@")
    );

    return runGive({
      message,
      target,
      code
    });
  },

  // =====================================================
  // SLASH EXECUTION
  // =====================================================

  async slashExecute(interaction) {
    const target =
      interaction.options.getUser("user");

    const code =
      interaction.options.getString("code");

    return runGive({
      interaction,
      target,
      code
    });
  }
};