const connectDB = require("../database");

const {
  EmbedBuilder
} = require("discord.js");

module.exports = {
  name: "taglist",
  aliases: ["tags"],

  async execute(message) {
    const db = await connectDB();

    const createdTagsCol = db.collection("createdtags");

    const userId = message.author.id;

    const tags = await createdTagsCol
      .find({ userId })
      .sort({ name: 1 })
      .toArray();

    if (!tags.length) {
      return message.reply("❌ You have no created tags.");
    }

    const description = tags
      .map(tag => `${tag.emoji} • **${tag.name}**`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle(`🏷️ ${message.author.username}'s Tags`)
      .setDescription(description)
      .setFooter({
        text: `Total Tags: ${tags.length}`
      })
      .setTimestamp();

    return message.reply({
      embeds: [embed]
    });
  }
};