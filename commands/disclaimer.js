const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "disclaimer",
  aliases: ["disc"],

  async execute(message) {

    const embed = new EmbedBuilder()

      .setColor(0xff0000)

      .setTitle("⚠️ Disclaimer")

      .setDescription(
        "GrootX is a fan-made Marvel card collection bot inspired by collectible card systems.\n\n" +

        "This bot is NOT affiliated with Marvel, Disney, or Sony.\n\n" +

        "All characters, images, and franchises belong to their respective owners.\n\n" +

        "This Bot is not made with the purpose of earning any profits."
      )

      .setFooter({
        text: "GrootX • Fan Project"
      })

      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });

  }

};