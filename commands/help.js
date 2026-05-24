const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  name: "help",
  aliases: ["h", "cmds", "commands"],

  async execute(message) {
    const pages = [
      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Cards")
        .setDescription("🎴 **Card Commands**")
        .addFields(
          { name: "!drop", value: "Drop 3 random cards.", inline: false },
          { name: "!view <code>", value: "View a card you own.", inline: false },
          { name: "!collection / !col", value: "View your card collection.", inline: false },
          { name: "!search <name>", value: "Search your owned cards.", inline: false },
          { name: "!favorite / !fav <code>", value: "Favorite a card.", inline: false },
          { name: "!unfavorite / !unfav <code>", value: "Remove favorite from a card.", inline: false },
          { name: "!tag <code> <tag>", value: "Add a tag to a card.", inline: false },
          { name: "!untag <code>", value: "Remove tag from a card.", inline: false }
        ),

      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Burn")
        .setDescription("🔥 **Burn Commands**")
        .addFields(
          { name: "!burn <code>", value: "Burn a card for shards.", inline: false },
          { name: "!multiburn <code code code>", value: "Burn multiple cards.", inline: false },
          { name: "!burnall", value: "Burn all non-favorite cards.", inline: false },
          { name: "!snap", value: "Snap a selected card.", inline: false }
        ),

      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Trade")
        .setDescription("🤝 **Trade Commands**")
        .addFields(
          { name: "!trade @user", value: "Start a trade.", inline: false },
          { name: "!addcard <code>", value: "Add a card to trade.", inline: false },
          { name: "!removecard <code>", value: "Remove a card from trade.", inline: false },
          { name: "!addcoins <amount>", value: "Add coins to trade.", inline: false },
          { name: "!removecoins", value: "Remove coins from trade.", inline: false },
          { name: "!viewtrade", value: "View active trade.", inline: false },
          { name: "!confirmtrade", value: "Confirm the trade.", inline: false },
          { name: "!canceltrade", value: "Cancel active trade.", inline: false },
          { name: "!tradepass", value: "Check trade pass status.", inline: false }
        ),

      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Inventory & Economy")
        .setDescription("🎒 **Inventory, Coins & Items**")
        .addFields(
          { name: "!inventory / !inv", value: "Open your inventory tabs.", inline: false },
          { name: "!profile", value: "View your player profile.", inline: false },
          { name: "!shop / !store", value: "View the item shop.", inline: false },
          { name: "!buy <item>", value: "Buy an item.", inline: false },
          { name: "!shopbg", value: "Open background shop.", inline: false }
        ),

      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Albums")
        .setDescription("📖 **Album Commands**")
        .addFields(
          { name: "!createalbum <name>", value: "Create a new album.", inline: false },
          { name: "!addpage <album>", value: "Add a page to an album.", inline: false },
          { name: "!setlayout <album> <page>", value: "Choose a layout for a page.", inline: false },
          { name: "!setbg <album> <page>", value: "Choose an owned background for a page.", inline: false },
          { name: "!place <album> <page> <slot> <code>", value: "Place a card into an album slot.", inline: false },
          { name: "!viewalbum <album>", value: "View album with page buttons.", inline: false }
        ),

      new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📘 GrootX Help • Utility/Admin")
        .setDescription("⚙️ **Utility Commands**")
        .addFields(
          { name: "!help / !h", value: "Open this help menu.", inline: false },
          { name: "!ping", value: "Check bot response.", inline: false },
          { name: "!setdrop #channel", value: "Set auto-drop channel.", inline: false }
        )
    ];

    const labels = ["Cards", "Burn", "Trade", "Inventory", "Albums", "Utility"];
    const emojis = ["🎴", "🔥", "🤝", "🎒", "📖", "⚙️"];

    let page = 0;

    function makeButtons() {
      return [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("help_prev")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_next")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
        ),

        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("help_0")
            .setLabel(labels[0])
            .setEmoji(emojis[0])
            .setStyle(page === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_1")
            .setLabel(labels[1])
            .setEmoji(emojis[1])
            .setStyle(page === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_2")
            .setLabel(labels[2])
            .setEmoji(emojis[2])
            .setStyle(page === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_3")
            .setLabel(labels[3])
            .setEmoji(emojis[3])
            .setStyle(page === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        ),

        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("help_4")
            .setLabel(labels[4])
            .setEmoji(emojis[4])
            .setStyle(page === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId("help_5")
            .setLabel(labels[5])
            .setEmoji(emojis[5])
            .setStyle(page === 5 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        )
      ];
    }

    function updateFooter() {
      return pages[page].setFooter({
        text: `Page ${page + 1}/${pages.length} • GrootX Help`
      });
    }

    const msg = await message.reply({
      embeds: [updateFooter()],
      components: makeButtons()
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      collector.resetTimer();

      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This help menu isn't for you.",
          ephemeral: true
        });
      }

      if (interaction.customId === "help_next") {
        page++;
        if (page >= pages.length) page = 0;
      }

      if (interaction.customId === "help_prev") {
        page--;
        if (page < 0) page = pages.length - 1;
      }

      if (interaction.customId.startsWith("help_")) {
        const number = Number(interaction.customId.replace("help_", ""));

        if (!isNaN(number)) {
          page = number;
        }
      }

      await interaction.update({
        embeds: [updateFooter()],
        components: makeButtons()
      });
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};