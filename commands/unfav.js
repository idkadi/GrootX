const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

module.exports = {
  name: "unfav",
  aliases: ["unfavorite"],

  data: new SlashCommandBuilder()
    .setName("unfav")
    .setDescription("Remove a favorite from an owned season or event card.")
    .addStringOption(option =>
      option.setName("code")
        .setDescription("The code of the card you own")
        .setRequired(true)
    ),

  async execute(message, args = []) {
    const slash = typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();
    const user = slash ? message.user : message.author;

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

      const code = String(
        slash ? message.options.getString("code", true) : args[0] || ""
      ).trim().toLowerCase();

      if (!code) {
        return await reply(
          "❌ Please provide a card code.\n" +
          "Example: `!unfav q7mz2x` or `/unfav code:q7mz2x`"
        );
      }

      const db = await connectDB();
      const collectionsCol = db.collection("collections");

      // Owned card codes work across S0, S1, and events.
      const cardEntry = await collectionsCol.findOne({
        userId: user.id,
        code
      });

      if (!cardEntry) {
        return await reply("❌ Card not found in your collection.");
      }

      if (cardEntry.favorite !== true) {
        return await reply("💔 This card is not favorited.");
      }

      const result = await collectionsCol.updateOne(
        {
          _id: cardEntry._id,
          userId: user.id,
          favorite: true
        },
        {
          $set: { favorite: false }
        }
      );

      if (result.matchedCount === 0) {
        return await reply(
          "❌ This card's ownership or favorite status changed. Please try again."
        );
      }

      const seasonValue = String(
        cardEntry.season ?? cardEntry.cardSeason ?? 0
      ).toLowerCase();

      const season =
        seasonValue === "s1" || seasonValue === "1" ? 1 : 0;

      const eventText = cardEntry.event
        ? `\nEvent: **${
            String(cardEntry.event).toLowerCase() === "halloween2026"
              ? "🎃 Halloween 2026"
              : String(cardEntry.event).slice(0, 100)
          }**`
        : "";

      const embed = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("💔 Card Unfavorited")
        .setDescription(
          `Removed favorite protection from:\n\n└ \`${cardEntry.code}\`\n` +
          `${SEASON_EMOJIS[season]} **Season ${season}**${eventText}`
        )
        .setFooter({
          text: "Favorite protection removed. Other card restrictions still apply."
        })
        .setTimestamp();

      return await reply({ embeds: [embed] });
    } catch (error) {
      console.error("[UNFAV]", error);

      try {
        return await reply(
          "❌ Could not unfavorite your card. Please try again."
        );
      } catch (replyError) {
        console.error("[UNFAV] Reply failed:", replyError);
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;