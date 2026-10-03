const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");
const path = require("path");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const isHalloween = (card, entry = {}) =>
  (entry.event || card.event) === "halloween2026";

const cardEmoji = (card, entry) =>
  isHalloween(card, entry) ? "🎃" : getTierEmoji(card.tier);

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
  // Legacy collection records count as Season 0.
  return Number(entry?.season ?? 0);
}

function getSeasonEmoji(season) {
  return SEASON_EMOJIS[Number(season) === 1 ? 1 : 0];
}

function getCardFromEntry(entry) {
  if (!entry) return null;

  const database = getSeason(entry) === 1
    ? season1Cards
    : season0Cards;

  return database.find(
    card => Number(card.id) === Number(entry.cardId)
  );
}

module.exports = {
  name: "collection",
  aliases: ["col"],

  data: new SlashCommandBuilder()
    .setName("collection")
    .setDescription("Browse your collection in list or image view.")
    .addStringOption(option =>
      option
        .setName("s")
        .setDescription("Season or event filter")
        .addChoices(
          { name: "Season 0", value: "0" },
          { name: "Season 1", value: "1" },
          { name: "Halloween", value: "halloween" }
        )
    )
    .addStringOption(option =>
      option
        .setName("tier")
        .setDescription("Optional rarity filter")
        .addChoices(
          ...["common", "uncommon", "rare", "epic", "legendary"]
            .map(tier => ({
              name: tier,
              value: tier
            }))
        )
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;

    if (slash && !message.deferred && !message.replied) {
      await message.deferReply();
    }

    const reply = payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      if (!slash) return message.reply(payload);

      return message.deferred
        ? message.editReply(payload)
        : message.followUp(payload);
    };

    if (slash) {
      args = [
        message.options.getString("s"),
        message.options.getString("tier")
      ].filter(Boolean);
    }

    try {
      const db = await connectDB();
      const collectionsCol = db.collection("collections");
      const cardTagsCol = db.collection("cardtags");
      const userId = user.id;

      const userCards = await collectionsCol
        .find({ userId })
        .sort({ _id: -1 })
        .toArray();

      if (!userCards || userCards.length === 0) {
        return reply("❌ Your collection is empty.");
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

      let tierFilter = null;
      let seasonFilter = "all";

      if (
        args.some(argument =>
          ["halloween", "halloween2026"].includes(
            argument.toLowerCase()
          )
        )
      ) {
        seasonFilter = "halloween";
      }

      const imageCache = new Map();

      if (args[0]) {
        const argument = args[0].toLowerCase();

        if (validTiers.includes(argument)) {
          tierFilter = argument;
        }

        if (["s0", "season0", "0"].includes(argument)) {
          seasonFilter = "0";
        }

        if (["s1", "season1", "1"].includes(argument)) {
          seasonFilter = "1";
        }
      }

      if (args[1]) {
        const argument = args[1].toLowerCase();

        if (validTiers.includes(argument)) {
          tierFilter = argument;
        }

        if (["s0", "season0", "0"].includes(argument)) {
          seasonFilter = "0";
        }

        if (["s1", "season1", "1"].includes(argument)) {
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
            seasonFilter === "halloween" &&
            !isHalloween(card, entry)
          ) {
            return false;
          }

          if (
            ["0", "1"].includes(seasonFilter) &&
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
        return reply("❌ No cards found.");
      }

      const perPage = 10;

      let page = 0;
      let imageIndex = 0;
      let viewMode = "list";
      let currentSort = "latest";

      function applySort(sortType) {
        currentSort = sortType;

        switch (sortType) {
          case "latest":
            filteredCards.sort((a, b) =>
              b._id.toString().localeCompare(a._id.toString())
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

      function generateListEmbed() {
        const totalPages = getTotalPages();
        const start = page * perPage;

        const currentCards = filteredCards.slice(
          start,
          start + perPage
        );

        const description = currentCards
          .map(entry => {
            const card = getCardFromEntry(entry);

            if (!card) return "❌ Unknown Card";

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
              `${cardEmoji(card, entry)} ` +
              `#${entry.serial} ` +
              `**${card.name}** ` +
              `• ${card.appearance || card.show || "Unknown"}`
            );
          })
          .join("\n");

        let filterText = "All Seasons";

        if (seasonFilter === "0") {
          filterText = "Season 0";
        }

        if (seasonFilter === "1") {
          filterText = "Season 1";
        }

        if (seasonFilter === "halloween") {
          filterText = "Halloween 2026";
        }

        if (tierFilter) {
          filterText += ` • ${tierFilter}`;
        }

        return new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle(`${user.username}'s Collection`)
          .setDescription(description || "No cards found.")
          .setFooter({
            text:
              `List View • Page ${page + 1}/${totalPages} • ` +
              `Total Cards: ${filteredCards.length} • ` +
              `${filterText} • Sort: ${currentSort}`
          })
          .setTimestamp();
      }

      async function generateImagePayload() {
        const entry = filteredCards[imageIndex];

        if (!entry) {
          return {
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setDescription("❌ No card found.")
            ],
            attachments: [],
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
                .setDescription("❌ Card data not found.")
            ],
            attachments: [],
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

        const cacheKey =
          `${entry.code}:${season}:${entry.frameId || "default"}`;

        let buffer = imageCache.get(cacheKey);

        if (!buffer) {
          // S0 uses its existing original card image when available.
          if (season === 0 && card.image) {
            const image = String(card.image).replace(/\\/g, "/");

            buffer = /^https?:\/\//i.test(image)
              ? image
              : path.resolve(
                  __dirname,
                  "..",
                  image.startsWith("images/")
                    ? image
                    : `images/${image}`
                );
          } else {
            // S1 preserves equipped frames and Halloween metadata.
            buffer = await renderCard(
              {
                ...card,
                season
              },
              entry.serial ?? "?",
              {
                ...entry,
                season,
                event: entry.event || card.event
              }
            );
          }

          imageCache.set(cacheKey, buffer);

          // Keep image memory bounded for large collections.
          if (imageCache.size > 8) {
            imageCache.delete(imageCache.keys().next().value);
          }
        }

        const imageName =
          `collection-${entry.code}-s${season}.png`;

        const attachment = new AttachmentBuilder(buffer, {
          name: imageName
        });

        const frameText = isHalloween(card, entry)
          ? "Halloween 2026"
          : entry.frameId
            ? `**#${entry.frameId}**`
            : "Default";

        const embed = new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle(`${getSeasonEmoji(season)} ${card.name}`)
          .setDescription(
            `${cardEmoji(card, entry)} ` +
            `**${isHalloween(card, entry) ? "Halloween" : card.tier}**\n\n` +
            `Season: **${getSeasonEmoji(season)} Season ${season}**\n` +
            `Series: **${card.appearance || card.show || "Unknown"}**\n` +
            `Serial: **#${entry.serial}**\n` +
            `Code: \`${entry.code}\`\n` +
            `Tag: ${savedTag || "None"}\n` +
            `Frame: ${frameText}\n` +
            `Card: **${imageIndex + 1}/${filteredCards.length}**`
          )
          .setImage(`attachment://${imageName}`)
          .setFooter({
            text:
              `Image View • Season ${season} • ` +
              `Total Cards: ${filteredCards.length} • ` +
              `Sort: ${currentSort}`
          })
          .setTimestamp();

        return {
          embeds: [embed],
          attachments: [],
          files: [attachment],
          components: [
            makeSortRow(),
            makeSeasonRow(),
            makeButtonRow()
          ]
        };
      }

      function makeSortRow() {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("col_sort")
          .setPlaceholder("Sort Collection")
          .addOptions([
            {
              label: "Latest",
              value: "latest",
              description: "Newest collected first"
            },
            {
              label: "Name",
              value: "name",
              description: "Sort alphabetically"
            },
            {
              label: "Serial Low",
              value: "serial_low",
              description: "Lowest serial first"
            },
            {
              label: "Serial High",
              value: "serial_high",
              description: "Highest serial first"
            },
            {
              label: "Tag",
              value: "tag",
              description: "Sort by tag"
            }
          ]);

        return new ActionRowBuilder().addComponents(selectMenu);
      }

      function makeSeasonRow() {
        const seasonMenu = new StringSelectMenuBuilder()
          .setCustomId("col_season")
          .setPlaceholder("Filter by Season")
          .addOptions([
            {
              label: "All Seasons",
              value: "all",
              emoji: "🎴",
              description: "Show Season 0 and Season 1",
              default: seasonFilter === "all"
            },
            {
              label: "Season 0",
              value: "0",
              emoji: SEASON_EMOJIS[0],
              description: "Show only Season 0 cards",
              default: seasonFilter === "0"
            },
            {
              label: "Season 1",
              value: "1",
              emoji: SEASON_EMOJIS[1],
              description: "Show only Season 1 cards",
              default: seasonFilter === "1"
            },
            {
              label: "Halloween 2026",
              value: "halloween",
              emoji: "🎃",
              default: seasonFilter === "halloween"
            }
          ]);

        return new ActionRowBuilder().addComponents(seasonMenu);
      }

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
              viewMode === "list" ? "Image View" : "List View"
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

      async function getPayload() {
        if (viewMode === "image") {
          return generateImagePayload();
        }

        return {
          embeds: [generateListEmbed()],
          attachments: [],
          files: [],
          components: [
            makeSortRow(),
            makeSeasonRow(),
            makeButtonRow()
          ]
        };
      }

      const msg = await reply(await getPayload());

      const collector = msg.createMessageComponentCollector({
        time: 120000
      });

      let busy = false;

      collector.on("collect", async interaction => {
        if (interaction.user.id !== user.id) {
          return interaction.reply({
            content: "❌ This is not your collection.",
            ephemeral: true
          });
        }

        let acquired = false;

        try {
          // Acknowledge BEFORE image rendering.
          await interaction.deferUpdate();

          if (busy || collector.ended) return;

          busy = true;
          acquired = true;
          collector.resetTimer();

          const id = interaction.customId;

          if (id === "col_sort") {
            applySort(interaction.values[0]);
            page = imageIndex = 0;
          } else if (id === "col_season") {
            seasonFilter = interaction.values[0];

            applyFilters();
            applySort(currentSort);

            page = imageIndex = 0;
          } else if (id === "col_view") {
            viewMode = viewMode === "list" ? "image" : "list";

            if (viewMode === "image") {
              imageIndex = page * perPage;
            } else {
              page = Math.floor(imageIndex / perPage);
            }
          } else if (
            id === "col_next" ||
            id === "col_prev"
          ) {
            const delta = id === "col_next" ? 1 : -1;

            if (viewMode === "list") {
              page =
                (page + delta + getTotalPages()) %
                getTotalPages();
            } else {
              const length = Math.max(1, filteredCards.length);

              imageIndex =
                (imageIndex + delta + length) % length;
            }
          }

          const payload = await getPayload();

          if (!collector.ended) {
            await interaction.editReply(payload);
          }
        } catch (error) {
          console.error(
            "[COLLECTION] Image/menu error:",
            error
          );

          await interaction.followUp({
            content:
              "❌ Could not load that card. Check its image " +
              "and frame files, or switch to List View.",
            ephemeral: true
          }).catch(() => {});
        } finally {
          if (acquired) busy = false;
        }
      });

      collector.on("end", async () => {
        await msg
          .edit({ components: [] })
          .catch(() => {});
      });
    } catch (error) {
      console.error("[COLLECTION]", error);

      return reply({
        content:
          "❌ Could not load your collection. Please try again."
      });
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;