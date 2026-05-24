const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "ping",
  aliases: ["p"],

  async execute(message) {

    // BOT LATENCY
    const latency =
      Date.now() -
      message.createdTimestamp;

    // API LATENCY
    const apiLatency =
      Math.round(
        message.client.ws.ping
      );

    const embed = new EmbedBuilder()

      .setColor(0x00ff99)

      .setTitle("🏓 Pong!")

      .addFields(

        {
          name: "📡 Bot Latency",
          value: `${latency}ms`,
          inline: true
        },

        {
          name: "🌐 API Latency",
          value: `${apiLatency}ms`,
          inline: true
        }

      )

      .setFooter({
        text: "GrootX Status System"
      })

      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });

  }

};