const {
  PermissionsBitField,
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "setdrop",

  async execute(message) {

    if (

      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )

    ) {

      return message.reply(

        "❌ Only admins can use this command."

      );

    }

    const channel =
      message.mentions.channels.first();

    if (!channel) {

      return message.reply(

        "❌ Mention a channel.\n\n" +

        "Example:\n" +

        "`!setdrop #drops`"

      );

    }

    const db =
      await connectDB();

    const dropChannelsCol =
      db.collection("dropChannels");

    await dropChannelsCol.updateOne(

      {
        guildId:
          message.guild.id
      },

      {
        $set: {

          guildId:
            message.guild.id,

          channelId:
            channel.id

        }
      },

      {
        upsert: true
      }

    );

    const embed =
      new EmbedBuilder()

        .setColor(0x00ff99)

        .setTitle(
          "✅ Drop Channel Set"
        )

        .setDescription(

          `Automatic drops will now appear in:\n\n` +

          `${channel}`

        );

    await message.reply({

      embeds: [embed]

    });

  }

};