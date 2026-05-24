const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "albums",

  async execute(message) {

    const db =
      await connectDB();

    const albumsCol =
      db.collection("albums");

    const userId =
      message.author.id;

    const userAlbums =
      await albumsCol.find({
        userId
      }).toArray();

    if (userAlbums.length === 0) {

      return message.reply(
        "❌ You have no albums.\nBuy one with `!buy album`."
      );

    }

    const list =
      userAlbums.map((album, index) => {
        return (
          `**${index + 1}. ${album.name}**\n` +
          `└ Pages: ${album.pages?.length || 0}`
        );
      }).join("\n\n");

    const embed =
      new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(
          `📚 ${message.author.username}'s Albums`
        )
        .setDescription(list)
        .setFooter({
          text:
            "Use !addpage <album name> to add pages."
        })
        .setTimestamp();

    await message.reply({
      embeds: [embed]
    });

  }

};