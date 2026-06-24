const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require("discord.js");

module.exports = {
  name: "vote",

  async execute(message) {
    const botId = message.client.user.id;

    const voteUrl =
      `https://top.gg/bot/${botId}/vote`;

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("🗳️ Vote for GrootX")
      .setDescription(
        "Vote for GrootX on Top.gg and receive:\n\n" +
        "<:grootcoin:1504742213110861834> **700 Coins**\n" +
        "<:chipslogo:1519287944421048320> **1 Ultron Chip**\n\n" +
        "Rewards are given after your vote is verified."
      )
      .setFooter({
        text: "Thanks for supporting GrootX!"
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Vote on Top.gg")
        .setStyle(ButtonStyle.Link)
        .setURL(voteUrl)
    );

    await message.reply({
      embeds: [embed],
      components: [row]
    });
  }
};