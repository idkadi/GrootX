const connectDB = require("../database");

const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "taglist",
  aliases: ["tags"],

  async execute(message) {

    const db =
      await connectDB();

    const tagsCol =
      db.collection("tags");

    const userId =
      message.author.id;

    // ONLY CREATED TAGS
    const tags =
      await tagsCol.find({

        userId,
        cardCode: null

      }).toArray();

    if (!tags.length) {

      return message.reply(
        "❌ You have no created tags."
      );

    }

    const description =
      tags.map(tag =>

        `${tag.emoji} • **${tag.tag}**`

      ).join("\n");

    const embed =
      new EmbedBuilder()

        .setColor(0x00aeff)

        .setTitle(
          `🏷️ ${message.author.username}'s Tags`
        )

        .setDescription(
          description
        )

        .setFooter({

          text:
            `Total Tags: ${tags.length}`

        })

        .setTimestamp();

    return message.reply({
      embeds: [embed]
    });

  }

};