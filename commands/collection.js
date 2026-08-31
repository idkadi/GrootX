const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

function getTierEmoji(tier) {
  switch (String(tier || "").toLowerCase()) {
    case "common":
      return "<:common:1504510702956839033>";
    case "uncommon":
      return "<:uncommon:1504510929210052698>";
    case "rare":
      return "<:rare:1504510606718275764>";
    case "epic":
      return "<:epic:1504510771214680175>";
    case "legendary":
      return "<:legendary:1504511435974377552>";
    default:
      return "❓";
  }
}

function getSeason(entry) {
  // Old collection records without season are Season 0.
  return Number(entry?.season ?? 0);
}

function getSeasonEmoji(season) {
  return Number(season) === 1 ? "1️⃣" : "0️⃣";
}

function getCardFromEntry(entry) {
  if (!entry) return null;

  const season = getSeason(entry);

  const database =
    season === 1
      ? season1Cards
      : season0Cards;

  return database.find(
    card => Number(card.id) === Number(entry.cardId)
  );
}

module.exports = {
  name: "collection",
  aliases: ["col"],

  async execute(message, args) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const cardTagsCol = db.collection("cardtags");

    const userId = message.author.id;

    const userCards = await collectionsCol
      .find({ userId })
      .sort({ _id: -1 })
      .toArray();

    if (!userCards || userCards.length === 0) {
      return message.reply("❌ Your collection is empty.");
    }

    const userTagsDocs = await cardTagsCol
      .find({ userId })
      .toArray();

    const userTags = {};

    for (const tag of userTagsDocs) {
      userTags[String(tag.code).toLowerCase()] = tag.emoji;
    }

    const validTiers = [
      "common",
      "uncommon",
      "rare",
      "epic",
      "legendary"
    ];

    // ==========================================
    // FILTER STATE
    // ==========================================

    let tierFilter = null;
    let seasonFilter = "all";

    if (args[0]) {
      const argument = args[0].toLowerCase();

      if (validTiers.includes(argument)) {
        tierFilter = argument;
      }

      if (
        argument === "s0" ||
        argument === "season0" ||
        argument === "0"
      ) {
        seasonFilter = "0";
      }

      if (
        argument === "s1" ||
        argument === "season1" ||
        argument === "1"
      ) {
        seasonFilter = "1";
      }
    }

    if (args[1]) {
      const argument = args[1].toLowerCase();

      if (validTiers.includes(argument)) {
        tierFilter = argument;
      }

      if (
        argument === "s0" ||
        argument === "season0" ||
        argument === "0"
      ) {
        seasonFilter = "0";
      }

      if (
        argument === "s1" ||
        argument === "season1" ||
        argument === "1"
      ) {
        seasonFilter = "1";
      }
    }

    let filteredCards = [];

    function applyFilters() {
      filteredCards = userCards.filter(entry => {
        const card = getCardFromEntry(entry);

        if (!card) return false;

        const season = getSeason(entry);

        if (
          seasonFilter !== "all" &&
          season !== Number(seasonFilter)
        ) {
          return false;
        }

        if (
          tierFilter &&
          String(card.tier || "").toLowerCase() !== tierFilter
        ) {
          return false;
        }

        return true;
      });
    }

    applyFilters();

    if (filteredCards.length === 0) {
      return message.reply("❌ No cards found.");
    }

    const perPage = 10;

    let page = 0;
    let imageIndex = 0;
    let viewMode = "list";
    let currentSort = "latest";

    // ==========================================
    // SORTING
    // ==========================================

    function applySort(sortType) {
      currentSort = sortType;

      switch (sortType) {
        case "latest":
          filteredCards.sort((a, b) =>
            b._id
              .toString()
              .localeCompare(a._id.toString())
          );
          break;

        case "name":
          filteredCards.sort((a, b) => {
            const cardA = getCardFromEntry(a);
            const cardB = getCardFromEntry(b);

            return (cardA?.name || "").localeCompare(
              cardB?.name || ""
            );
          });
          break;

        case "serial_low":
          filteredCards.sort(
            (a, b) =>
              Number(a.serial || 0) -
              Number(b.serial || 0)
          );
          break;

        case "serial_high":
          filteredCards.sort(
            (a, b) =>
              Number(b.serial || 0) -
              Number(a.serial || 0)
          );
          break;

        case "tag":
          filteredCards.sort((a, b) => {
            const tagA =
              userTags[String(a.code).toLowerCase()] || "";

            const tagB =
              userTags[String(b.code).toLowerCase()] || "";

            return tagA.localeCompare(tagB);
          });
          break;
      }
    }

    applySort("latest");

    function getTotalPages() {
      return Math.max(
        1,
        Math.ceil(filteredCards.length / perPage)
      );
    }

    // ==========================================
    // LIST VIEW
    // ==========================================

    function generateListEmbed() {
      const totalPages = getTotalPages();

      const start = page * perPage;
      const end = start + perPage;

      const currentCards = filteredCards.slice(
        start,
        end
      );

      const description = currentCards
        .map(entry => {
          const card = getCardFromEntry(entry);

          if (!card) {
            return "❌ Unknown Card";
          }

          const season = getSeason(entry);

          const savedTag =
            userTags[String(entry.code).toLowerCase()];

          const tagText = savedTag
            ? `${savedTag} • `
            : "";

          return (
            `🔹 ${tagText}` +
            `${getSeasonEmoji(season)} ` +
            `\`${entry.code}\` • ` +
            `${getTierEmoji(card.tier)} ` +
            `#${entry.serial} ` +
            `**${card.name}** ` +
            `• ${card.appearance || card.show || "Unknown"}`
          );
        })
        .join("\n");

      let filterText = "All Seasons";

      if (seasonFilter === "0") {
        filterText = "0️⃣ Season 0";
      }

      if (seasonFilter === "1") {
        filterText = "1️⃣ Season 1";
      }

      if (tierFilter) {
        filterText += ` • ${tierFilter}`;
      }

      return new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(
          `${message.author.username}'s Collection`
        )
        .setDescription(
          description || "No cards found."
        )
        .setFooter({
          text:
            `List View • Page ${page + 1}/${totalPages} • ` +
            `Total Cards: ${filteredCards.length} • ` +
            `${filterText} • ` +
            `Sort: ${currentSort}`
        })
        .setTimestamp();
    }

    // ==========================================
    // IMAGE VIEW
    // ==========================================

    async function generateImagePayload() {
      const entry = filteredCards[imageIndex];

      if (!entry) {
        return {
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription("❌ No card found.")
          ],
          files: [],
          components: [
            makeSortRow(),
            makeSeasonRow(),
            makeButtonRow()
          ]
        };
      }

      const card = getCardFromEntry(entry);

      if (!card) {
        return {
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setDescription(
                "❌ Card data not found."
              )
          ],
          files: [],
          components: [
            makeSortRow(),
            makeSeasonRow(),
            makeButtonRow()
          ]
        };
      }

      const season = getSeason(entry);

      const savedTag =
        userTags[String(entry.code).toLowerCase()];

      /*
       * IMPORTANT:
       *
       * renderCard handles the actual card image.
       *
       * S0:
       * Uses the Season 0 card data / S0 image style.
       *
       * S1:
       * Uses Season 1 rawImage + S1 default frame.
       *
       * Custom Frame:
       * Passing the full owned card entry lets
       * renderCard detect entry.frameId and render
       * the equipped custom frame.
       */

      const buffer = await renderCard(
        {
          ...card,
          season
        },
        entry.serial || "?",
        {
          ...entry,
          season
        }
      );

      const imageName =
        `collection-${entry.code}-s${season}.png`;

      const attachment =
        new AttachmentBuilder(buffer, {
          name: imageName
        });

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle(
          `${getSeasonEmoji(season)} ${card.name}`
        )
        .setDescription(
          `${getTierEmoji(card.tier)} **${card.tier}**\n\n` +
          `Season: **${getSeasonEmoji(season)} Season ${season}**\n` +
          `Series: **${card.appearance || card.show || "Unknown"}**\n` +
          `Serial: **#${entry.serial}**\n` +
          `Code: \`${entry.code}\`\n` +
          `Tag: ${savedTag || "None"}\n` +
          `Frame: ${
            entry.frameId
              ? `**#${entry.frameId}**`
              : "Default"
          }\n` +
          `Card: **${imageIndex + 1}/${filteredCards.length}**`
        )
        .setImage(
          `attachment://${imageName}`
        )
        .setFooter({
          text:
            `Image View • ` +
            `${getSeasonEmoji(season)} Season ${season} • ` +
            `Total Cards: ${filteredCards.length} • ` +
            `Sort: ${currentSort}`
        })
        .setTimestamp();

      return {
        embeds: [embed],
        files: [attachment],
        components: [
          makeSortRow(),
          makeSeasonRow(),
          makeButtonRow()
        ]
      };
    }

    // ==========================================
    // SORT MENU
    // ==========================================

    function makeSortRow() {
      const selectMenu =
        new StringSelectMenuBuilder()
          .setCustomId("col_sort")
          .setPlaceholder("Sort Collection")
          .addOptions([
            {
              label: "Latest",
              value: "latest",
              description:
                "Newest collected first"
            },
            {
              label: "Name",
              value: "name",
              description:
                "Sort alphabetically"
            },
            {
              label: "Serial Low",
              value: "serial_low",
              description:
                "Lowest serial first"
            },
            {
              label: "Serial High",
              value: "serial_high",
              description:
                "Highest serial first"
            },
            {
              label: "Tag",
              value: "tag",
              description:
                "Sort by tag"
            }
          ]);

      return new ActionRowBuilder().addComponents(
        selectMenu
      );
    }

    // ==========================================
    // SEASON FILTER
    // ==========================================

    function makeSeasonRow() {
      const seasonMenu =
        new StringSelectMenuBuilder()
          .setCustomId("col_season")
          .setPlaceholder("Filter by Season")
          .addOptions([
            {
              label: "All Seasons",
              value: "all",
              emoji: "🎴",
              description:
                "Show Season 0 and Season 1",
              default:
                seasonFilter === "all"
            },
            {
              label: "Season 0",
              value: "0",
              emoji: "0️⃣",
              description:
                "Show only Season 0 cards",
              default:
                seasonFilter === "0"
            },
            {
              label: "Season 1",
              value: "1",
              emoji: "1️⃣",
              description:
                "Show only Season 1 cards",
              default:
                seasonFilter === "1"
            }
          ]);

      return new ActionRowBuilder().addComponents(
        seasonMenu
      );
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    function makeButtonRow() {
      const totalPages = getTotalPages();

      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("col_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : filteredCards.length <= 1
          ),

        new ButtonBuilder()
          .setCustomId("col_view")
          .setLabel(
            viewMode === "list"
              ? "Image View"
              : "List View"
          )
          .setEmoji("🖼️")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("col_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : filteredCards.length <= 1
          )
      );
    }

    // ==========================================
    // PAYLOAD
    // ==========================================

    async function getPayload() {
      if (viewMode === "image") {
        return generateImagePayload();
      }

      return {
        embeds: [generateListEmbed()],
        files: [],
        components: [
          makeSortRow(),
          makeSeasonRow(),
          makeButtonRow()
        ]
      };
    }

    // ==========================================
    // SEND COLLECTION
    // ==========================================

    const msg = await message.reply(
      await getPayload()
    );

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
              "❌ This is not your collection.",
            ephemeral: true
          });
        }

        // ------------------------------
        // SORT
        // ------------------------------

        if (
          interaction.customId ===
          "col_sort"
        ) {
          applySort(interaction.values[0]);

          page = 0;
          imageIndex = 0;

          return interaction.update(
            await getPayload()
          );
        }

        // ------------------------------
        // SEASON FILTER
        // ------------------------------

        if (
          interaction.customId ===
          "col_season"
        ) {
          seasonFilter =
            interaction.values[0];

          applyFilters();
          applySort(currentSort);

          page = 0;
          imageIndex = 0;

          if (
            filteredCards.length === 0
          ) {
            const emptyEmbed =
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(
                  `${message.author.username}'s Collection`
                )
                .setDescription(
                  seasonFilter === "0"
                    ? "❌ You don't have any Season 0 cards matching this filter."
                    : seasonFilter === "1"
                      ? "❌ You don't have any Season 1 cards matching this filter."
                      : "❌ No cards found."
                );

            return interaction.update({
              embeds: [emptyEmbed],
              files: [],
              components: [
                makeSortRow(),
                makeSeasonRow()
              ]
            });
          }

          return interaction.update(
            await getPayload()
          );
        }

        // ------------------------------
        // CHANGE VIEW
        // ------------------------------

        if (
          interaction.customId ===
          "col_view"
        ) {
          viewMode =
            viewMode === "list"
              ? "image"
              : "list";

          page = 0;
          imageIndex = 0;

          return interaction.update(
            await getPayload()
          );
        }

        // ------------------------------
        // NEXT
        // ------------------------------

        if (
          interaction.customId ===
          "col_next"
        ) {
          if (viewMode === "list") {
            page++;

            if (
              page >= getTotalPages()
            ) {
              page = 0;
            }
          } else {
            imageIndex++;

            if (
              imageIndex >=
              filteredCards.length
            ) {
              imageIndex = 0;
            }
          }

          return interaction.update(
            await getPayload()
          );
        }

        // ------------------------------
        // PREVIOUS
        // ------------------------------

        if (
          interaction.customId ===
          "col_prev"
        ) {
          if (viewMode === "list") {
            page--;

            if (page < 0) {
              page =
                getTotalPages() - 1;
            }
          } else {
            imageIndex--;

            if (imageIndex < 0) {
              imageIndex =
                filteredCards.length - 1;
            }
          }

          return interaction.update(
            await getPayload()
          );
        }
      }
    );

    // ==========================================
    // COLLECTOR END
    // ==========================================

    collector.on("end", async () => {
      await msg
        .edit({
          components: []
        })
        .catch(() => {});
    });
  }
};