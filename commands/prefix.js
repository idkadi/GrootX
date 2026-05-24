const {
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

const connectDB = require("../database");

module.exports = {
  name: "prefix",

  async execute(message, args) {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return message.reply(
        "❌ You need Administrator permission."
      );
    }

    if (!args[0]) {
      return message.reply(
        "❌ Please provide a prefix."
      );
    }

    const newPrefix = args[0];

    const db = await connectDB();

    const prefixesCol = db.collection("prefixes");

    await prefixesCol.updateOne(
      {
        guildId: message.guild.id
      },
      {
        $set: {
          prefix: newPrefix
        }
      },
      {
        upsert: true
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("⚙️ Prefix Updated")
      .setDescription(
        `New server prefix:\n` +
        `\`${newPrefix}\``
      )
      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });
  }
};