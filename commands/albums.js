const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

async function showAlbums(context) {
  const isSlash =
    typeof context.isChatInputCommand === "function" &&
    context.isChatInputCommand();

  const user = isSlash ? context.user : context.author;

  const respond = (payload) =>
    isSlash ? context.editReply(payload) : context.reply(payload);

  try {
    // Acknowledge slash commands before database access.
    if (isSlash && !context.deferred && !context.replied) {
      await context.deferReply();
    }

    const db = await connectDB();

    const userAlbums = await db
      .collection("albums")
      .find({ userId: user.id })
      .toArray();

    if (!userAlbums.length) {
      return await respond(
        "❌ You have no albums.\nBuy one with `!buy album`."
      );
    }

    // Split large album lists to stay within Discord's limits.
    const descriptions = [];
    let description = "";

    for (const [index, album] of userAlbums.entries()) {
      const name = String(album.name || "Unnamed album").slice(0, 200);

      const entry =
        `**${index + 1}. ${name}**\n` +
        `└ Pages: ${album.pages?.length || 0}`;

      if (
        description &&
        description.length + entry.length + 2 > 3500
      ) {
        descriptions.push(description);
        description = "";
      }

      description += `${description ? "\n\n" : ""}${entry}`;
    }

    if (description) {
      descriptions.push(description);
    }

    for (let index = 0; index < descriptions.length; index++) {
      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(`📚 ${user.username}'s Albums`.slice(0, 256))
        .setDescription(descriptions[index])
        .setFooter({
          text:
            "Use !addpage <album name> to add pages." +
            (descriptions.length > 1
              ? ` • Page ${index + 1}/${descriptions.length}`
              : ""),
        })
        .setTimestamp();

      if (index === 0) {
        await respond({ embeds: [embed] });
      } else if (isSlash) {
        await context.followUp({ embeds: [embed] });
      } else {
        await context.reply({ embeds: [embed] });
      }
    }
  } catch (error) {
    console.error("[albums] Failed to list albums:", error);

    const payload = {
      content: "❌ Couldn't load your albums. Please try again.",
      embeds: [],
    };

    try {
      if (isSlash && !context.deferred && !context.replied) {
        await context.reply(payload);
      } else {
        await respond(payload);
      }
    } catch (replyError) {
      console.error("[albums] Failed to send error reply:", replyError);
    }
  }
}

module.exports = {
  name: "albums",
  description: "List your albums and their page counts.",

  data: new SlashCommandBuilder()
    .setName("albums")
    .setDescription("List your albums and their page counts."),

  execute: showAlbums,
  executeSlash: showAlbums,
};