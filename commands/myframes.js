const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const connectDB = require("../database");
const frames = require("../data/frames");

module.exports = {
  name: "myframes",
  aliases: ["frames", "mf"],

  async execute(message) {
    const db = await connectDB();

    const frameInventoryCol = db.collection("frameInventory");

    const userId = message.author.id;

    const userFrames = await frameInventoryCol
      .find({ userId })
      .sort({ used: 1, frameId: 1 })
      .toArray();

    if (!userFrames.length) {
      return message.reply("❌ You don't own any frames.");
    }

    const perPage = 10;
    let page = 0;

    function totalPages() {
      return Math.ceil(userFrames.length / perPage);
    }

    function generateEmbed() {
      const start = page * perPage;
      const current = userFrames.slice(start, start + perPage);

      const description = current
        .map(frame => {
          const frameData = frames.find(
            f => Number(f.id) === Number(frame.frameId)
          );

          const frameName = frameData?.name || "Unknown Frame";

          if (frame.used) {
            return (
              `❌ \`${frame.code}\` • **${frameName}**\n` +
              `↳ Applied to: \`${frame.appliedTo}\``
            );
          }

          return (
            `✅ \`${frame.code}\` • **${frameName}**\n` +
            `↳ Available`
          );
        })
        .join("\n\n");

      return new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle(`${message.author.username}'s Frames`)
        .setDescription(description)
        .setFooter({
          text: `Page ${page + 1}/${totalPages()} • Total Frames: ${userFrames.length}`
        })
        .setTimestamp();
    }

    function buttons() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("frame_prev")
          .setEmoji("⬅️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages() <= 1),

        new ButtonBuilder()
          .setCustomId("frame_next")
          .setEmoji("➡️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages() <= 1)
      );
    }

    const msg = await message.reply({
      embeds: [generateEmbed()],
      components: [buttons()]
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This isn't your frame inventory.",
          ephemeral: true
        });
      }

      if (interaction.customId === "frame_next") {
        page++;
        if (page >= totalPages()) page = 0;
      }

      if (interaction.customId === "frame_prev") {
        page--;
        if (page < 0) page = totalPages() - 1;
      }

      await interaction.update({
        embeds: [generateEmbed()],
        components: [buttons()]
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  },
};