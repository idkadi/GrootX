const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "invite",

  async execute(message) {

    const clientId =
      message.client.user.id;

    const inviteLink =
`https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274878221376&scope=bot%20applications.commands`;

    const embed =
      new EmbedBuilder()

        .setColor(0x00aeff)

        .setTitle(
          "🔗 Invite GrootX"
        )

        .setDescription(

          `[Click Here To Invite GrootX](${inviteLink})`

        )

        .setFooter({

          text:
            "Thank you for supporting GrootX 💚"

        })

        .setTimestamp();

    return message.reply({
      embeds: [embed]
    });

  }

};