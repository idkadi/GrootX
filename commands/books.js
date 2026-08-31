const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");
const connectDB = require("../database");

function getSeasonEmoji(season) {
  return Number(season) === 1 ? "1️⃣" : "0️⃣";
}

function getSeasonDatabase(season) {
  return Number(season) === 1
    ? season1Cards
    : season0Cards;
}

module.exports = {
  name: "books",
  aliases: ["book"],

  async execute(message) {
    const db = await connectDB();

    const collectionsCol =
      db.collection("collections");

    const userId =
      message.author.id;

    const userCards =
      await collectionsCol
        .find({ userId })
        .toArray();

    /*
     * Season-aware ownership.
     *
     * Old owned cards without a season
     * automatically count as Season 0.
     *
     * Example keys:
     *
     * 0:25 = Season 0 card ID 25
     * 1:25 = Season 1 card ID 25
     */

    const ownedCardKeys =
      new Set(
        userCards.map(entry => {
          const season =
            Number(entry.season ?? 0);

          return (
            `${season}:` +
            `${Number(entry.cardId)}`
          );
        })
      );

    const perPage = 12;

    let page = 0;
    let activeSeason = 0;

    // ==========================================
    // BUILD SERIES DATA
    // ==========================================

    function getSortedSeries() {
      const cards =
        getSeasonDatabase(
          activeSeason
        );

      const seriesMap = {};

      for (const card of cards) {
        const originalSeries =
          String(
            card.appearance ||
            card.show ||
            "Unknown"
          ).trim();

        const normalizedSeries =
          originalSeries
            .toLowerCase();

        if (
          !seriesMap[
            normalizedSeries
          ]
        ) {
          seriesMap[
            normalizedSeries
          ] = {
            name:
              originalSeries,

            total:
              0,

            owned:
              0
          };
        }

        // Count total cards
        // from the active season only.
        seriesMap[
          normalizedSeries
        ].total++;

        const ownershipKey =
          `${activeSeason}:` +
          `${Number(card.id)}`;

        // Only count ownership
        // from the same season.
        if (
          ownedCardKeys.has(
            ownershipKey
          )
        ) {
          seriesMap[
            normalizedSeries
          ].owned++;
        }
      }

      return Object
        .values(seriesMap)
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        );
    }

    // ==========================================
    // PAGE COUNT
    // ==========================================

    function getTotalPages() {
      const sortedSeries =
        getSortedSeries();

      return Math.max(
        1,
        Math.ceil(
          sortedSeries.length /
          perPage
        )
      );
    }

    // ==========================================
    // GENERATE EMBED
    // ==========================================

    function generateEmbed() {
      const sortedSeries =
        getSortedSeries();

      const totalPages =
        getTotalPages();

      // Make sure page remains valid
      // after changing seasons.
      if (
        page >= totalPages
      ) {
        page =
          totalPages - 1;
      }

      if (
        page < 0
      ) {
        page = 0;
      }

      const start =
        page * perPage;

      const currentSeries =
        sortedSeries.slice(
          start,
          start + perPage
        );

      const description =
        currentSeries
          .map(
            (data, index) => {
              const complete =
                data.total > 0 &&
                data.owned ===
                  data.total;

              return (
                `${complete ? "✅" : "☐"} ` +
                `**${start + index + 1}. ${data.name}** ` +
                `(${data.owned}/${data.total})`
              );
            }
          )
          .join("\n");

      return new EmbedBuilder()
        .setColor(
          0x00aeff
        )

        .setTitle(
          `📚 ${message.author.username}'s Books • ` +
          `${getSeasonEmoji(activeSeason)} S${activeSeason}`
        )

        .setDescription(
          description ||
          `No series found in Season ${activeSeason}.`
        )

        .setFooter({
          text:
            `${getSeasonEmoji(activeSeason)} Season ${activeSeason} • ` +
            `Page ${page + 1}/${totalPages} • ` +
            `Series: ${sortedSeries.length} • ` +
            `✅ = completed`
        })

        .setTimestamp();
    }

    // ==========================================
    // SEASON BUTTONS
    // ==========================================

    function makeSeasonRow() {
      return new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "books_season_0"
            )

            .setLabel(
              "Season 0"
            )

            .setEmoji(
              "0️⃣"
            )

            .setStyle(
              activeSeason === 0
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary
            )

            .setDisabled(
              activeSeason === 0
            ),

          new ButtonBuilder()
            .setCustomId(
              "books_season_1"
            )

            .setLabel(
              "Season 1"
            )

            .setEmoji(
              "1️⃣"
            )

            .setStyle(
              activeSeason === 1
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary
            )

            .setDisabled(
              activeSeason === 1
            )
        );
    }

    // ==========================================
    // NAVIGATION BUTTONS
    // ==========================================

    function makeNavigationRow() {
      const totalPages =
        getTotalPages();

      return new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "books_prev"
            )

            .setLabel(
              "⬅️"
            )

            .setStyle(
              ButtonStyle.Primary
            )

            .setDisabled(
              totalPages <= 1
            ),

          new ButtonBuilder()
            .setCustomId(
              "books_next"
            )

            .setLabel(
              "➡️"
            )

            .setStyle(
              ButtonStyle.Primary
            )

            .setDisabled(
              totalPages <= 1
            )
        );
    }

    // ==========================================
    // COMPONENTS
    // ==========================================

    function getComponents() {
      return [
        makeSeasonRow(),
        makeNavigationRow()
      ];
    }

    // ==========================================
    // SEND
    // ==========================================

    const msg =
      await message.reply({
        embeds: [
          generateEmbed()
        ],

        components:
          getComponents()
      });

    const collector =
      msg.createMessageComponentCollector({
        time: 120000
      });

    // ==========================================
    // INTERACTIONS
    // ==========================================

    collector.on(
      "collect",

      async interaction => {
        collector.resetTimer();

        if (
          interaction.user.id !==
          message.author.id
        ) {
          return interaction.reply({
            content:
              "❌ This is not your books menu.",

            ephemeral:
              true
          });
        }

        // ======================================
        // SEASON 0
        // ======================================

        if (
          interaction.customId ===
          "books_season_0"
        ) {
          activeSeason = 0;
          page = 0;

          return interaction.update({
            embeds: [
              generateEmbed()
            ],

            components:
              getComponents()
          });
        }

        // ======================================
        // SEASON 1
        // ======================================

        if (
          interaction.customId ===
          "books_season_1"
        ) {
          activeSeason = 1;
          page = 0;

          return interaction.update({
            embeds: [
              generateEmbed()
            ],

            components:
              getComponents()
          });
        }

        // ======================================
        // NEXT PAGE
        // ======================================

        if (
          interaction.customId ===
          "books_next"
        ) {
          const totalPages =
            getTotalPages();

          page++;

          if (
            page >= totalPages
          ) {
            page = 0;
          }

          return interaction.update({
            embeds: [
              generateEmbed()
            ],

            components:
              getComponents()
          });
        }

        // ======================================
        // PREVIOUS PAGE
        // ======================================

        if (
          interaction.customId ===
          "books_prev"
        ) {
          const totalPages =
            getTotalPages();

          page--;

          if (
            page < 0
          ) {
            page =
              totalPages - 1;
          }

          return interaction.update({
            embeds: [
              generateEmbed()
            ],

            components:
              getComponents()
          });
        }
      }
    );

    // ==========================================
    // COLLECTOR END
    // ==========================================

    collector.on(
      "end",

      async () => {
        await msg
          .edit({
            components: []
          })
          .catch(() => {});
      }
    );
  }
};