const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const SEASON_EMOJIS = {
  0: "<:Season0:1555956910560256082>",
  1: "<:Season1:1555956879576793130>"
};

const TIERS = {
  legendary: "<:legendary:1504511435974377552>",
  epic: "<:epic:1504510771214680175>",
  rare: "<:rare:1504510606718275764>",
  uncommon: "<:uncommon:1504510929210052698>",
  common: "<:common:1504510702956839033>"
};

const clean = value =>
  String(value ?? "").trim().toLowerCase();

const num = value =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const fmt = value =>
  num(value).toLocaleString("en-US");

const text = value =>
  String(value ?? "")
    .replace(/[`*_~|\\]/g, "")
    .slice(0, 100);

function seasonNumber(value) {
  const match = clean(value).match(
    /^(?:s|season\s*)?(\d+)$/
  );

  return match ? Number(match[1]) : null;
}

function arrayOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cards)) return data.cards;
  return [];
}

function cardKey(season, event, id) {
  return JSON.stringify([
    season,
    clean(event),
    String(id).trim()
  ]);
}

// Future season2.js, season3.js, etc. are discovered automatically.
// Catalogues load once when the command module loads.
function loadCatalogue() {
  const sources = new Map([
    [0, cards0],
    [1, cards1]
  ]);

  const directory = path.join(__dirname, "../data");

  for (const filename of fs.readdirSync(directory)) {
    const match = filename.match(/^season(\d+)\.js$/i);

    if (!match || Number(match[1]) <= 1) continue;

    sources.set(
      Number(match[1]),
      require(path.join(directory, filename))
    );
  }

  const catalogue = new Map();

  for (const [fallbackSeason, source] of sources) {
    for (const card of arrayOf(source)) {
      if (!card || card.id == null) continue;

      const season = seasonNumber(
        card.season ??
        card.cardSeason ??
        fallbackSeason
      );

      if (season === null) continue;

      const event = clean(card.event);
      const key = cardKey(season, event, card.id);

      catalogue.set(key, {
        key,
        season,
        event,
        card
      });
    }
  }

  const byId = new Map();

  for (const record of catalogue.values()) {
    const key = cardKey(
      record.season,
      "",
      record.card.id
    );

    if (!byId.has(key)) {
      byId.set(key, []);
    }

    byId.get(key).push(record);
  }

  return {
    catalogue,
    byId,
    seasons: [...sources.keys()]
  };
}

const CATALOGUE = loadCatalogue();

function resolveEntry(entry) {
  const season = seasonNumber(
    entry.season ?? entry.cardSeason ?? 0
  );

  if (season === null || entry.cardId == null) {
    return null;
  }

  const event = clean(entry.event);

  const exact = CATALOGUE.catalogue.get(
    cardKey(season, event, entry.cardId)
  );

  if (exact) return exact;

  // Explicit event metadata must match the catalogue.
  if (event) return null;

  // Legacy records may omit event metadata.
  // Only infer an event when the match is unambiguous.
  const candidates = CATALOGUE.byId.get(
    cardKey(season, "", entry.cardId)
  ) || [];

  return candidates.length === 1
    ? candidates[0]
    : null;
}

function summarize(owned, selected) {
  const catalogue = [
    ...CATALOGUE.catalogue.values()
  ].filter(record =>
    selected === "all" ||
    record.season === Number(selected)
  );

  const copies = owned.filter(({ entry, record }) =>
    selected === "all" ||
    (
      record?.season ??
      seasonNumber(
        entry.season ?? entry.cardSeason ?? 0
      )
    ) === Number(selected)
  );

  const unique = new Set();

  const tiers = Object.fromEntries(
    Object.keys(TIERS).map(tier => [tier, 0])
  );

  let events = 0;
  let unknown = 0;
  let matched = 0;
  let other = 0;

  for (const { record } of copies) {
    if (!record) {
      unknown++;
      continue;
    }

    matched++;
    unique.add(record.key);

    // Event cards are displayed separately from ordinary Legendary cards.
    if (record.event) {
      events++;
    } else {
      const tier = clean(record.card.tier);

      if (tier in tiers) {
        tiers[tier]++;
      } else {
        other++;
      }
    }
  }

  const percent = catalogue.length
    ? unique.size / catalogue.length * 100
    : 0;

  return {
    total: copies.length,
    distinct: unique.size,
    catalogue: catalogue.length,
    duplicates: matched - unique.size,
    tiers,
    events,
    unknown,
    other,
    percent
  };
}

const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View overall or season collection progress")
  .addUserOption(option =>
    option
      .setName("user")
      .setDescription("Player to view")
  )
  .addStringOption(option =>
    option
      .setName("season")
      .setDescription(
        "all, s0, s1, or a future season number"
      )
      .setMaxLength(20)
  );

async function execute(target, args = []) {
  const slash =
    typeof target.isChatInputCommand === "function" &&
    target.isChatInputCommand();

  const reply = payload => {
    if (typeof payload === "string") {
      payload = { content: payload };
    }

    payload.allowedMentions = {
      parse: [],
      repliedUser: false
    };

    return slash
      ? target.editReply(payload)
      : target.reply(payload);
  };

  try {
    if (slash && !target.deferred && !target.replied) {
      await target.deferReply();
    }

    const viewer = slash
      ? target.user
      : target.author;

    // Ignore the bot mention used to invoke the command.
    const mentioned = slash
      ? null
      : target.mentions?.users?.find(
          user => user.id !== target.client?.user?.id
        );

    const user = slash
      ? target.options.getUser("user") || viewer
      : mentioned || viewer;

    const words = Array.isArray(args)
      ? args
      : String(args || "").split(/\s+/);

    const input = clean(
      slash
        ? target.options.getString("season")
        : words.find(
            word => !/^<@!?\d+>$/.test(word)
          )
    );

    let selected =
      !input || ["all", "overall"].includes(input)
        ? "all"
        : seasonNumber(input);

    if (selected === null) {
      return await reply(
        "Use profile [@user] [all|s0|s1|s2…], " +
        "or /profile with user and season options."
      );
    }

    selected = String(selected);

    const db = await connectDB();

    const [balance, inventory, entries] =
      await Promise.all([
        db.collection("balances")
          .findOne({ userId: user.id }),

        db.collection("inventory")
          .findOne({ userId: user.id }),

        db.collection("collections")
          .find({ userId: user.id })
          .toArray()
      ]);

    const owned = entries.map(entry => ({
      entry,
      record: resolveEntry(entry)
    }));

    const seasonSet = new Set(CATALOGUE.seasons);

    for (const record of CATALOGUE.catalogue.values()) {
      seasonSet.add(record.season);
    }

    for (const entry of entries) {
      const season = seasonNumber(
        entry.season ?? entry.cardSeason ?? 0
      );

      if (season !== null) {
        seasonSet.add(season);
      }
    }

    const seasons = [...seasonSet].sort(
      (a, b) => a - b
    );

    if (
      selected !== "all" &&
      !seasonSet.has(Number(selected))
    ) {
      return await reply(
        "That season is not available. Use all, s0 or s1, " +
        "or choose an available season."
      );
    }

    const views = [
      "all",
      ...seasons.map(String)
    ];

    const chips =
      balance?.ultronChips ??
      balance?.ultronchips ??
      balance?.chips ??
      inventory?.items?.ultronChip ??
      inventory?.items?.ultron_chips ??
      inventory?.items?.token ??
      0;

    const id = `gxprofile:${target.id}`;

    function payload(disabled = false) {
      const stats = summarize(owned, selected);

      const label = selected === "all"
        ? "Overall • All seasons & events"
        : `Season ${selected} • Includes its event cards`;

      const filled = Math.min(
        10,
        Math.floor(stats.percent / 10)
      );

      const bar =
        "▰".repeat(filled) +
        "▱".repeat(10 - filled);

      const tierLines = Object.entries(TIERS)
        .map(([tier, emoji]) =>
          `${emoji} ` +
          `${tier[0].toUpperCase() + tier.slice(1)} · ` +
          `**${fmt(stats.tiers[tier])}**`
        );

      if (stats.events) {
        tierLines.push(
          `🎃 Event · **${fmt(stats.events)}**`
        );
      }

      if (stats.other) {
        tierLines.push(
          `🎴 Other · **${fmt(stats.other)}**`
        );
      }

      const seasonEmoji = selected === "all"
        ? "🌐"
        : SEASON_EMOJIS[selected] || "🎴";

      const embed = new EmbedBuilder()
        .setColor(
          selected === "all" ? 0x8b5cf6 : 0x3498db
        )
        .setTitle(
          `${text(user.username)} • Collector Profile`
        )
        .setThumbnail(
          user.displayAvatarURL({ size: 256 })
        )
        .setDescription(
          `${seasonEmoji} **${label}**\n` +
          `${bar} **${stats.percent.toFixed(1)}%**\n` +
          `**${fmt(stats.distinct)} / ` +
          `${fmt(stats.catalogue)}** distinct cards collected`
        )
        .addFields(
          {
            name: "🎴 Collection",
            value:
              `Copies · **${fmt(stats.total)}**\n` +
              `Duplicates · **${fmt(stats.duplicates)}**`,
            inline: true
          },
          {
            name: "💰 Wallet",
            value:
              "<:grootcoin:1504742213110861834> " +
              `**${fmt(balance?.coins)}** coins\n` +
              "<:chipslogo:1519287944421048320> " +
              `**${fmt(chips)}** chips`,
            inline: true
          },
          {
            name: "Card Tiers · Copies",
            value: tierLines.join("\n"),
            inline: false
          }
        )
        .setFooter({
          text: disabled
            ? "Menu closed • Open profile again to switch seasons"
            : "Each season/event version counts once • Wallet is shared across seasons"
        });

      if (stats.unknown) {
        embed.addFields({
          name: "Unmatched Cards",
          value:
            `${fmt(stats.unknown)} copies counted in your total ` +
            "but excluded from completion and tier counts."
        });
      }

      // Dropdowns support 25 options.
      // Navigation reaches additional seasons if needed.
      const current = views.indexOf(selected);
      const start = Math.floor(current / 25) * 25;

      const select = new StringSelectMenuBuilder()
        .setCustomId(`${id}:season`)
        .setPlaceholder("Choose Overall or a season")
        .setDisabled(disabled)
        .addOptions(
          views.slice(start, start + 25).map(value => ({
            label: value === "all"
              ? "Overall — All seasons & events"
              : `Season ${value}`,

            value,
            default: value === selected,

            ...(value === "all"
              ? { emoji: "🌐" }
              : SEASON_EMOJIS[value]
                ? { emoji: SEASON_EMOJIS[value] }
                : { emoji: "🎴" })
          }))
        );

      const button = (action, label) =>
        new ButtonBuilder()
          .setCustomId(`${id}:${action}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled);

      return {
        embeds: [embed],

        components: [
          new ActionRowBuilder()
            .addComponents(select),

          new ActionRowBuilder().addComponents(
            button("prev", "◀ Previous"),
            button("next", "Next ▶"),
            button("close", "Close")
          )
        ],

        allowedMentions: {
          parse: [],
          repliedUser: false
        }
      };
    }

    const menu = await reply(payload());

    const collector =
      menu.createMessageComponentCollector({
        time: 180000,
        filter: interaction =>
          interaction.customId.startsWith(`${id}:`)
      });

    let queue = Promise.resolve();

    collector.on("collect", interaction => {
      if (interaction.user.id !== viewer.id) {
        void interaction.reply({
          content:
            "Open your own profile menu to switch seasons.",
          ephemeral: true
        }).catch(() => {});

        return;
      }

      // Acknowledge immediately to prevent interaction timeouts.
      const ack = interaction
        .deferUpdate()
        .then(() => true)
        .catch(() => false);

      queue = queue
        .then(async () => {
          if (!await ack || collector.ended) return;

          const action = interaction.customId.slice(
            id.length + 1
          );

          if (action === "close") {
            collector.stop("closed");
            return;
          }

          if (action === "season") {
            const value = interaction.values?.[0];

            if (!views.includes(value)) return;

            selected = value;
          } else if (
            action === "prev" ||
            action === "next"
          ) {
            const direction =
              action === "next" ? 1 : -1;

            selected = views[
              (
                views.indexOf(selected) +
                direction +
                views.length
              ) % views.length
            ];
          } else {
            return;
          }

          await menu.edit(payload());
        })
        .catch(error =>
          console.error("[profile] Menu:", error)
        );
    });

    collector.on("end", () => {
      queue = queue
        .then(() => menu.edit(payload(true)))
        .catch(() => {});
    });
  } catch (error) {
    console.error("[profile]", error);

    await reply(
      "Could not load this profile. Please try again."
    ).catch(() => {});
  }
}

module.exports = {
  name: "profile",
  aliases: ["p"],

  data,
  slashData: data,

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};