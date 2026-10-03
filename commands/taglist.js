const connectDB = require("../database");

const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

async function execute(context) {
  const isSlash =
    typeof context.isChatInputCommand === "function" &&
    context.isChatInputCommand();

  const user = isSlash
    ? context.user
    : context.author;

  // Acknowledge before waiting for MongoDB.
  if (isSlash && !context.deferred && !context.replied) {
    await context.deferReply();
  }

  const reply = payload =>
    isSlash
      ? context.editReply(payload)
      : context.reply(payload);

  try {
    const db = await connectDB();

    const tags = await db
      .collection("createdtags")
      .find({ userId: user.id })
      .sort({ name: 1 })
      .toArray();

    if (!tags.length) {
      return reply({
        content: "❌ You have no created tags."
      });
    }

    const description = tags
      .map(tag => `${tag.emoji} • **${tag.name}**`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle(`🏷️ ${user.username}'s Tags`)
      .setDescription(description)
      .setFooter({
        text: `Total Tags: ${tags.length}`
      })
      .setTimestamp();

    return reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error(
      "[TAGLIST] Failed to load tags:",
      error
    );

    return reply({
      content:
        "❌ Could not load your tags. Please try again."
    });
  }
}

module.exports = {
  name: "taglist",
  aliases: ["tags"],

  data: new SlashCommandBuilder()
    .setName("taglist")
    .setDescription("Show all tags you have created."),

  execute,
  executeSlash: execute
};