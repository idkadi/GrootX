if (message.content === "!servers") {
    const OWNER_ID = "859803575995727872"; // Replace with your Discord ID

    if (message.author.id !== OWNER_ID) {
        return message.reply("❌ Owner only command.");
    }

    const guilds = [...client.guilds.cache.values()]
        .sort((a, b) => b.memberCount - a.memberCount);

    let serverList = guilds
        .map((g, i) => `${i + 1}. ${g.name} — ${g.memberCount} members`)
        .join("\n");

    const totalMembers = guilds.reduce((sum, g) => sum + g.memberCount, 0);

    // Discord message limit
    if (serverList.length > 1800) {
        serverList = serverList.slice(0, 1800) + "\n...";
    }

    message.channel.send(
        `📡 **GrootX Server Stats**\n\n` +
        `🏠 Servers: **${guilds.length}**\n` +
        `👥 Total Members: **${totalMembers.toLocaleString()}**\n\n` +
        `${serverList}`
    );
}