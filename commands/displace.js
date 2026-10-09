const { SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

module.exports = {
  name: "displace",
  aliases: ["removefromalbum"],

  data: new SlashCommandBuilder()
    .setName("displace")
    .setDescription("Remove a card from an album slot.")
    .addStringOption(option =>
      option
        .setName("album")
        .setDescription("Album name")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("page")
        .setDescription("Page number")
        .setMinValue(1)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("slot")
        .setDescription("Slot number")
        .setMinValue(1)
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

      if (!slash && args.length < 3) {
        return await reply(
          "❌ Use: `!displace <album name> <page> <slot>`\n" +
          "Example: `!displace The Avengers 1 2`"
        );
      }

      const albumName = (
        slash
          ? message.options.getString("album", true)
          : args.slice(0, -2).join(" ")
      ).trim();

      const pageNumber = slash
        ? message.options.getInteger("page", true)
        : Number(args[args.length - 2]);

      const slotNumber = slash
        ? message.options.getInteger("slot", true)
        : Number(args[args.length - 1]);

      if (!albumName) {
        return await reply("❌ Provide an album name.");
      }

      if (
        !Number.isSafeInteger(pageNumber) ||
        pageNumber < 1
      ) {
        return await reply(
          "❌ Invalid page number. Enter a positive whole number."
        );
      }

      if (
        !Number.isSafeInteger(slotNumber) ||
        slotNumber < 1
      ) {
        return await reply(
          "❌ Invalid slot number. Enter a positive whole number."
        );
      }

      const db = await connectDB();
      const albums = db.collection("albums");

      const escapedName = albumName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const album = await albums.findOne({
        userId: user.id,
        name: {
          $regex: `^${escapedName}$`,
          $options: "i"
        }
      });

      if (!album) {
        return await reply("❌ Album not found.");
      }

      const page = album.pages?.[pageNumber - 1];

      if (!page) {
        return await reply("❌ Page not found.");
      }

      const placed = page.slots?.[slotNumber - 1];

      if (!placed) {
        return await reply("❌ No card in that slot.");
      }

      const slotPath =
        `pages.${pageNumber - 1}.slots.${slotNumber - 1}`;

      // Clear only this slot.
      // Require it to still contain the same card.
      const result = await albums.updateOne(
        {
          _id: album._id,
          userId: user.id,
          [slotPath]: placed
        },
        {
          $set: {
            [slotPath]: null
          }
        }
      );

      if (!result.matchedCount) {
        return await reply(
          "❌ That slot changed. Please check your album and try again."
        );
      }

      return await reply(
        `✅ Removed card from **${album.name}** ` +
        `• Page **${pageNumber}** ` +
        `• Slot **${slotNumber}**`
      );
    } catch (error) {
      console.error("[displace]", error);

      const payload = {
        content:
          "❌ Could not remove the card. Please try again."
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