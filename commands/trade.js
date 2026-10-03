const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

module.exports = {
  name: "tag",

  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Tag an owned card, or your latest card if code is omitted.")
    .addStringOption(option =>
      option.setName("name")
        .setDescription("An existing tag name, or remove to clear the tag")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("code")
        .setDescription("Owned card code; leave empty for your latest card")
    ),

  async execute(message, args = []) {
    const slash = typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const userId = (slash ? message.user : message.author).id;

    const reply = payload => {
      if (typeof payload === "string") payload = { content: payload };
      payload.allowedMentions = { parse: [], repliedUser: false };

      if (!slash) return message.reply(payload);
      if (message.deferred) return message.editReply(payload);
      if (message.replied) return message.followUp(payload);
      return message.reply(payload);
    };

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      const explicitCode = slash
        ? message.options.getString("code")
        : args.length > 1 ? args[0] : null;

      const tagName = String(
        slash
          ? message.options.getString("name", true)
          : args.length > 1 ? args[1] : args[0] || ""
      ).trim().toLowerCase();

      const requestedCode = String(explicitCode || "")
        .trim()
        .toLowerCase();

      if (!tagName || (!slash && args.length > 2)) {
        return await reply(
          "❌ Use `!tag tagname` for your latest card or `!tag code tagname`.\n" +
          "Slash: `/tag name:tagname code:cardcode` (code is optional).\n" +
          "Use `remove` as the tag name to clear a tag."
        );
      }

      const db = await connectDB();
      const collectionsCol = db.collection("collections");
      const createdTagsCol = db.collection("createdtags");
      const cardTagsCol = db.collection("cardtags");

      // Supports owned S0, S1, and event cards without catalog checks.
      const card = requestedCode
        ? await collectionsCol.findOne({
            userId,
            code: requestedCode
          })
        : await collectionsCol.findOne(
            { userId },
            {
              sort: {
                obtainedAt: -1,
                claimedAt: -1,
                createdAt: -1,
                _id: -1
              }
            }
          );

      if (!card) {
        return await reply(
          requestedCode
            ? "❌ Card not found in your collection."
            : "❌ You have no collected cards."
        );
      }

      if (!card.code) {
        return await reply(
          "❌ This card has no code. Please report it to the bot owner."
        );
      }

      const code = card.code;
      let createdTag;

      if (tagName === "remove") {
        const result = await cardTagsCol.deleteMany({
          userId,
          code
        });

        if (!result.deletedCount) {
          return await reply("ℹ️ This card has no tag to remove.");
        }
      } else {
        createdTag = await createdTagsCol.findOne({
          userId,
          name: tagName
        });

        if (!createdTag) {
          return await reply(
            "❌ That tag does not exist. Create it first, then apply it."
          );
        }

        await cardTagsCol.updateOne(
          { userId, code },
          {
            $set: {
              tagName,
              emoji: createdTag.emoji || "🏷️",
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      }

      const seasonValue = String(
        card.season ?? card.cardSeason ?? 0
      ).toLowerCase();

      const season =
        seasonValue === "s1" || seasonValue === "1" ? 1 : 0;

      const eventText = card.event
        ? `\nEvent: **${
            String(card.event).toLowerCase() === "halloween2026"
              ? "🎃 Halloween 2026"
              : String(card.event).slice(0, 100)
          }**`
        : "";

      const tagDisplay = tagName === "remove"
        ? ""
        : `\nTag: ${createdTag.emoji || "🏷️"} **${tagName.slice(0, 100)}**`;

      const embed = new EmbedBuilder()
        .setColor(tagName === "remove" ? 0xff5555 : 0x57f287)
        .setTitle(
          tagName === "remove" ? "🏷️ Tag Removed" : "🏷️ Card Tagged"
        )
        .setDescription(
          `└ \`${code}\`\n${SEASON_EMOJIS[season]} **Season ${season}**` +
          eventText +
          tagDisplay
        )
        .setFooter({
          text: requestedCode
            ? "Your collection"
            : "Applied to your latest collected card"
        })
        .setTimestamp();

      return await reply({ embeds: [embed] });
    } catch (error) {
      console.error("[TAG]", error);

      try {
        return await reply(
          "❌ Could not update the card's tag. Please try again."
        );
      } catch (replyError) {
        console.error("[TAG] Reply failed:", replyError);
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;