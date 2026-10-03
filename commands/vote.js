const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SlashCommandBuilder
} = require("discord.js");

module.exports = {
  name: "vote",

  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for GrootX on Top.gg and view vote rewards."),

  async execute(message) {
    const isSlash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    if (isSlash && !message.deferred && !message.replied) {
      await message.deferReply();
    }

    const botId = message.client.user.id;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;

    const now = Date.now();

    const halloweenActive =
      now >= Date.parse("2026-10-03T00:00:00+05:30") &&
      now < Date.parse("2026-11-01T00:00:00+05:30");

    const embed = new EmbedBuilder()
      .setColor(halloweenActive ? 0xff8c00 : 0x00aeff)
      .setTitle("🗳️ Vote for GrootX")
      .setDescription(
        "Vote for GrootX on Top.gg and receive:\n\n" +
        "<:grootcoin:1504742213110861834> **700 Coins**\n" +
        "<:chipslogo:1519287944421048320> **1 Ultron Chip**\n" +
        (
          halloweenActive
            ? "<:grootcandy:1555950722816675870> **500 Groot Candy**\n"
            : ""
        ) +
        "\nRewards are given after your vote is verified."
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

    const payload = {
      embeds: [embed],
      components: [row]
    };

    return isSlash
      ? message.editReply(payload)
      : message.reply(payload);
  }
};

module.exports.executeSlash = module.exports.execute;