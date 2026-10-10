const fs = require("fs");
const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const {
  getRank,
  getRankEmoji
} = require("../utils/ranks");

const clean = value =>
  String(value ?? "").trim().toLowerCase();

const num = value =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

const fmt = value =>
  num(value).toLocaleString("en-US");

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

// Future season2.js, season3.js, etc. load automatically.
// Restart the bot after adding a season catalogue.
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

  // Explicit event metadata must match.
  if (event) return null;

  // Infer missing legacy event metadata only if unambiguous.
  const candidates = CATALOGUE.byId.get(
    cardKey(season, "", entry.cardId)
  ) || [];

  return candidates.length === 1
    ? candidates[0]
    : null;
}

const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription(
    "View the top 30 collectors, referrers and ranked players"
  );

async function loadBoards(db) {
  const completionPromise = (async () => {
    const owners = new Map();

    const cursor = db.collection("collections").find(
      {},
      {
        projection: {
          userId: 1,
          cardId: 1,
          season: 1,
          cardSeason: 1,
          event: 1
        }
      }
    );

    for await (const entry of cursor) {
      if (!entry.userId) continue;

      const record = resolveEntry(entry);

      if (!record) continue;

      const userId = String(entry.userId);

      if (!owners.has(userId)) {
        owners.set(userId, new Set());
      }

      // Duplicate copies do not increase completion.
      owners.get(userId).add(record.key);
    }

    return [...owners]
      .map(([userId, cards]) => ({
        userId,
        count: cards.size
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.userId.localeCompare(b.userId)
      )
      .slice(0, 30);
  })();

  const [completion, referral, rank] = await Promise.all([
    completionPromise,

    db.collection("referrals")
      .aggregate([
        {
          $match: {
            userId: { $type: "string" }
          }
        },
        {
          $project: {
            userId: 1,
            count: {
              $cond: [
                { $isArray: "$referredUsers" },
                { $size: "$referredUsers" },
                0
              ]
            }
          }
        },
        {
          $match: {
            count: { $gt: 0 }
          }
        },
        {
          $sort: {
            count: -1,
            userId: 1
          }
        },
        {
          $limit: 30
        }
      ])
      .toArray(),

    db.collection("rankedProfiles")
      .find({
        userId: { $type: "string" }
      })
      .sort({
        trophies: -1,
        wins: -1,
        userId: 1
      })
      .limit(30)
      .toArray()
  ]);

  return {
    completion,
    referral,
    rank
  };
}

async function execute(target) {
  const slash =
    typeof target.isChatInputCommand === "function" &&
    target.isChatInputCommand();

  const viewer = slash ? target.user : target.author;

  const reply = payload =>
    slash
      ? target.editReply(payload)
      : target.reply(payload);

  try {
    if (slash && !target.deferred && !target.replied) {
      await target.deferReply();
    }

    const db = await connectDB();
    const boards = await loadBoards(db);

    let selected = "completion";
    let page = 0;

    const id = `gxlb:${target.id}`;

    const labels = {
      completion: "Completion",
      referral: "Referral",
      rank: "Rank"
    };

    const titles = {
      completion: "🎴 GrootX Completion Leaderboard",
      referral: "🤝 GrootX Referral Leaderboard",
      rank: "🏆 GrootX Ranked Leaderboard"
    };

    function payload(disabled = false) {
      const players = boards[selected];

      const pages = Math.max(
        1,
        Math.ceil(players.length / 10)
      );

      page = Math.max(
        0,
        Math.min(page, pages - 1)
      );

      const start = page * 10;

      const description = players
        .slice(start, start + 10)
        .map((player, index) => {
          const heading =
            `**#${start + index + 1}** ` +
            `<@${player.userId}>`;

          if (selected === "completion") {
            const total = CATALOGUE.catalogue.size;

            const percent = total
              ? player.count / total * 100
              : 0;

            return (
              `${heading}\n` +
              `🎴 **${fmt(player.count)} / ` +
              `${fmt(total)}** distinct cards • ` +
              `**${percent.toFixed(1)}%**`
            );
          }

          if (selected === "referral") {
            return (
              `${heading}\n` +
              `🤝 **${fmt(player.count)}** ` +
              "successful referrals"
            );
          }

          const rank = getRank(num(player.trophies));

          return (
            `${heading}\n` +
            `${getRankEmoji(rank.name)} ` +
            `**${fmt(player.trophies)}** trophies • ` +
            rank.name
          );
        })
        .join("\n\n") ||
        "No players on this leaderboard yet.";

      const button = (
        action,
        label,
        inactive = false,
        style = ButtonStyle.Secondary
      ) =>
        new ButtonBuilder()
          .setCustomId(`${id}:${action}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled || inactive);

      const embed = new EmbedBuilder()
        .setColor(0xfacc15)
        .setTitle(titles[selected])
        .setDescription(description)
        .setFooter({
          text:
            `Top 30 • Page ${page + 1}/${pages} • ` +
            `${players.length} players` +
            (disabled ? " • Menu closed" : "")
        })
        .setTimestamp();

      const tabs = new ActionRowBuilder()
        .addComponents(
          ...Object.keys(labels).map(key =>
            button(
              key,
              labels[key],
              key === selected,
              key === selected
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary
            )
          )
        );

      const navigation = new ActionRowBuilder()
        .addComponents(
          button(
            "prev",
            "◀ Previous",
            page === 0
          ),
          button(
            "next",
            "Next ▶",
            page >= pages - 1
          )
        );

      return {
        embeds: [embed],
        components: [tabs, navigation],
        allowedMentions: {
          parse: [],
          repliedUser: false
        }
      };
    }

    const result = await reply(payload());

    const menu = result?.createMessageComponentCollector
      ? result
      : await target.fetchReply();

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
            "Open your own leaderboard to use its buttons.",
          ephemeral: true
        }).catch(() => {});

        return;
      }

      // Acknowledge immediately, then process clicks in order.
      const ack = interaction.deferUpdate()
        .then(() => true)
        .catch(() => false);

      queue = queue
        .then(async () => {
          if (!await ack || collector.ended) return;

          const action = interaction.customId.slice(
            id.length + 1
          );

          if (Object.hasOwn(labels, action)) {
            selected = action;
            page = 0;
          } else if (action === "prev") {
            page--;
          } else if (action === "next") {
            page++;
          } else {
            return;
          }

          await menu.edit(payload());
        })
        .catch(error =>
          console.error("[leaderboard] Menu:", error)
        );
    });

    collector.on("end", () => {
      queue = queue
        .then(() => menu.edit(payload(true)))
        .catch(() => {});
    });
  } catch (error) {
    console.error("[leaderboard]", error);

    await reply({
      content:
        "Could not load the leaderboards. Please try again.",
      allowedMentions: {
        parse: [],
        repliedUser: false
      }
    }).catch(() => {});
  }
}

module.exports = {
  name: "leaderboard",
  aliases: ["lb", "ranklb"],

  data,
  slashData: data,

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};