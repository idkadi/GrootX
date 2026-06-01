const { EmbedBuilder } = require("discord.js");
const Card = require("../models/Card");

module.exports = {
  name: "favcards",
  aliases: ["favorites", "favs"],

  async execute(message) {
    const cards = await Card.find({
      userId: message.author.id,
      favorite: true
    }).sort({ serial: 1 });

    if (!cards.length) {
      return message.reply("❌ You have no favorite cards.");
    }

    const list = cards
      .map(card => {
        const tag = card.tag ? ` | 🏷️ ${card.tag}` : "";
        return `\`${card.code}\` • #${card.serial} • Card ID: ${card.cardId}${tag}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`⭐ ${message.author.username}'s Favorite Cards`)
      .setDescription(list.length > 4096 ? list.slice(0, 4000) + "\n..." : list);

    return message.reply({ embeds: [embed] });
  }
};