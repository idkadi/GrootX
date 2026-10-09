const { SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

const escapeRegex = value =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  name: "renamealbum",
  aliases: ["albumrename"],

  data: new SlashCommandBuilder()
    .setName("renamealbum")
    .setDescription("Rename one of your albums.")
    .addStringOption(option =>
      option
        .setName("album")
        .setDescription("Current album name")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("New album name")
        .setMinLength(1)
        .setMaxLength(100)
        .setRequired(true)
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;

    const reply = payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      return slash
        ? message.editReply(payload)
        : message.reply(payload);
    };

    try {
      if (
        slash &&
        !message.deferred &&
        !message.replied
      ) {
        await message.deferReply();
      }

      const parts = slash
        ? [
            message.options.getString("album", true),
            message.options.getString("name", true)
          ]
        : args.join(" ").split("|");

      if (parts.length !== 2) {
        return await reply(
          "❌ Use: `!renamealbum <old album name> | <new album name>`"
        );
      }

      const [oldName, newName] = parts.map(
        part => part.trim()
      );

      if (!oldName || !newName) {
        return await reply(
          "❌ Both album names are required."
        );
      }

      if (newName.length > 100) {
        return await reply(
          "❌ Album names can contain at most 100 characters."
        );
      }

      const db = await connectDB();
      const albums = db.collection("albums");

      const album = await albums.findOne({
        userId: user.id,
        name: {
          $regex: `^${escapeRegex(oldName)}$`,
          $options: "i"
        }
      });

      if (!album) {
        return await reply("❌ Album not found.");
      }

      if (album.name === newName) {
        return await reply(
          "ℹ️ Your album already has that name."
        );
      }

      // Exclude this album so changing capitalization is allowed.
      const existing = await albums.findOne({
        userId: user.id,
        _id: { $ne: album._id },
        name: {
          $regex: `^${escapeRegex(newName)}$`,
          $options: "i"
        }
      });

      if (existing) {
        return await reply(
          `❌ You already have an album named **${newName}**.`
        );
      }

      const result = await albums.updateOne(
        {
          _id: album._id,
          userId: user.id,
          name: album.name
        },
        {
          $set: {
            name: newName
          }
        }
      );

      if (!result.matchedCount) {
        return await reply(
          "❌ This album changed or was removed. Please try again."
        );
      }

      return await reply(
        `✅ Renamed album **${album.name}** → **${newName}**`
      );
    } catch (error) {
      console.error("[renamealbum]", error);

      const payload = {
        content:
          "❌ Could not rename your album. Please try again."
      };

      if (
        slash &&
        !message.deferred &&
        !message.replied
      ) {
        await message.reply(payload).catch(() => {});
      } else {
        await reply(payload).catch(() => {});
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;