module.exports = {
  name: "servers",

  async execute(message) {
    const guilds = message.client.guilds.cache
      .sort((a, b) => b.memberCount - a.memberCount)
      .first(20)
      .map(g => `• ${g.name} (${g.memberCount})`)
      .join("\n");

    message.channel.send(
      `📊 **GrootX is in ${message.client.guilds.cache.size} servers**\n\nTop 20 Servers:\n${guilds}`
    );
  }
};