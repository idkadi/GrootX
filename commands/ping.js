const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

module.exports = {
  name: "ping",
  aliases: ["p"],

  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check GrootX latency"),

  async execute(message) {
    const latency =
      Date.now() - message.createdTimestamp;

    const apiLatency =
      Math.round(message.client.ws.ping);

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
  },

  async slashExecute(interaction) {
    const apiLatency =
      Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("🏓 Pong!")
      .addFields(
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

    await interaction.reply({
      embeds: [embed]
    });
  }
};