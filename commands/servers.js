const { EmbedBuilder } = require("discord.js");

module.exports = {
    name: "servers",

    async execute(message, args, client) {

        const guilds = client.guilds.cache
            .map(g => `• ${g.name} (${g.memberCount} members)`)
            .slice(0, 50);

        const embed = new EmbedBuilder()
            .setTitle(`🌐 Servers (${client.guilds.cache.size})`)
            .setDescription(guilds.join("\n"))
            .setColor("Blue");

        message.channel.send({ embeds: [embed] });
    }
};