const {
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");

module.exports = {
  name: "unfav",
  aliases: ["unfavorite"],

  async execute(message, args) {
    if (!args[0]) {
      return message.reply(
        "❌ Please provide a card code.\n" +
        "Example: `!unfav q7mz2x`"
      );
    }

    const code = args[0].toLowerCase();

    const db = await connectDB();

    const collectionsCol = db.collection("collections");

    const userId = message.author.id;

    const cardEntry = await collectionsCol.findOne({
      userId,
      code
    });

    if (!cardEntry) {
      return message.reply("❌ Card not found.");
    }

    if (cardEntry.favorite !== true) {
      return message.reply(
        "❌ This card is not favorited."
      );
    }

    await collectionsCol.updateOne(
      {
        _id: cardEntry._id
      },
      {
        $set: {
          favorite: false
        }
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle("💔 Card Unfavorited")
      .setDescription(
        `Removed protection from:\n\n` +
        `└ ${cardEntry.code}`
      )
      .setFooter({
        text:
          "This card can now be burned or traded."
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};