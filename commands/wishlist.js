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
const season0Data = require("../data/cards.js");
const season1Data = require("../data/season1.js");
const renderCard = require("../utils/renderCard");

const PER_PAGE = 15;

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.cards)) return data.cards;
  return [];
}

const season0Cards = toArray(season0Data);
const season1Cards = toArray(season1Data);

function getTierEmoji(tier = "") {
  switch (String(tier).toLowerCase()) {
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

function getSeasonEmoji(season) {
  return Number(season) === 1
    ? "1️⃣"
    : "0️⃣";
}

function getRarity(card) {
  return card?.tier ||
    card?.rarity ||
    "Unknown";
}

function getSeasonCards(season) {
  return Number(season) === 1
    ? season1Cards
    : season0Cards;
}

function getCardBySeason(cardId, season) {
  return getSeasonCards(season).find(
    card =>
      Number(card.id) ===
      Number(cardId)
  );
}

// ==========================================
// WISHLIST ENTRY HELPERS
// ==========================================

/*
 * OLD FORMAT:
 *
 * cards: [
 *   5,
 *   12,
 *   28
 * ]
 *
 * These automatically become S0.
 *
 *
 * NEW FORMAT:
 *
 * cards: [
 *   {
 *     cardId: 5,
 *     season: 0
 *   },
 *   {
 *     cardId: 5,
 *     season: 1
 *   }
 * ]
 */

function normalizeWishlistEntry(entry) {
  if (
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry)
  ) {
    return {
      cardId:
        entry.cardId ??
        entry.id,

      season:
        Number(entry.season ?? 0)
    };
  }

  return {
    cardId: entry,
    season: 0
  };
}

function wishlistKey(entry) {
  const normalized =
    normalizeWishlistEntry(entry);

  return (
    `${normalized.season}:` +
    `${String(normalized.cardId)}`
  );
}

function resolveWishlistEntry(entry) {
  const normalized =
    normalizeWishlistEntry(entry);

  const card =
    getCardBySeason(
      normalized.cardId,
      normalized.season
    );

  if (!card) {
    return null;
  }

  return {
    ...card,

    wishlistCardId:
      normalized.cardId,

    season:
      normalized.season
  };
}

// ==========================================
// SEARCH BOTH SEASONS
// ==========================================

function findCards(
  query,
  forcedSeason = null
) {
  const q =
    String(query || "")
      .toLowerCase();

  const results = [];

  function searchDatabase(
    database,
    season
  ) {
    for (const card of database) {
      const nameMatch =
        card.name
          ?.toLowerCase()
          .includes(q);

      const akaMatch =
        Array.isArray(card.aka)
          ? card.aka.some(alias =>
              String(alias)
                .toLowerCase()
                .includes(q)
            )
          : false;

      if (
        nameMatch ||
        akaMatch
      ) {
        results.push({
          ...card,
          season
        });
      }
    }
  }

  if (
    forcedSeason === 0 ||
    forcedSeason === 1
  ) {
    searchDatabase(
      getSeasonCards(
        forcedSeason
      ),
      forcedSeason
    );
  } else {
    searchDatabase(
      season0Cards,
      0
    );

    searchDatabase(
      season1Cards,
      1
    );
  }

  return results;
}

// ==========================================
// RESPONSE HELPERS
// ==========================================

async function reply(ctx, payload) {
  if (typeof payload === "string") {
    payload = {
      content: payload
    };
  }

  if (ctx.interaction) {
    if (
      ctx.interaction.replied ||
      ctx.interaction.deferred
    ) {
      return ctx.interaction.followUp(
        payload
      );
    }

    return ctx.interaction.reply({
      ...payload,
      fetchReply: true
    });
  }

  return ctx.message.reply(
    payload
  );
}

async function send(ctx, payload) {
  if (typeof payload === "string") {
    payload = {
      content: payload
    };
  }

  if (ctx.interaction) {
    if (
      ctx.interaction.replied ||
      ctx.interaction.deferred
    ) {
      return ctx.interaction.followUp(
        payload
      );
    }

    return ctx.interaction.reply({
      ...payload,
      fetchReply: true
    });
  }

  return ctx.message.channel.send(
    payload
  );
}

// ==========================================
// SHOW WISHLIST
// ==========================================

async function showWishlist(
  ctx,
  targetUser
) {
  const db =
    await connectDB();

  const wishCol =
    db.collection("wishlists");

  const viewerId =
    ctx.user.id;

  const targetId =
    targetUser.id;

  const data =
    await wishCol.findOne({
      userId: targetId
    });

  if (
    !data ||
    !Array.isArray(data.cards) ||
    data.cards.length === 0
  ) {
    return reply(
      ctx,

      targetId === viewerId
        ? (
          "💫 Your wishlist is empty.\n" +
          "Use: `!wishlist add s0 Spider-Man`, " +
          "`!wishlist add s1 Spider-Man` or `/wishlist add`"
        )
        : (
          `💫 **${targetUser.username}**'s wishlist is empty.`
        )
    );
  }

  // Resolve each stored wishlist entry
  // using its own season database.
  const originalEntries =
    data.cards
      .map(resolveWishlistEntry)
      .filter(Boolean);

  let wishedCards =
    [...originalEntries];

  let page = 0;
  let imageIndex = 0;

  let viewMode =
    "list";

  let currentSort =
    "default";

  let seasonFilter =
    "all";

  // ========================================
  // FILTER + SORT
  // ========================================

  function applyFiltersAndSort() {
    wishedCards =
      originalEntries.filter(card =>
        seasonFilter === "all" ||
        Number(card.season) ===
          Number(seasonFilter)
      );

    if (
      currentSort === "name"
    ) {
      wishedCards.sort(
        (a, b) =>
          (a.name || "")
            .localeCompare(
              b.name || ""
            )
      );
    }

    if (
      currentSort === "tier"
    ) {
      wishedCards.sort(
        (a, b) =>
          getRarity(a)
            .localeCompare(
              getRarity(b)
            )
      );
    }

    if (
      currentSort === "series"
    ) {
      wishedCards.sort(
        (a, b) =>
          (
            a.appearance ||
            a.show ||
            ""
          ).localeCompare(
            b.appearance ||
            b.show ||
            ""
          )
      );
    }
  }

  function applySort(
    sortType
  ) {
    currentSort =
      sortType;

    applyFiltersAndSort();
  }

  function getTotalPages() {
    return Math.max(
      1,
      Math.ceil(
        wishedCards.length /
        PER_PAGE
      )
    );
  }

  // ========================================
  // LIST VIEW
  // ========================================

  function generateListEmbed() {
    const totalPages =
      getTotalPages();

    const start =
      page * PER_PAGE;

    const currentCards =
      wishedCards.slice(
        start,
        start + PER_PAGE
      );

    const description =
      currentCards
        .map((card, i) => {
          return (
            `🔹 **${start + i + 1}.** ` +

            `${getSeasonEmoji(
              card.season
            )} ` +

            `\`${card.id}\` • ` +

            `${getTierEmoji(
              getRarity(card)
            )} ` +

            `**${card.name}** ` +

            `• ${
              card.appearance ||
              card.show ||
              "Unknown"
            }`
          );
        })
        .join("\n");

    const seasonText =
      seasonFilter === "all"
        ? "All Seasons"
        : (
          `${getSeasonEmoji(
            seasonFilter
          )} Season ${
            seasonFilter
          }`
        );

    return new EmbedBuilder()
      .setColor(
        0xffc107
      )

      .setTitle(
        `${targetUser.username}'s Wishlist`
      )

      .setDescription(
        description ||
        "No cards found for this season."
      )

      .setFooter({
        text:
          `List View • ` +
          `Page ${page + 1}/${totalPages} • ` +
          `Total Wished: ${wishedCards.length} • ` +
          `${seasonText} • ` +
          `Sort: ${currentSort}`
      })

      .setTimestamp();
  }

  // ========================================
  // IMAGE VIEW
  // ========================================

  async function generateImagePayload() {
    const card =
      wishedCards[
        imageIndex
      ];

    if (!card) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(
              0xffc107
            )
            .setDescription(
              "❌ No wishlist cards found for this season."
            )
        ],

        files: [],

        components: [
          makeSelectRow(),
          makeSeasonRow()
        ]
      };
    }

    /*
     * Uses renderCard instead of
     * directly attaching card.image.
     *
     * S0 -> S0 rendering
     * S1 -> S1 rendering
     */

    const buffer =
      await renderCard(
        {
          ...card,
          season:
            Number(
              card.season
            )
        },

        "?",

        {
          season:
            Number(
              card.season
            )
        }
      );

    const imageName =
      `wishlist-${card.id}-s${card.season}.png`;

    const attachment =
      new AttachmentBuilder(
        buffer,
        {
          name:
            imageName
        }
      );

    const embed =
      new EmbedBuilder()

        .setColor(
          0xffc107
        )

        .setTitle(
          `${getSeasonEmoji(
            card.season
          )} ${card.name}`
        )

        .setDescription(
          `${getTierEmoji(
            getRarity(card)
          )} **${getRarity(card)}**\n\n` +

          `Season: **${getSeasonEmoji(
            card.season
          )} Season ${card.season}**\n` +

          `Series: **${
            card.appearance ||
            card.show ||
            "Unknown"
          }**\n` +

          `Card ID: \`${card.id}\`\n` +

          `Wishlist Card: **${
            imageIndex + 1
          }/${wishedCards.length}**`
        )

        .setImage(
          `attachment://${imageName}`
        )

        .setFooter({
          text:
            `Image View • ` +
            `Total Wished: ${wishedCards.length} • ` +
            `Sort: ${currentSort}`
        })

        .setTimestamp();

    return {
      embeds: [
        embed
      ],

      files: [
        attachment
      ],

      components: [
        makeSelectRow(),
        makeSeasonRow(),
        makeButtonRow()
      ]
    };
  }

  // ========================================
  // SORT MENU
  // ========================================

  function makeSelectRow() {
    return new ActionRowBuilder()
      .addComponents(

        new StringSelectMenuBuilder()
          .setCustomId(
            "wish_sort"
          )

          .setPlaceholder(
            "Sort Wishlist"
          )

          .addOptions([
            {
              label:
                "Default",

              value:
                "default",

              description:
                "Original wishlist order",

              default:
                currentSort ===
                "default"
            },

            {
              label:
                "Name",

              value:
                "name",

              description:
                "Sort alphabetically",

              default:
                currentSort ===
                "name"
            },

            {
              label:
                "Tier",

              value:
                "tier",

              description:
                "Sort by card tier",

              default:
                currentSort ===
                "tier"
            },

            {
              label:
                "Series",

              value:
                "series",

              description:
                "Sort by appearance / series",

              default:
                currentSort ===
                "series"
            }
          ])
      );
  }

  // ========================================
  // SEASON FILTER
  // ========================================

  function makeSeasonRow() {
    return new ActionRowBuilder()
      .addComponents(

        new StringSelectMenuBuilder()
          .setCustomId(
            "wish_season"
          )

          .setPlaceholder(
            "Filter by Season"
          )

          .addOptions([
            {
              label:
                "All Seasons",

              value:
                "all",

              emoji:
                "🎴",

              description:
                "Show Season 0 and Season 1",

              default:
                seasonFilter ===
                "all"
            },

            {
              label:
                "Season 0",

              value:
                "0",

              emoji:
                "0️⃣",

              description:
                "Show only Season 0 cards",

              default:
                seasonFilter ===
                "0"
            },

            {
              label:
                "Season 1",

              value:
                "1",

              emoji:
                "1️⃣",

              description:
                "Show only Season 1 cards",

              default:
                seasonFilter ===
                "1"
            }
          ])
      );
  }

  // ========================================
  // NAVIGATION
  // ========================================

  function makeButtonRow() {
    const totalPages =
      getTotalPages();

    return new ActionRowBuilder()
      .addComponents(

        new ButtonBuilder()
          .setCustomId(
            "wish_prev"
          )

          .setLabel(
            "⬅️"
          )

          .setStyle(
            ButtonStyle.Primary
          )

          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : wishedCards.length <= 1
          ),

        new ButtonBuilder()
          .setCustomId(
            "wish_view"
          )

          .setLabel(
            viewMode === "list"
              ? "Image View"
              : "List View"
          )

          .setEmoji(
            "🖼️"
          )

          .setStyle(
            ButtonStyle.Secondary
          ),

        new ButtonBuilder()
          .setCustomId(
            "wish_next"
          )

          .setLabel(
            "➡️"
          )

          .setStyle(
            ButtonStyle.Primary
          )

          .setDisabled(
            viewMode === "list"
              ? totalPages <= 1
              : wishedCards.length <= 1
          )
      );
  }

  // ========================================
  // BUILD PAYLOAD
  // ========================================

  async function getPayload() {
    if (
      viewMode === "image"
    ) {
      return generateImagePayload();
    }

    return {
      embeds: [
        generateListEmbed()
      ],

      files: [],

      components: [
        makeSelectRow(),
        makeSeasonRow(),
        makeButtonRow()
      ]
    };
  }

  applyFiltersAndSort();

  const msg =
    await reply(
      ctx,
      await getPayload()
    );

  const collector =
    msg.createMessageComponentCollector({
      time: 120000
    });

  // ========================================
  // INTERACTIONS
  // ========================================

  collector.on(
    "collect",

    async interaction => {
      collector.resetTimer();

      if (
        interaction.user.id !==
        viewerId
      ) {
        return interaction.reply({
          content:
            "❌ This is not your wishlist menu.",

          ephemeral:
            true
        });
      }

      // SORT

      if (
        interaction.customId ===
        "wish_sort"
      ) {
        applySort(
          interaction.values[0]
        );

        page = 0;
        imageIndex = 0;

        return interaction.update(
          await getPayload()
        );
      }

      // SEASON FILTER

      if (
        interaction.customId ===
        "wish_season"
      ) {
        seasonFilter =
          interaction.values[0];

        applyFiltersAndSort();

        page = 0;
        imageIndex = 0;

        return interaction.update(
          await getPayload()
        );
      }

      // CHANGE VIEW

      if (
        interaction.customId ===
        "wish_view"
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

      // NEXT

      if (
        interaction.customId ===
        "wish_next"
      ) {
        if (
          viewMode === "list"
        ) {
          page++;

          if (
            page >=
            getTotalPages()
          ) {
            page = 0;
          }
        } else {
          imageIndex++;

          if (
            imageIndex >=
            wishedCards.length
          ) {
            imageIndex = 0;
          }
        }

        return interaction.update(
          await getPayload()
        );
      }

      // PREVIOUS

      if (
        interaction.customId ===
        "wish_prev"
      ) {
        if (
          viewMode === "list"
        ) {
          page--;

          if (
            page < 0
          ) {
            page =
              getTotalPages() - 1;
          }
        } else {
          imageIndex--;

          if (
            imageIndex < 0
          ) {
            imageIndex =
              wishedCards.length - 1;
          }
        }

        return interaction.update(
          await getPayload()
        );
      }
    }
  );

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

// ==========================================
// ADD / REMOVE
// ==========================================

async function addOrRemoveWishlist(
  ctx,
  sub,
  query,
  chosenSeason = null
) {
  const db =
    await connectDB();

  const wishCol =
    db.collection("wishlists");

  const userId =
    ctx.user.id;

  if (!query) {
    return reply(
      ctx,

      `❌ Use: ` +
      `\`!wishlist ${sub} s0 <card name>\` / ` +
      `\`!wishlist ${sub} s1 <card name>\` ` +
      `or ` +
      `\`/wishlist ${sub} card:<card name> season:<0 or 1>\``
    );
  }

  let data =
    await wishCol.findOne({
      userId
    });

  if (!data) {
    data = {
      userId,
      cards: []
    };

    await wishCol.insertOne(
      data
    );
  }

  data.cards =
    Array.isArray(data.cards)
      ? data.cards
      : [];

  const matches =
    findCards(
      query,
      chosenSeason
    );

  if (!matches.length) {
    const seasonText =
      chosenSeason === 0 ||
      chosenSeason === 1
        ? (
          ` in ${getSeasonEmoji(
            chosenSeason
          )} Season ${chosenSeason}`
        )
        : "";

    return reply(
      ctx,

      `❌ No card found matching ` +
      `**${query}**${seasonText}.`
    );
  }

  async function handleCard(
    card
  ) {
    const season =
      Number(
        card.season ??
        chosenSeason ??
        0
      );

    const fresh =
      await wishCol.findOne({
        userId
      }) || {
        userId,
        cards: []
      };

    fresh.cards =
      Array.isArray(
        fresh.cards
      )
        ? fresh.cards
        : [];

    const key =
      `${season}:${String(
        card.id
      )}`;

    const existingKeys =
      fresh.cards.map(
        wishlistKey
      );

    // ======================================
    // ADD
    // ======================================

    if (
      sub === "add"
    ) {
      if (
        existingKeys.includes(
          key
        )
      ) {
        return send(
          ctx,

          `❌ ${getSeasonEmoji(
            season
          )} **${card.name}** ` +
          `from Season ${season} ` +
          `is already in your wishlist.`
        );
      }

      await wishCol.updateOne(
        {
          userId
        },

        {
          $push: {
            cards: {
              cardId:
                card.id,

              season
            }
          }
        },

        {
          upsert:
            true
        }
      );

      return send(
        ctx,

        `💫 Added ` +
        `${getSeasonEmoji(
          season
        )} ` +
        `${getTierEmoji(
          getRarity(card)
        )} ` +
        `**${card.name}** ` +
        `from **Season ${season}** ` +
        `to your wishlist.`
      );
    }

    // ======================================
    // REMOVE
    // ======================================

    if (
      sub === "remove"
    ) {
      if (
        !existingKeys.includes(
          key
        )
      ) {
        return send(
          ctx,

          `❌ ${getSeasonEmoji(
            season
          )} **${card.name}** ` +
          `from Season ${season} ` +
          `is not in your wishlist.`
        );
      }

      /*
       * Find the exact stored entry.
       *
       * This also allows old S0 numeric
       * entries to be removed correctly.
       */
      const originalEntry =
        fresh.cards.find(
          entry =>
            wishlistKey(entry) ===
            key
        );

      await wishCol.updateOne(
        {
          userId
        },

        {
          $pull: {
            cards:
              originalEntry
          }
        }
      );

      return send(
        ctx,

        `🗑️ Removed ` +
        `${getSeasonEmoji(
          season
        )} ` +
        `**${card.name}** ` +
        `from **Season ${season}** ` +
        `from your wishlist.`
      );
    }
  }

  // ========================================
  // ONLY ONE RESULT
  // ========================================

  if (
    matches.length === 1
  ) {
    return handleCard(
      matches[0]
    );
  }

  // ========================================
  // MULTIPLE RESULTS
  // ========================================

  const options =
    matches
      .slice(0, 25)
      .map(
        (card, index) => ({
          label:
            `${card.name} • S${card.season}`
              .slice(
                0,
                100
              ),

          description:
            (
              `${getRarity(card)} • ` +
              `${
                card.appearance ||
                card.show ||
                "Unknown"
              }`
            ).slice(
              0,
              100
            ),

          value:
            `${index}:${card.season}:${card.id}`
              .slice(
                0,
                100
              ),

          emoji:
            getSeasonEmoji(
              card.season
            )
        })
      );

  const embed =
    new EmbedBuilder()

      .setColor(
        0xffc107
      )

      .setTitle(
        "🔎 Multiple Cards Found"
      )

      .setDescription(
        "Select the exact card and season you want.\n" +
        "0️⃣ = Season 0 • 1️⃣ = Season 1"
      )

      .setFooter({
        text:
          matches.length > 25
            ? (
              "Only first 25 matches are shown. " +
              "Search more specifically if needed."
            )
            : (
              "Selection expires in 2 minutes."
            )
      });

  const row =
    new ActionRowBuilder()
      .addComponents(

        new StringSelectMenuBuilder()
          .setCustomId(
            "wish_card_select"
          )

          .setPlaceholder(
            "Choose card + season"
          )

          .addOptions(
            options
          )
      );

  const msg =
    await reply(
      ctx,
      {
        embeds: [
          embed
        ],

        components: [
          row
        ]
      }
    );

  const collector =
    msg.createMessageComponentCollector({
      time: 120000
    });

  collector.on(
    "collect",

    async interaction => {
      if (
        interaction.user.id !==
        userId
      ) {
        return interaction.reply({
          content:
            "❌ This is not your wishlist selection.",

          ephemeral:
            true
        });
      }

      const selectedIndex =
        Number.parseInt(
          interaction
            .values[0]
            .split(":")[0],
          10
        );

      const selectedCard =
        matches[
          selectedIndex
        ];

      if (!selectedCard) {
        return interaction.reply({
          content:
            "❌ Selected card not found.",

          ephemeral:
            true
        });
      }

      collector.stop(
        "selected"
      );

      await interaction
        .update({
          embeds: [],
          components: [],

          content:
            `✅ Selected ` +
            `${getSeasonEmoji(
              selectedCard.season
            )} ` +
            `**${selectedCard.name}** ` +
            `• Season ${selectedCard.season}.`
        })
        .catch(() => {});

      return handleCard(
        selectedCard
      );
    }
  );

  collector.on(
    "end",

    async (_, reason) => {
      if (
        reason !== "selected"
      ) {
        await msg
          .edit({
            content:
              "⌛ Wishlist selection timed out.",

            embeds: [],
            components: []
          })
          .catch(() => {});
      }
    }
  );
}

// ==========================================
// PREFIX SEASON PARSER
// ==========================================

function parsePrefixSeason(
  args
) {
  const value =
    String(
      args[0] || ""
    ).toLowerCase();

  if (
    [
      "s0",
      "season0",
      "0"
    ].includes(
      value
    )
  ) {
    args.shift();

    return 0;
  }

  if (
    [
      "s1",
      "season1",
      "1"
    ].includes(
      value
    )
  ) {
    args.shift();

    return 1;
  }

  return null;
}

// ==========================================
// PREFIX COMMAND
// ==========================================

async function runPrefix(
  message,
  args
) {
  const user =
    message.author;

  const sub =
    args[0]
      ?.toLowerCase();

  const ctx = {
    message,
    user
  };

  if (
    !sub ||
    message.mentions.users.size > 0
  ) {
    const targetUser =
      message.mentions.users.first() ||
      message.author;

    return showWishlist(
      ctx,
      targetUser
    );
  }

  if (
    ![
      "add",
      "remove"
    ].includes(sub)
  ) {
    return reply(
      ctx,

      "❌ Use:\n" +

      "`!wishlist`\n" +

      "`!wishlist @user`\n" +

      "`!wishlist add s0 <card name>`\n" +

      "`!wishlist add s1 <card name>`\n" +

      "`!wishlist remove s0 <card name>`\n" +

      "`!wishlist remove s1 <card name>`"
    );
  }

  args.shift();

  const chosenSeason =
    parsePrefixSeason(
      args
    );

  const query =
    args
      .join(" ")
      .trim();

  return addOrRemoveWishlist(
    ctx,
    sub,
    query,
    chosenSeason
  );
}

// ==========================================
// SLASH COMMAND
// ==========================================

async function runSlash(
  interaction
) {
  const sub =
    interaction.options
      .getSubcommand();

  const ctx = {
    interaction,

    user:
      interaction.user
  };

  if (
    sub === "view"
  ) {
    const targetUser =
      interaction.options
        .getUser("user") ||
      interaction.user;

    return showWishlist(
      ctx,
      targetUser
    );
  }

  if (
    sub === "add" ||
    sub === "remove"
  ) {
    const query =
      interaction.options
        .getString(
          "card"
        );

    const seasonValue =
      interaction.options
        .getString(
          "season"
        );

    const chosenSeason =
      seasonValue === null
        ? null
        : Number(
            seasonValue
          );

    return addOrRemoveWishlist(
      ctx,
      sub,
      query,
      chosenSeason
    );
  }
}

// ==========================================
// SLASH SEASON OPTION
// ==========================================

function addSeasonOption(
  sub
) {
  return sub
    .addStringOption(
      option =>
        option
          .setName(
            "season"
          )

          .setDescription(
            "Choose the card season"
          )

          .setRequired(
            false
          )

          .addChoices(
            {
              name:
                "0️⃣ Season 0",

              value:
                "0"
            },

            {
              name:
                "1️⃣ Season 1",

              value:
                "1"
            }
          )
    );
}

// ==========================================
// EXPORT
// ==========================================

module.exports = {
  name:
    "wishlist",

  aliases: [
    "wish"
  ],

  data:
    new SlashCommandBuilder()

      .setName(
        "wishlist"
      )

      .setDescription(
        "View or manage your wishlist"
      )

      // VIEW
      .addSubcommand(
        sub =>
          sub
            .setName(
              "view"
            )

            .setDescription(
              "View your or another user's wishlist"
            )

            .addUserOption(
              option =>
                option
                  .setName(
                    "user"
                  )

                  .setDescription(
                    "User whose wishlist you want to view"
                  )

                  .setRequired(
                    false
                  )
            )
      )

      // ADD
      .addSubcommand(
        sub => {
          sub
            .setName(
              "add"
            )

            .setDescription(
              "Add a card to your wishlist"
            )

            .addStringOption(
              option =>
                option
                  .setName(
                    "card"
                  )

                  .setDescription(
                    "Card name"
                  )

                  .setRequired(
                    true
                  )
            );

          return addSeasonOption(
            sub
          );
        }
      )

      // REMOVE
      .addSubcommand(
        sub => {
          sub
            .setName(
              "remove"
            )

            .setDescription(
              "Remove a card from your wishlist"
            )

            .addStringOption(
              option =>
                option
                  .setName(
                    "card"
                  )

                  .setDescription(
                    "Card name"
                  )

                  .setRequired(
                    true
                  )
            );

          return addSeasonOption(
            sub
          );
        }
      ),

  async execute(
    message,
    args
  ) {
    return runPrefix(
      message,
      args
    );
  },

  async slashExecute(
    interaction
  ) {
    return runSlash(
      interaction
    );
  }
};