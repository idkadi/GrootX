const { SlashCommandBuilder } = require("discord.js");
const { randomUUID } = require("crypto");
const connectDB = require("../database");

module.exports = {
  name: "createalbum",

  data: new SlashCommandBuilder()
    .setName("createalbum")
    .setDescription("Use an Album item to create a new album.")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Name of your new album")
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

      const albumName = (
        slash
          ? message.options.getString("name", true)
          : args.join(" ")
      ).trim();

      if (!albumName) {
        return await reply(
          "❌ Provide an album name.\n" +
          "Example: `!createalbum Iron-Man`"
        );
      }

      if (albumName.length > 100) {
        return await reply(
          "❌ Album names can contain at most 100 characters."
        );
      }

      const db = await connectDB();
      const inventory = db.collection("inventory");
      const albums = db.collection("albums");
      const userId = user.id;

      const escapedName = albumName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const existing = await albums.findOne({
        userId,
        name: {
          $regex: `^${escapedName}$`,
          $options: "i"
        }
      });

      if (existing) {
        return await reply(
          "❌ You already have an album with this name."
        );
      }

      // Require an available item in the same update that consumes it.
      const consumed = await inventory.updateOne(
        {
          userId,
          "items.album": { $gte: 1 }
        },
        {
          $inc: { "items.album": -1 }
        }
      );

      if (!consumed.modifiedCount) {
        return await reply(
          "❌ You need an Album item.\n" +
          "Buy one using `!buy album`."
        );
      }

      try {
        await albums.insertOne({
          userId,
          id: randomUUID(),
          name: albumName,
          pages: []
        });
      } catch (error) {
        // Restore the consumed item if album creation fails.
        try {
          const refund = await inventory.updateOne(
            { userId },
            {
              $inc: { "items.album": 1 }
            }
          );

          if (!refund.matchedCount) {
            throw new Error(
              "Inventory document missing during refund."
            );
          }
        } catch (refundError) {
          console.error(
            "[createalbum] Item refund failed:",
            {
              userId,
              error: refundError
            }
          );

          await reply(
            "❌ Album creation failed and your Album item " +
            "could not be restored automatically. " +
            "Please contact the bot owner."
          );
          return;
        }

        console.error(
          "[createalbum] Creation failed; item restored:",
          error
        );

        return await reply(
          "❌ Could not create the album. " +
          "Your Album item was restored. Please try again."
        );
      }

      return await reply(
        `📘 Created album **${albumName}**.\n` +
        `Use \`!addpage ${albumName}\` to add a page.`
      );
    } catch (error) {
      console.error("[createalbum]", error);

      const payload = {
        content:
          "❌ Could not complete the command. Please try again."
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