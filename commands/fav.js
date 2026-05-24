const {
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");

module.exports = {
  name: "fav",
  aliases: ["favorite"],

  async execute(message, args) {
    if (!args[0]) {
      return message.reply(
        "❌ Please provide a card code.\n" +
        "Example: `!fav q7mz2x`"
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

    if (cardEntry.favorite) {
      return message.reply(
        "⭐ This card is already favorited."
      );
    }

    await collectionsCol.updateOne(
      {
        _id: cardEntry._id
      },
      {
        $set: {
          favorite: true
        }
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⭐ Card Favorited")
      .setDescription(
        `Protected card:\n\n` +
        `└ \`${cardEntry.code}\``
      )
      .setFooter({
        text:
          "Favorited cards cannot be burned or traded."
      })
      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });
  }
};