const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");
const frames = require("../data/frames");

class FrameError extends Error {}

const emptyFrame = {
  $or: [
    { frameId: { $exists: false } },
    { frameId: null },
    { frameId: "" }
  ]
};

module.exports = {
  name: "placeframe",
  aliases: ["putframe", "applyframe"],

  data: new SlashCommandBuilder()
    .setName("placeframe")
    .setDescription(
      "Apply an unused custom frame to an owned card."
    )
    .addStringOption(option =>
      option
        .setName("cardcode")
        .setDescription("Owned card code")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("framecode")
        .setDescription("Purchased 6-character frame code")
        .setRequired(true)
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const userId = (
      slash ? message.user : message.author
    ).id;

    const reply = content => {
      const payload = {
        content,
        allowedMentions: {
          parse: [],
          repliedUser: false
        }
      };

      return slash
        ? message.editReply(payload)
        : message.reply(payload);
    };

    let session;

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      if (!slash && args.length !== 2) {
        return await reply(
          "❌ Use: `!placeframe <cardcode> <framecode>`\n" +
          "Example: `!placeframe abc123 XYZ789`"
        );
      }

      const cardCode = String(
        slash
          ? message.options.getString("cardcode", true)
          : args[0]
      ).trim().toLowerCase();

      const frameCode = String(
        slash
          ? message.options.getString("framecode", true)
          : args[1]
      ).trim().toUpperCase();

      if (
        !cardCode ||
        !/^[A-Z0-9]{6}$/.test(frameCode)
      ) {
        return await reply(
          "❌ Enter a card code and a valid " +
          "6-character frame code."
        );
      }

      const db = await connectDB();

      // Use the MongoClient that owns this database.
      if (
        !db.client ||
        typeof db.client.startSession !== "function"
      ) {
        throw new Error(
          "database.js must return a MongoDB Db " +
          "with its client available for sessions."
        );
      }

      session = db.client.startSession();

      // Consume the frame and equip the card together.
      // If either update fails, both are rolled back.
      await session.withTransaction(
        async () => {
          const cards = db.collection("collections");
          const inventory = db.collection("frameInventory");

          const owned = await cards.findOne(
            {
              userId,
              code: cardCode
            },
            { session }
          );

          if (!owned) {
            throw new FrameError(
              "❌ You don't own that card code."
            );
          }

          if (
            owned.frameId != null &&
            String(owned.frameId) !== ""
          ) {
            throw new FrameError(
              "❌ This card already has a custom frame. " +
              "Your unused frame was not consumed."
            );
          }

          const item = await inventory.findOne(
            {
              userId,
              code: frameCode
            },
            { session }
          );

          if (!item) {
            throw new FrameError(
              "❌ You don't own that frame code."
            );
          }

          if (item.used !== false) {
            throw new FrameError(
              "❌ This frame code is already used " +
              "or unavailable."
            );
          }

          const matches = Array.isArray(frames)
            ? frames.filter(frame =>
                frame.id != null &&
                item.frameId != null &&
                String(frame.id) === String(item.frameId)
              )
            : [];

          if (matches.length !== 1) {
            throw new FrameError(
              "❌ This frame's catalog entry is " +
              "missing or ambiguous."
            );
          }

          const frame = matches[0];

          if (
            typeof frame.image !== "string" ||
            !fs.existsSync(
              path.resolve(__dirname, "..", frame.image)
            )
          ) {
            throw new FrameError(
              "❌ This frame's image is unavailable. " +
              "Your frame was not consumed."
            );
          }

          const consumed = await inventory.updateOne(
            {
              _id: item._id,
              userId,
              used: false
            },
            {
              $set: {
                used: true,
                usedAt: Date.now(),
                cardCode: owned.code
              }
            },
            { session }
          );

          if (!consumed.matchedCount) {
            throw new FrameError(
              "❌ This frame changed. Please try again."
            );
          }

          // Works with all seasons and events because
          // the exact owned card is identified by its code.
          const applied = await cards.updateOne(
            {
              _id: owned._id,
              userId,
              ...emptyFrame
            },
            {
              $set: {
                frameId: frame.id
              }
            },
            { session }
          );

          if (!applied.matchedCount) {
            throw new FrameError(
              "❌ This card changed. Please try again."
            );
          }
        },
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" }
        }
      );

      await reply(
        `✅ Applied frame \`${frameCode}\` ` +
        `to card \`${cardCode}\`.\n` +
        `Use \`!view ${cardCode}\` to see it. ` +
        "Newly generated album and trade previews " +
        "will also show it with the updated renderer."
      );
    } catch (error) {
      console.error("[placeframe]", error);

      const content =
        error instanceof FrameError
          ? error.message
          : "❌ Could not finish applying the frame. " +
            "Check the card and frame inventory before retrying.";

      if (
        slash &&
        !message.deferred &&
        !message.replied
      ) {
        await message.reply({
          content,
          allowedMentions: { parse: [] }
        }).catch(() => {});
      } else {
        await reply(content).catch(() => {});
      }
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;