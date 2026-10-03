const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");
const connectDB = require("../database");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const PER_PAGE = 12;

const toArray = data =>
  Array.isArray(data) ? data : data?.cards || [];

const databases = [
  toArray(season0Cards),
  toArray(season1Cards)
];

function buildSeries(cards, season, ownedKeys) {
  const groups = new Map();
  const seen = new Set();

  for (const card of cards) {
    const ownershipKey = `${season}:${Number(card.id)}`;

    if (seen.has(ownershipKey)) continue;
    seen.add(ownershipKey);

    const name =
      String(card.appearance || card.show || "Unknown").trim() ||
      "Unknown";

    const key = name.toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, {
        name,
        total: 0,
        owned: 0,
        halloween: false
      });
    }

    const group = groups.get(key);
    group.total++;

    if (ownedKeys.has(ownershipKey)) {
      group.owned++;
    }

    if (card.event === "halloween2026") {
      group.halloween = true;
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name)
  );
}

async function execute(message) {
  const slash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user = slash ? message.user : message.author;

  if (slash && !message.deferred && !message.replied) {
    await message.deferReply();
  }

  const reply = payload => {
    if (!slash) return message.reply(payload);

    return message.deferred
      ? message.editReply(payload)
      : message.followUp(payload);
  };

  try {
    const db = await connectDB();

    const owned = await db
      .collection("collections")
      .find({ userId: user.id })
      .toArray();

    // Legacy cards without a season count as S0.
    // Multiple copies of the same card count once.
    const keys = new Set(
      owned.map(
        card =>
          `${Number(card.season ?? 0)}:${Number(card.cardId)}`
      )
    );

    const series = databases.map(
      (cards, season) => buildSeries(cards, season, keys)
    );

    let season = slash
      ? Number(message.options.getString("s") ?? 0)
      : 0;

    let page = 0;
    let busy = false;

    const pages = () =>
      Math.max(
        1,
        Math.ceil(series[season].length / PER_PAGE)
      );

    function payload() {
      const list = series[season];

      page = Math.max(
        0,
        Math.min(page, pages() - 1)
      );

      const start = page * PER_PAGE;

      const total = list.reduce(
        (sum, book) => sum + book.total,
        0
      );

      const collected = list.reduce(
        (sum, book) => sum + book.owned,
        0
      );

      const complete = list.filter(
        book =>
          book.total > 0 &&
          book.owned === book.total
      ).length;

      const percent = total
        ? Math.round(collected / total * 100)
        : 0;

      const entries = list
        .slice(start, start + PER_PAGE)
        .map((book, index) => {
          const done = book.owned === book.total;

          const progress = Math.round(
            book.owned / book.total * 100
          );

          const icon = done
            ? "✅"
            : book.halloween
              ? "🎃"
              : "📖";

          return (
            `${icon} **${start + index + 1}. ${book.name}**\n` +
            `└ **${book.owned}/${book.total}** collected • ` +
            `${progress}%`
          );
        })
        .join("\n\n");

      const embed = new EmbedBuilder()
        .setColor(
          season === 0 ? 0xcd7f32 : 0x8b5cf6
        )
        .setAuthor({
          name: `${user.username}'s Books`,
          iconURL: user.displayAvatarURL()
        })
        .setTitle(
          `${SEASON_EMOJIS[season]} Season ${season} • ` +
          "Collection Progress"
        )
        .setDescription(
          entries ||
          "No series are available for this season."
        )
        .addFields(
          {
            name: "🎴 Unique Cards",
            value: `${collected}/${total} • ${percent}%`,
            inline: true
          },
          {
            name: "✅ Completed Books",
            value: `${complete}/${list.length}`,
            inline: true
          }
        )
        .setFooter({
          text:
            `Page ${page + 1}/${pages()} • ` +
            "Duplicates count once • Switch seasons below"
        });

      const seasons = new ActionRowBuilder()
        .addComponents(
          ...[0, 1].map(value =>
            new ButtonBuilder()
              .setCustomId(`books_season_${value}`)
              .setLabel(`Season ${value}`)
              .setEmoji(SEASON_EMOJIS[value])
              .setStyle(
                value === season
                  ? ButtonStyle.Primary
                  : ButtonStyle.Secondary
              )
              .setDisabled(value === season)
          )
        );

      const navigation = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId("books_prev")
            .setLabel("Previous")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pages() <= 1),

          new ButtonBuilder()
            .setCustomId("books_next")
            .setLabel("Next")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pages() <= 1)
        );

      return {
        embeds: [embed],
        components: [seasons, navigation]
      };
    }

    const msg = await reply(payload());

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content:
            "❌ Open your own books menu to use these controls.",
          ephemeral: true
        });
      }

      let acquired = false;

      try {
        // Acknowledge immediately to prevent interaction timeouts.
        await interaction.deferUpdate();

        if (busy || collector.ended) return;

        busy = true;
        acquired = true;
        collector.resetTimer();

        if (
          interaction.customId === "books_season_0" ||
          interaction.customId === "books_season_1"
        ) {
          season = Number(
            interaction.customId.slice(-1)
          );
          page = 0;
        } else if (
          interaction.customId === "books_next"
        ) {
          page = (page + 1) % pages();
        } else if (
          interaction.customId === "books_prev"
        ) {
          page = (page - 1 + pages()) % pages();
        }

        await interaction.editReply(payload());
      } catch (error) {
        console.error("[BOOKS] Button error:", error);
      } finally {
        if (acquired) busy = false;
      }
    });

    collector.on("end", () =>
      msg.edit({ components: [] }).catch(() => {})
    );
  } catch (error) {
    console.error("[BOOKS]", error);

    return reply({
      content:
        "❌ Could not load your books. Please try again."
    });
  }
}

module.exports = {
  name: "books",
  aliases: ["book"],

  data: new SlashCommandBuilder()
    .setName("books")
    .setDescription(
      "View your series completion and collection progress."
    )
    .addStringOption(option =>
      option
        .setName("s")
        .setDescription("Starting season (optional)")
        .addChoices(
          { name: "Season 0", value: "0" },
          { name: "Season 1", value: "1" }
        )
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};