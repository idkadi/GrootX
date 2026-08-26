const cards = require("../data/season1");
const { AttachmentBuilder } = require("discord.js");
const renderCard = require("../utils/renderCard");

module.exports = {
  name: "render",

  async execute(message, args) {
    const input = args[0];

    if (!input) {
      return message.reply("❌ Use: `!render <cardId>`");
    }

    const card = cards.find(c => Number(c.id) === Number(input));

    if (!card) {
      return message.reply("❌ Card not found.");
    }

    if (!card.rawImage && !card.image) {
      return message.reply("❌ This card has no image/rawImage.");
    }

    try {
      const buffer = await renderCard(card, "000000");

      const attachment = new AttachmentBuilder(buffer, {
        name: `render-${card.id}.png`
      });

      return message.reply({
        content: `🎴 Render test: **${card.name}**`,
        files: [attachment]
      });
    } catch (err) {
      console.error(err);
      return message.reply("❌ Failed to render card. Check rawImage path.");
    }
  }
};