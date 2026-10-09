const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

const asCards = data =>
  Array.isArray(data) ? data : data?.cards || [];

const eventKey = value =>
  String(value || "").trim().toLowerCase();

const escapeRegex = value =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  name: "place",
  aliases: ["albumadd"],

  data: new SlashCommandBuilder()
    .setName("place")
    .setDescription("Place an owned card in an album slot.")
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
    )
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription("Owned card code")
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
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      if (!slash && args.length < 4) {
        return await reply(
          "❌ Use: `!place <album name> <page> <slot> <card code>`\n" +
          "Example: `!place The Avengers 1 2 abc123`"
        );
      }

      const albumName = (
        slash
          ? message.options.getString("album", true)
          : args.slice(0, -3).join(" ")
      ).trim();

      const pageNumber = slash
        ? message.options.getInteger("page", true)
        : Number(args[args.length - 3]);

      const slotNumber = slash
        ? message.options.getInteger("slot", true)
        : Number(args[args.length - 2]);

      const code = String(
        slash
          ? message.options.getString("code", true)
          : args[args.length - 1]
      ).trim().toLowerCase();

      if (
        !albumName ||
        !code ||
        !Number.isSafeInteger(pageNumber) ||
        pageNumber < 1 ||
        !Number.isSafeInteger(slotNumber) ||
        slotNumber < 1
      ) {
        return await reply(
          "❌ Enter an album name, positive whole " +
          "page/slot numbers, and a card code."
        );
      }

      const db = await connectDB();
      const albums = db.collection("albums");

      const album = await albums.findOne({
        userId: user.id,
        name: {
          $regex: `^${escapeRegex(albumName)}$`,
          $options: "i"
        }
      });

      if (!album) {
        return await reply("❌ Album not found.");
      }

      const page = album.pages?.[pageNumber - 1];

      if (!page) {
        return await reply("❌ That page does not exist.");
      }

      if (page.layout == null) {
        return await reply("❌ This page has no layout.");
      }

      const layouts = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, "../data/layouts/slots.json"),
          "utf8"
        )
      );

      const positions = layouts[String(page.layout)];

      if (!Array.isArray(positions)) {
        return await reply(
          "❌ This page's layout is unavailable."
        );
      }

      if (slotNumber > positions.length) {
        return await reply(
          `❌ This layout has ${positions.length} slots. ` +
          `Choose 1–${positions.length}.`
        );
      }

      const owned = await db
        .collection("collections")
        .findOne({
          userId: user.id,
          code
        });

      if (!owned) {
        return await reply(
          `❌ You don't own card code **${code}**.`
        );
      }

      const value = String(
        owned.season ?? owned.cardSeason ?? 0
      ).trim().toLowerCase();

      if (!/^s?\d+$/.test(value)) {
        return await reply(
          "❌ This card has an invalid season."
        );
      }

      const season = Number(value.replace(/^s/, ""));

      if (!Number.isSafeInteger(season)) {
        return await reply(
          "❌ This card has an invalid season."
        );
      }

      const catalogPath = path.join(
        __dirname,
        "../data",
        season === 0 ? "cards.js" : `season${season}.js`
      );

      if (!fs.existsSync(catalogPath)) {
        return await reply(
          `❌ The S${season} card catalog is unavailable.`
        );
      }

      const catalog = asCards(require(catalogPath));

      if (!Array.isArray(catalog)) {
        return await reply(
          "❌ This season's card catalog is invalid."
        );
      }

      const candidates = catalog.filter(card =>
        card.id != null &&
        owned.cardId != null &&
        String(card.id) === String(owned.cardId)
      );

      const matches = candidates.filter(entry =>
        eventKey(entry.event) === eventKey(owned.event)
      );

      const card =
        matches.length === 1
          ? matches[0]
          : !eventKey(owned.event) && candidates.length === 1
            ? candidates[0]
            : null;

      if (!card) {
        return await reply(
          "❌ Card data is missing or ambiguous. " +
          "Please report its code."
        );
      }

      const slotData = {
        cardId: owned.cardId,
        code: owned.code,
        season,
        event: owned.event || card.event || null
      };

      // viewalbum reads the equipped frame live from collections.
      // Store the owned card identity instead of a frame snapshot.
      const pagePath = `pages.${pageNumber - 1}`;
      const slotPath = `${pagePath}.slots.${slotNumber - 1}`;

      const query = {
        _id: album._id,
        userId: user.id,
        [`${pagePath}.layout`]: page.layout
      };

      const update = Array.isArray(page.slots)
        ? {
            $set: {
              [slotPath]: slotData
            }
          }
        : {
            $set: {
              [`${pagePath}.slots`]: Array.from(
                { length: slotNumber },
                (_, index) =>
                  index === slotNumber - 1
                    ? slotData
                    : null
              )
            }
          };

      // Protect initialization from concurrent changes.
      if (!Array.isArray(page.slots)) {
        query[`${pagePath}.slots`] =
          page.slots === undefined
            ? { $exists: false }
            : page.slots;
      }

      const result = await albums.updateOne(
        query,
        update
      );

      if (!result.matchedCount) {
        return await reply(
          "❌ This page changed while placing your card. " +
          "Please try again."
        );
      }

      return await reply(
        `✅ Placed **${card.name}** (${owned.code}) ` +
        `in **${album.name}** • Page **${pageNumber}** ` +
        `• Slot **${slotNumber}**`
      );
    } catch (error) {
      console.error("[place]", error);

      const payload = {
        content:
          "❌ Could not place your card. Please try again."
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