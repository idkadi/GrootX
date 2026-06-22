const connectDB = require("../database");

module.exports = {
  name: "renamealbum",
  aliases: ["albumrename"],

  async execute(message, args) {
    if (args.length < 2) {
      return message.reply(
        "❌ Usage: `!renamealbum <old album name> | <new album name>`"
      );
    }

    const input = args.join(" ");
    const parts = input.split("|");

    if (parts.length < 2) {
      return message.reply(
        "❌ Usage: `!renamealbum <old album name> | <new album name>`"
      );
    }

    const oldName = parts[0].trim();
    const newName = parts[1].trim();

    if (!oldName || !newName) {
      return message.reply(
        "❌ Both album names are required."
      );
    }

    const db = await connectDB();
    const albumsCol = db.collection("albums");

    const userId = message.author.id;

    const album = await albumsCol.findOne({
      userId,
      name: oldName
    });

    if (!album) {
      return message.reply(
        `❌ Album **${oldName}** not found.`
      );
    }

    const existingAlbum = await albumsCol.findOne({
      userId,
      name: newName
    });

    if (existingAlbum) {
      return message.reply(
        `❌ You already have an album named **${newName}**.`
      );
    }

    await albumsCol.updateOne(
      {
        userId,
        name: oldName
      },
      {
        $set: {
          name: newName
        }
      }
    );

    return message.reply(
      `✅ Renamed album **${oldName}** → **${newName}**`
    );
  }
};