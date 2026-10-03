const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require("discord.js");

// Commands missing from this guide are automatically added
// from client.commands and client.slashCommands.
const CATEGORIES = [
  ["Getting Started", "🌱", [
    [
      "debut",
      "New players only: guided introduction, then 3,000 coins and 2 Epic cards from the current season. Enter a referral code or none at the end."
    ],
    [
      "refer",
      "Get your permanent unique 6-digit referral code. Share it with new players for debut referrals."
    ],
    [
      "help [command or category]",
      "Browse this guide or search for a command."
    ]
  ]],

  ["Cards & Discovery", "🎴", [
    ["drop", "Drop cards and claim one using the drop controls."],
    ["view <code>", "View an owned card with its season or event image."],
    ["collection", "Browse your owned cards."],
    [
      "search n:<name> [s:<season>] [t:<tier>]",
      "Filter your collection."
    ],
    [
      "info <name>",
      "Find character versions; use the selection and season controls."
    ],
    ["list", "Browse the card catalogue."],
    ["series", "Browse available series, including Halloween 26."],
    ["dupes", "Find duplicate cards in your collection."],
    [
      "wishlist add n:<name> [s:<season>] [a:<series>]",
      "Name is required; season and series are optional. Up to 15 wishlist entries, including events."
    ],
    ["wishlist", "View wishlisted cards and their heart counts."]
  ]],

  ["Favorites & Tags", "⭐", [
    ["fav <code>", "Favorite an owned card."],
    ["unfav <code>", "Remove a favorite."],
    ["favcards", "Browse your favorite cards across seasons and events."],
    ["tag <code> <tag>", "Tag a card."],
    ["untag <code>", "Remove a card tag."],
    ["tags", "Browse your tags."]
  ]],

  ["Rewards & Shop", "💰", [
    ["balance", "Check your balance."],
    ["daily", "Claim daily rewards."],
    ["weekly", "Claim weekly rewards."],
    ["vote", "Open the voting and reward command."],
    ["inventory", "Browse currencies, materials, items and packs."],
    ["store", "Browse the item shop and Halloween pack."],
    [
      "buy <item>",
      "Buy an item. Example: buy extra drop. Halloween packs cost 3,000 candy."
    ],
    [
      "market",
      "Browse the rotating card market. On Sunday, a Legendary replaces one Epic."
    ],
    [
      "unpack halloween 26",
      "Consume one Halloween 26 pack for one random Halloween 26 card."
    ]
  ]],

  ["Halloween & Seasons", "🎃", [
    [
      "info",
      "Season 0 and Season 1 share a character listing with season-switch buttons."
    ],
    ["series", "Halloween 26 is its own event series."],
    [
      "drop",
      "During the event, drops have a 15% chance of awarding 25–100 candy."
    ],
    [
      "unpack halloween 26",
      "<:halloweenpack:1555956375979425963> Open an owned event pack."
    ],
    [
      "burn <code>",
      "Event cards give the same burn materials as Legendary cards."
    ]
  ]],

  ["Giving & Trading", "🤝", [
    [
      "give",
      "Give cards to another player, including S0, S1 and event cards."
    ],
    ["trade @user", "Start a trade."],
    ["addcard <code>", "Add a card to a trade."],
    ["removecard <code>", "Remove a card from a trade."],
    ["addcoins <amount>", "Add coins to a trade."],
    ["removecoins", "Remove offered coins."],
    ["viewtrade", "Inspect your active trade."],
    ["confirmtrade", "Confirm your trade."],
    ["canceltrade", "Cancel your active trade."],
    ["tradepass", "Check your trade pass."]
  ]],

  ["Burn & Stones", "🔥", [
    [
      "burn <code>",
      "Burn a card for materials; supports S0, S1 and events."
    ],
    [
      "multiburn <codes>",
      "Burn multiple cards. Review before confirming."
    ],
    [
      "burnall",
      "Open bulk burning. Review the selection before confirming."
    ],
    ["snap", "Open the snap command."],
    ["stone", "Use stones and their card effects."],
    ["stones", "View the stones command, if installed."]
  ]],

  ["Albums & Profiles", "📖", [
    ["profile", "View your player profile."],
    ["profilecard", "Open your profile card showcase."],
    ["showcase", "Open your showcase, if installed."],
    ["albums", "Browse your albums."],
    ["books", "Open your books, if installed."],
    ["createalbum <name>", "Create an album."],
    ["addpage <album>", "Add an album page."],
    ["setlayout <album> <page>", "Choose a page layout."],
    ["setbg <album> <page>", "Choose an owned page background."],
    [
      "place <album> <page> <slot> <code>",
      "Place a card in an album slot."
    ],
    ["displace", "Remove a placed album card."],
    ["viewalbum <album>", "View an album and its pages."],
    ["shopbg", "Browse album backgrounds."]
  ]],

  ["Frames", "🖼️", [
    ["frames", "Browse the frame store."],
    ["buyframe", "Buy a frame."],
    ["myframes", "View your owned frames."],
    ["putframe", "Apply an owned frame to a card."],
    ["removeframe", "Remove an applied frame."]
  ]],

  ["Decks & Battles", "⚔️", [
    [
      "deck",
      "Manage your decks: 12 cards, at most 4 Legendary and 4 Epic."
    ],
    ["battle", "Play a battle across 3 locations and 6 turns."]
  ]],

  ["Utilities & Server", "⚙️", [
    ["cooldown", "Check command cooldowns."],
    ["remind", "Manage reminders."],
    ["ping", "Check bot response time."],
    ["invite", "Get the bot invite."],
    ["prefix", "View or manage the server prefix."],
    ["servers", "Open the server-list command."],
    ["serverlist", "Open the server-list command, if installed."],
    [
      "setdrop #channel",
      "Configure the automatic drop channel; requires the command’s server permissions."
    ],
    [
      "autodrop",
      "Automatic drop settings, if exposed as a command."
    ]
  ]],

  ["Owner Commands", "🔒", [
    [
      "gdrop s0 <id>",
      "Owner only: drop a Season 0 card by catalogue ID."
    ],
    [
      "gdrop s1 <id>",
      "Owner only: drop a Season 1 card by catalogue ID."
    ]
  ]]
];

const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Browse GrootX commands and guides")
  .addStringOption(option =>
    option
      .setName("query")
      .setDescription("Command or category to search")
      .setMaxLength(100)
  );

const baseName = usage => usage.split(/\s+/)[0].toLowerCase();
const clip = (value, max) => String(value).slice(0, max);
const safe = value => String(value).replace(/`/g, "ˋ");

function getRegistry(client) {
  const commands = new Map();

  for (const source of [
    client?.commands,
    client?.slashCommands
  ]) {
    if (!source || typeof source.values !== "function") continue;

    for (const command of source.values()) {
      if (!command) continue;

      const name = command.name || command.data?.name;
      if (typeof name !== "string") continue;

      const key = name.toLowerCase();

      if (!commands.has(key)) {
        commands.set(key, command);
      }
    }
  }

  return commands;
}

async function showHelp(target, args = []) {
  const slash =
    typeof target.isChatInputCommand === "function" &&
    target.isChatInputCommand();

  if (slash && !target.deferred && !target.replied) {
    await target.deferReply();
  }

  const owner = slash ? target.user.id : target.author.id;
  const registry = getRegistry(target.client);

  const resolve = name =>
    registry.get(name) ||
    [...registry.values()].find(command =>
      Array.isArray(command.aliases) &&
      command.aliases.some(alias =>
        String(alias).toLowerCase() === name
      )
    );

  const hasRegistry = registry.size > 0;
  const documented = new Set();

  const groups = CATEGORIES
    .map(([label, emoji, entries]) => ({
      label,
      emoji,
      entries: entries
        .filter(([usage]) =>
          !hasRegistry || resolve(baseName(usage))
        )
        .map(([usage, description]) => {
          const command = resolve(baseName(usage));

          if (command) {
            documented.add(
              (command.name || command.data?.name).toLowerCase()
            );
          }

          return {
            usage,
            description,
            command
          };
        })
    }))
    .filter(group => group.entries.length);

  const extras = [...registry.entries()]
    .filter(([name]) => !documented.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, command]) => ({
      usage: name,
      command,
      description:
        command.description ||
        command.data?.description ||
        "Available command. Use its slash options or command prompt for details."
    }));

  if (extras.length) {
    groups.push({
      label: "Other Installed Commands",
      emoji: "🧩",
      entries: extras
    });
  }

  const query = (
    slash
      ? target.options.getString("query") || ""
      : Array.isArray(args)
        ? args.join(" ")
        : String(args || "")
  ).trim().toLowerCase();

  const pages = [];

  const intro = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("🌱 GrootX • Command Guide")
    .setDescription(
      "Collect Marvel cards, build your collection and battle.\n\n" +

      "**How to use commands**\n" +
      "Mention the bot followed by a command, use your server prefix, " +
      "or select an available slash command.\n" +
      "`@GrootX help wishlist` • `/help query:wishlist`\n\n" +

      "**New here?** Start with `debut`. " +
      "Get your referral code using `refer`.\n\n" +

      "**Tiers**\n" +
      "Common → Uncommon → Rare → Epic → Legendary\n" +
      "Halloween 26 cards are event cards.\n\n" +

      "<:Season0:1555956910560256082> **S0** = Season 0 • " +
      "**S1** = Season 1\n" +

      "`<code>` means an owned card code; " +
      "`<id>` means a catalogue card ID.\n" +
      "`<required>` and `[optional]` are placeholders; " +
      "do not type the brackets.\n\n" +

      "Pick a category below. Slash availability is shown " +
      "only when declared by a loaded command."
    );

  pages.push({
    label: "Overview",
    emoji: "🌱",
    embed: intro
  });

  for (const group of groups) {
    for (
      let offset = 0;
      offset < group.entries.length;
      offset += 6
    ) {
      const entries = group.entries.slice(offset, offset + 6);
      const part = Math.floor(offset / 6) + 1;

      const label = group.label +
        (group.entries.length > 6 ? ` ${part}` : "");

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle(`${group.emoji} GrootX • ${label}`)
        .setDescription(
          "Examples use mention/prefix syntax. " +
          "For slash commands, choose the options shown by Discord."
        );

      for (const entry of entries) {
        const command = entry.command;

        const aliases =
          Array.isArray(command?.aliases) &&
          command.aliases.length
            ? "\nAliases: " +
              command.aliases
                .map(alias => "`" + safe(alias) + "`")
                .join(", ")
            : "";

        const slashName =
          command?.data?.name ||
          command?.slashData?.name;

        embed.addFields({
          name: clip(entry.usage, 256),
          value: clip(
            safe(entry.description) +
            aliases +
            (
              slashName
                ? `\nSlash: \`/${safe(slashName)}\``
                : ""
            ),
            800
          )
        });
      }

      pages.push({
        label,
        emoji: group.emoji,
        embed,
        entries
      });
    }
  }

  let page = 0;

  if (query) {
    const found = pages.findIndex(current =>
      current.label.toLowerCase().includes(query) ||
      current.entries?.some(entry =>
        entry.usage.toLowerCase().includes(query) ||
        entry.command?.aliases?.some(alias =>
          String(alias).toLowerCase() === query
        )
      )
    );

    if (found >= 0) {
      page = found;
    } else {
      intro.addFields({
        name: "No match",
        value:
          "Choose a category below to browse available commands."
      });
    }
  }

  const id = `gxhelp:${target.id}`;

  function payload(disabled = false) {
    // Discord supports 25 options per dropdown.
    // Previous/Next also reach pages outside this window.
    const start = Math.floor(page / 25) * 25;

    const select = new StringSelectMenuBuilder()
      .setCustomId(`${id}:category`)
      .setPlaceholder("Choose a help category")
      .setDisabled(disabled)
      .addOptions(
        pages.slice(start, start + 25).map((current, index) => ({
          label: clip(current.label, 100),
          value: String(start + index),
          emoji: current.emoji,
          default: start + index === page
        }))
      );

    const button = (
      action,
      label,
      style = ButtonStyle.Secondary
    ) =>
      new ButtonBuilder()
        .setCustomId(`${id}:${action}`)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled);

    return {
      embeds: [
        EmbedBuilder.from(pages[page].embed)
          .setFooter({
            text:
              `Page ${page + 1}/${pages.length} • ` +
              "Menu active for 3 minutes"
          })
      ],
      components: [
        new ActionRowBuilder().addComponents(select),

        new ActionRowBuilder().addComponents(
          button("prev", "◀ Previous"),
          button("home", "Overview", ButtonStyle.Primary),
          button("next", "Next ▶"),
          button("close", "Close", ButtonStyle.Danger)
        )
      ],
      allowedMentions: {
        parse: []
      }
    };
  }

  const sent = slash
    ? await target.editReply(payload())
    : await target.reply(payload());

  const collector = sent.createMessageComponentCollector({
    time: 180000,
    filter: interaction =>
      interaction.customId.startsWith(`${id}:`)
  });

  // Keep edits ordered during rapid button clicks.
  let queue = Promise.resolve();

  collector.on("collect", interaction => {
    if (interaction.user.id !== owner) {
      void interaction.reply({
        content:
          "Open your own menu with /help or mention GrootX with help.",
        ephemeral: true
      }).catch(() => {});

      return;
    }

    const action = interaction.customId.slice(id.length + 1);

    // Acknowledge immediately before waiting for an edit.
    const acknowledged = interaction
      .deferUpdate()
      .then(() => true)
      .catch(() => false);

    queue = queue
      .then(async () => {
        if (!await acknowledged || collector.ended) return;

        if (action === "close") {
          collector.stop("closed");
          return;
        }

        if (action === "prev") {
          page = (page - 1 + pages.length) % pages.length;
        } else if (action === "next") {
          page = (page + 1) % pages.length;
        } else if (action === "home") {
          page = 0;
        } else if (action === "category") {
          const selected = Number(interaction.values?.[0]);

          if (
            !Number.isInteger(selected) ||
            selected < 0 ||
            selected >= pages.length
          ) {
            return;
          }

          page = selected;
        } else {
          return;
        }

        await sent.edit(payload());
      })
      .catch(error => {
        console.error(
          "[help] Menu update failed:",
          error.message
        );
      });
  });

  collector.on("end", () => {
    queue = queue
      .then(() =>
        sent.edit({
          ...payload(true),
          embeds: [
            EmbedBuilder.from(pages[page].embed)
              .setFooter({
                text:
                  "Menu closed • Use /help to open another"
              })
          ]
        })
      )
      .catch(() => {});
  });
}

module.exports = {
  name: "help",
  description: "Browse GrootX commands and guides",
  aliases: ["h", "cmds", "commands"],

  data,
  slashData: data,

  execute: showHelp,

  executeSlash: interaction => showHelp(interaction),
  slashExecute: interaction => showHelp(interaction)
};