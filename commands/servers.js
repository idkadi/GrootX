const { EmbedBuilder } = require("discord.js");

const OWNER_ID = "859803575995727872";

module.exports = {
  name: "servers",
  aliases: ["serverlist", "guilds"],

  async execute(message, args, client) {
    if (message.author.id !== OWNER_ID) return;

    const guilds = client.guilds.cache
      .map(g => ({
        name: g.name || "Unknown Server",
        id: g.id,
        members: g.memberCount || 0,
      }))
      .sort((a, b) => b.members - a.members);

    if (!guilds.length) {
      return message.reply("I am not in any servers.");
    }

    const totalMembers = guilds.reduce((sum, g) => sum + g.members, 0);

    const lines = guilds.map(
      (g, i) => `**${i + 1}. ${g.name}**\n👥 ${g.members} members\n🆔 \`${g.id}\``
    );

    const chunks = [];
    let current = "";

    for (const line of lines) {
      if ((current + "\n\n" + line).length > 3500) {
        chunks.push(current);
        current = line;
      } else {
        current += current ? "\n\n" + line : line;
      }
    }

    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setTitle(`📡 GrootX Server List ${chunks.length > 1 ? `(${i + 1}/${chunks.length})` : ""}`)
        .setDescription(
          `🏠 Servers: **${guilds.length}**\n👥 Total Members: **${totalMembers.toLocaleString()}**\n\n${chunks[i]}`
        )
        .setColor("#9b59b6");

      await message.channel.send({ embeds: [embed] });
    }
  },
};