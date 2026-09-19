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
// SEARCH BOTH SEASONS WITH FILTERS
// ==========================================

function findCards({
  name = "",
  season = null,
  appearance = ""
} = {}) {
  const nq =
    String(name || "")
      .trim()
      .toLowerCase();

  const aq =
    String(appearance || "")
      .trim()
      .toLowerCase();

  const results = [];

  function scan(
    database,
    cardSeason
  ) {
    for (const card of database) {
      const cardName =
        String(card.name || "")
          .toLowerCase();

      const aliases =
        Array.isArray(card.aka)
          ? card.aka
          : [];

      const cardAppearance =
        String(
          card.appearance ||
          card.show ||
          ""
        ).toLowerCase();

      const nameMatch =
        !nq ||
        cardName.includes(nq) ||
        aliases.some(alias =>
          String(alias || "")
            .toLowerCase()
            .includes(nq)
        );

      const appearanceMatch =
        !aq ||
        cardAppearance.includes(aq);

      if (
        nameMatch &&
        appearanceMatch
      ) {
        results.push({
          ...card,
          season: cardSeason
        });
      }
    }
  }

  // If season is provided, only search that season.
  if (
    season === 0 ||
    season === 1
  ) {
    scan(
      getSeasonCards(season),
      season
    );
  } else {
    // Otherwise search ALL S0 + S1 cards.
    scan(
      season0Cards,
      0
    );

    scan(
      season1Cards,
      1
    );
  }

  // IMPORTANT:
  // Rank results BEFORE Discord's 25-option limit.
  results.sort(
    (a, b) => {
      const an =
        String(a.name || "")
          .toLowerCase();

      const bn =
        String(b.name || "")
          .toLowerCase();

      if (nq) {
        // Exact name first
        const ae =
          an === nq;

        const be =
          bn === nq;

        if (
          ae !== be
        ) {
          return ae
            ? -1
            : 1;
        }

        // Starts-with second
        const as =
          an.startsWith(nq);

        const bs =
          bn.startsWith(nq);

        if (
          as !== bs
        ) {
          return as
            ? -1
            : 1;
        }
      }

      // Alphabetical name
      const nc =
        an.localeCompare(
          bn
        );

      if (
        nc !== 0
      ) {
        return nc;
      }

      // Appearance
      const aa =
        String(
          a.appearance ||
          a.show ||
          ""
        );

      const ba =
        String(
          b.appearance ||
          b.show ||
          ""
        );

      const ac =
        aa.localeCompare(
          ba
        );

      if (
        ac !== 0
      ) {
        return ac;
      }

      // Season
      return (
        Number(a.season) -
        Number(b.season)
      );
    }
  );

  return results;
}

// ==========================================
// RESPONSE HELPERS
// ==========================================

async function reply(ctx, payload) {
  if (
    typeof payload === "string"
  ) {
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
  if (
    typeof payload === "string"
  ) {
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
          "Use: `@GrootX wishlist add n:Spider-Man s:0 a:Spider-Man (2002)` " +
          "or `/wishlist add`"
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

  function clampIndexes() {
    const totalPages =
      getTotalPages();

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

    if (
      imageIndex >=
      wishedCards.length
    ) {
      imageIndex =
        Math.max(
          0,
          wishedCards.length - 1
        );
    }

    if (
      imageIndex < 0
    ) {
      imageIndex = 0;
    }
  }

  // ========================================
  // LIST EMBED
  // ========================================

  function buildListEmbed() {
    clampIndexes();

    const totalPages =
      getTotalPages();

    const start =
      page * PER_PAGE;

    const pageCards =
      wishedCards.slice(
        start,
        start + PER_PAGE
      );

    const description =
      pageCards.length
        ? pageCards
            .map(
              (card, index) => {
                const globalIndex =
                  start +
                  index +
                  1;

                const season =
                  Number(
                    card.season ??
                    0
                  );

                const appearance =
                  card.appearance ||
                  card.show ||
                  "Unknown";

                return (
                  `**${globalIndex}.** ` +
                  `${getSeasonEmoji(season)} ` +
                  `${getTierEmoji(getRarity(card))} ` +
                  `**${card.name}**\n` +
                  `└ ${appearance} • Season ${season}`
                );
              }
            )
            .join("\n\n")
        : (
          "No wishlist cards match this season filter."
        );

    return new EmbedBuilder()
      .setColor(
        0xffc107
      )
      .setAuthor({
        name:
          `${targetUser.username}'s Wishlist`,

        iconURL:
          targetUser.displayAvatarURL({
            dynamic: true
          })
      })
      .setDescription(
        description
      )
      .setFooter({
        text:
          `Page ${page + 1}/${totalPages} • ` +
          `${wishedCards.length} cards • ` +
          `Season: ${
            seasonFilter === "all"
              ? "All"
              : `S${seasonFilter}`
          }`
      });
  }

  // ========================================
  // LIST BUTTONS
  // ========================================

  function buildListButtons() {
    const totalPages =
      getTotalPages();

    const navRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "wish_prev"
            )
            .setLabel(
              "◀"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              page <= 0
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_next"
            )
            .setLabel(
              "▶"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              page >=
              totalPages - 1
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_image"
            )
            .setLabel(
              "🖼️ Image View"
            )
            .setStyle(
              ButtonStyle.Primary
            )
            .setDisabled(
              wishedCards.length === 0
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_sort"
            )
            .setLabel(
              "↕ Sort"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
        );

    const filterRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "wish_season_all"
            )
            .setLabel(
              "All"
            )
            .setStyle(
              seasonFilter === "all"
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_season_0"
            )
            .setLabel(
              "S0"
            )
            .setEmoji(
              "0️⃣"
            )
            .setStyle(
              seasonFilter === 0
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_season_1"
            )
            .setLabel(
              "S1"
            )
            .setEmoji(
              "1️⃣"
            )
            .setStyle(
              seasonFilter === 1
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
        );

    return [
      navRow,
      filterRow
    ];
  }
    // ========================================
  // IMAGE VIEW
  // ========================================

  async function buildImagePayload() {
    clampIndexes();

    if (
      wishedCards.length === 0
    ) {
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(
              0xffc107
            )
            .setTitle(
              `${targetUser.username}'s Wishlist`
            )
            .setDescription(
              "No wishlist cards match this season filter."
            )
        ],

        components:
          buildListButtons(),

        files: []
      };
    }

    const card =
      wishedCards[
        imageIndex
      ];

    const season =
      Number(
        card.season ??
        0
      );

    let buffer;

    try {
      buffer =
        await renderCard(
          card,
          "000000",
          {
            cardId:
              card.id,

            season
          }
        );
    }

    catch (error) {
      console.error(
        "Wishlist render error:",
        error
      );

      return {
        embeds: [
          new EmbedBuilder()
            .setColor(
              0xff0000
            )
            .setTitle(
              "❌ Render Error"
            )
            .setDescription(
              `Could not render **${card.name}** from Season ${season}.`
            )
        ],

        components:
          buildImageButtons(),

        files: []
      };
    }

    const attachment =
      new AttachmentBuilder(
        buffer,
        {
          name:
            "wishlist-card.png"
        }
      );

    const embed =
      new EmbedBuilder()
        .setColor(
          0xffc107
        )
        .setAuthor({
          name:
            `${targetUser.username}'s Wishlist`,

          iconURL:
            targetUser.displayAvatarURL({
              dynamic: true
            })
        })
        .setTitle(
          `${getSeasonEmoji(season)} ${card.name}`
        )
        .setDescription(
          `${getTierEmoji(getRarity(card))} ` +
          `**${getRarity(card)}**\n` +
          `🎬 ${card.appearance || card.show || "Unknown"}\n` +
          `🌌 Season ${season}`
        )
        .setImage(
          "attachment://wishlist-card.png"
        )
        .setFooter({
          text:
            `Card ${imageIndex + 1}/${wishedCards.length}`
        });

    return {
      embeds: [
        embed
      ],

      components:
        buildImageButtons(),

      files: [
        attachment
      ]
    };
  }


  // ========================================
  // IMAGE BUTTONS
  // ========================================

  function buildImageButtons() {
    const navRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "wish_img_prev"
            )
            .setLabel(
              "◀"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              imageIndex <= 0
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_img_next"
            )
            .setLabel(
              "▶"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              imageIndex >=
              wishedCards.length - 1
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_list"
            )
            .setLabel(
              "📋 List View"
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_sort"
            )
            .setLabel(
              "↕ Sort"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
        );

    const filterRow =
      new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "wish_season_all"
            )
            .setLabel(
              "All"
            )
            .setStyle(
              seasonFilter === "all"
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_season_0"
            )
            .setLabel(
              "S0"
            )
            .setEmoji(
              "0️⃣"
            )
            .setStyle(
              seasonFilter === 0
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "wish_season_1"
            )
            .setLabel(
              "S1"
            )
            .setEmoji(
              "1️⃣"
            )
            .setStyle(
              seasonFilter === 1
                ? ButtonStyle.Success
                : ButtonStyle.Secondary
            )
        );

    return [
      navRow,
      filterRow
    ];
  }


  // ========================================
  // SORT MENU
  // ========================================

  function buildSortMenu() {
    const sortMenu =
      new StringSelectMenuBuilder()
        .setCustomId(
          "wish_sort_select"
        )
        .setPlaceholder(
          "Choose sorting"
        )
        .addOptions(
          {
            label:
              "Default",

            value:
              "default",

            description:
              "Original wishlist order"
          },

          {
            label:
              "Name",

            value:
              "name",

            description:
              "Sort alphabetically"
          },

          {
            label:
              "Tier",

            value:
              "tier",

            description:
              "Sort by rarity / tier"
          },

          {
            label:
              "Series",

            value:
              "series",

            description:
              "Sort by appearance / series"
          }
        );

    return new ActionRowBuilder()
      .addComponents(
        sortMenu
      );
  }


  // ========================================
  // RESET ORIGINAL ORDER
  // ========================================

  function resetDefaultOrder() {
    wishedCards =
      originalEntries.filter(card =>
        seasonFilter === "all" ||
        Number(card.season) ===
          Number(seasonFilter)
      );
  }


  // ========================================
  // APPLY INITIAL FILTER
  // ========================================

  applyFiltersAndSort();


  // ========================================
  // INITIAL MESSAGE
  // ========================================

  const initialPayload = {
    embeds: [
      buildListEmbed()
    ],

    components:
      buildListButtons()
  };

  const msg =
    await reply(
      ctx,
      initialPayload
    );


  // ========================================
  // COMPONENT COLLECTOR
  // ========================================

  const collector =
    msg.createMessageComponentCollector({
      time:
        180000
    });


  collector.on(
    "collect",

    async interaction => {

      // Only the person who opened
      // the wishlist controls the menu.

      if (
        interaction.user.id !==
        viewerId
      ) {
        return interaction.reply({
          content:
            "❌ These wishlist controls aren't for you.",

          ephemeral:
            true
        });
      }


      // ====================================
      // PREVIOUS LIST PAGE
      // ====================================

      if (
        interaction.customId ===
        "wish_prev"
      ) {
        page--;

        clampIndexes();

        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // NEXT LIST PAGE
      // ====================================

      if (
        interaction.customId ===
        "wish_next"
      ) {
        page++;

        clampIndexes();

        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // SWITCH TO IMAGE VIEW
      // ====================================

      if (
        interaction.customId ===
        "wish_image"
      ) {
        viewMode =
          "image";

        imageIndex =
          Math.min(
            page * PER_PAGE,
            Math.max(
              0,
              wishedCards.length - 1
            )
          );

        const payload =
          await buildImagePayload();

        return interaction.update(
          payload
        );
      }


      // ====================================
      // SWITCH TO LIST VIEW
      // ====================================

      if (
        interaction.customId ===
        "wish_list"
      ) {
        viewMode =
          "list";

        page =
          Math.floor(
            imageIndex /
            PER_PAGE
          );

        clampIndexes();

        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // PREVIOUS IMAGE
      // ====================================

      if (
        interaction.customId ===
        "wish_img_prev"
      ) {
        imageIndex--;

        clampIndexes();

        const payload =
          await buildImagePayload();

        return interaction.update(
          payload
        );
      }


      // ====================================
      // NEXT IMAGE
      // ====================================

      if (
        interaction.customId ===
        "wish_img_next"
      ) {
        imageIndex++;

        clampIndexes();

        const payload =
          await buildImagePayload();

        return interaction.update(
          payload
        );
      }


      // ====================================
      // OPEN SORT MENU
      // ====================================

      if (
        interaction.customId ===
        "wish_sort"
      ) {
        const components =
          viewMode === "image"
            ? buildImageButtons()
            : buildListButtons();

        components.push(
          buildSortMenu()
        );

        return interaction.update({
          components
        });
      }


      // ====================================
      // SORT SELECTION
      // ====================================

      if (
        interaction.customId ===
        "wish_sort_select"
      ) {
        const selectedSort =
          interaction.values[0];

        if (
          selectedSort ===
          "default"
        ) {
          currentSort =
            "default";

          resetDefaultOrder();
        }

        else {
          applySort(
            selectedSort
          );
        }

        page = 0;
        imageIndex = 0;

        clampIndexes();


        if (
          viewMode === "image"
        ) {
          const payload =
            await buildImagePayload();

          return interaction.update(
            payload
          );
        }


        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // ALL SEASONS
      // ====================================

      if (
        interaction.customId ===
        "wish_season_all"
      ) {
        seasonFilter =
          "all";

        page = 0;
        imageIndex = 0;

        if (
          currentSort ===
          "default"
        ) {
          resetDefaultOrder();
        }

        else {
          applyFiltersAndSort();
        }

        clampIndexes();


        if (
          viewMode === "image"
        ) {
          if (
            wishedCards.length === 0
          ) {
            viewMode =
              "list";

            return interaction.update({
              embeds: [
                buildListEmbed()
              ],

              components:
                buildListButtons(),

              files: []
            });
          }

          const payload =
            await buildImagePayload();

          return interaction.update(
            payload
          );
        }


        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // SEASON 0 FILTER
      // ====================================

      if (
        interaction.customId ===
        "wish_season_0"
      ) {
        seasonFilter =
          0;

        page = 0;
        imageIndex = 0;

        if (
          currentSort ===
          "default"
        ) {
          resetDefaultOrder();
        }

        else {
          applyFiltersAndSort();
        }

        clampIndexes();


        if (
          viewMode === "image"
        ) {
          if (
            wishedCards.length === 0
          ) {
            viewMode =
              "list";

            return interaction.update({
              embeds: [
                buildListEmbed()
              ],

              components:
                buildListButtons(),

              files: []
            });
          }

          const payload =
            await buildImagePayload();

          return interaction.update(
            payload
          );
        }


        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }


      // ====================================
      // SEASON 1 FILTER
      // ====================================

      if (
        interaction.customId ===
        "wish_season_1"
      ) {
        seasonFilter =
          1;

        page = 0;
        imageIndex = 0;

        if (
          currentSort ===
          "default"
        ) {
          resetDefaultOrder();
        }

        else {
          applyFiltersAndSort();
        }

        clampIndexes();


        if (
          viewMode === "image"
        ) {
          if (
            wishedCards.length === 0
          ) {
            viewMode =
              "list";

            return interaction.update({
              embeds: [
                buildListEmbed()
              ],

              components:
                buildListButtons(),

              files: []
            });
          }

          const payload =
            await buildImagePayload();

          return interaction.update(
            payload
          );
        }


        return interaction.update({
          embeds: [
            buildListEmbed()
          ],

          components:
            buildListButtons(),

          files: []
        });
      }
    }
  );


  // ========================================
  // COLLECTOR END
  // ========================================

  collector.on(
    "end",

    async () => {
      try {
        await msg.edit({
          components: []
        });
      }

      catch (error) {
        // Message may have been deleted.
      }
    }
  );
}


// ==========================================
// ADD / REMOVE
// ==========================================

async function addOrRemoveWishlist(
  ctx,
  sub,
  filters
) {
  const db =
    await connectDB();

  const wishCol =
    db.collection(
      "wishlists"
    );

  const userId =
    ctx.user.id;


  const name =
    String(
      filters?.name || ""
    ).trim();


  const appearance =
    String(
      filters?.appearance || ""
    ).trim();


  const season =
    filters?.season ??
    null;


  // ========================================
  // VALIDATION
  // ========================================

  if (
    !name &&
    !appearance
  ) {
    return reply(
      ctx,

      "❌ Give at least `n:` or `a:`.\n" +

      `Example: \`@GrootX wishlist ${sub} ` +
      `n:spider-man s:0 a:spider-man (2002)\``
    );
  }


  if (
    season !== null &&
    season !== 0 &&
    season !== 1
  ) {
    return reply(
      ctx,

      "❌ `s:` must be `0` or `1`."
    );
  }


  // ========================================
  // GET WISHLIST
  // ========================================

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
    Array.isArray(
      data.cards
    )
      ? data.cards
      : [];


  // ========================================
  // SEARCH
  // ========================================

  /*
   * IMPORTANT:
   *
   * findCards() searches the COMPLETE
   * S0/S1 database first.
   *
   * n:
   * s:
   * a:
   *
   * are applied BEFORE we ever use
   * Discord's 25-option limit.
   */

  const matches =
    findCards({
      name,
      season,
      appearance
    });


  if (
    !matches.length
  ) {
    const used = [];


    if (name) {
      used.push(
        `n: **${name}**`
      );
    }


    if (
      season === 0 ||
      season === 1
    ) {
      used.push(
        `s: **${season}**`
      );
    }


    if (appearance) {
      used.push(
        `a: **${appearance}**`
      );
    }


    return reply(
      ctx,

      "❌ No cards found matching:\n" +

      used
        .map(
          value =>
            `• ${value}`
        )
        .join("\n")
    );
  }


  // ========================================
  // HANDLE EXACT CARD
  // ========================================

  async function handleCard(
    card
  ) {
    const cardSeason =
      Number(
        card.season ??
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
      `${cardSeason}:` +
      `${String(card.id)}`;


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

          `❌ ${getSeasonEmoji(cardSeason)} ` +
          `**${card.name}** ` +
          `• ${card.appearance || card.show || "Unknown"} ` +
          `• Season ${cardSeason} ` +
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

              season:
                cardSeason
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
        `${getSeasonEmoji(cardSeason)} ` +
        `${getTierEmoji(getRarity(card))} ` +
        `**${card.name}** ` +
        `• **${card.appearance || card.show || "Unknown"}** ` +
        `• **Season ${cardSeason}** ` +
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

          `❌ ${getSeasonEmoji(cardSeason)} ` +
          `**${card.name}** ` +
          `from Season ${cardSeason} ` +
          `is not in your wishlist.`
        );
      }


      const originalEntry =
        fresh.cards.find(
          entry =>
            wishlistKey(
              entry
            ) === key
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
        `${getSeasonEmoji(cardSeason)} ` +
        `**${card.name}** ` +
        `• **${card.appearance || card.show || "Unknown"}** ` +
        `• **Season ${cardSeason}** ` +
        `from your wishlist.`
      );
    }
  }


  // ========================================
  // ONLY ONE MATCH
  // ========================================

  if (
    matches.length === 1
  ) {
    return handleCard(
      matches[0]
    );
  }


  // ========================================
  // MULTIPLE MATCHES
  // ========================================

  /*
   * Discord only allows 25 select-menu
   * options.
   *
   * BUT filtering has already happened.
   *
   * Example:
   *
   * n:spider-man
   * s:1
   * a:no way home
   *
   * searches everything FIRST.
   */

  const visibleMatches =
    matches.slice(
      0,
      25
    );


  const options =
    visibleMatches.map(
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
            `${card.appearance || card.show || "Unknown"}`
          ).slice(
            0,
            100
          ),

        value:
          String(
            index
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
        "Select the exact card you want.\n" +

        "0️⃣ = Season 0 • 1️⃣ = Season 1\n\n" +

        `Found **${matches.length}** match(es).`
      )

      .setFooter({
        text:
          matches.length > 25
            ? (
              "Showing best 25 matches. " +
              "Use n:, s: or a: to narrow the search."
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
            "Choose exact card"
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
      time:
        120000
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
          interaction.values[0],
          10
        );


      const selectedCard =
        visibleMatches[
          selectedIndex
        ];


      if (
        !selectedCard
      ) {
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
            `${getSeasonEmoji(selectedCard.season)} ` +
            `**${selectedCard.name}** ` +
            `• ${selectedCard.appearance || selectedCard.show || "Unknown"} ` +
            `• Season ${selectedCard.season}.`
        })
        .catch(
          () => {}
        );


      return handleCard(
        selectedCard
      );
    }
  );


  collector.on(
    "end",

    async (
      _,
      reason
    ) => {

      if (
        reason !==
        "selected"
      ) {
        await msg
          .edit({
            content:
              "⌛ Wishlist selection timed out.",

            embeds: [],

            components: []
          })
          .catch(
            () => {}
          );
      }
    }
  );
}
// ==========================================
// PREFIX / MENTION FILTER PARSER
// ==========================================

function parseWishlistFilters(args) {
  const text =
    args
      .join(" ")
      .trim();

  const filters = {
    name: "",
    season: null,
    appearance: ""
  };

  /*
   * Supported examples:
   *
   * n:spider-man
   *
   * s:0
   *
   * a:spider-man (2002)
   *
   * n:spider-man s:0 a:spider-man (2002)
   *
   * Values can contain spaces.
   *
   * a:the amazing spider-man 2
   *
   * will continue until another
   * n:, s: or a: property appears.
   */

  const regex =
    /(?:^|\s)(n|s|a):/gi;

  const properties = [];

  let match;

  while (
    (match = regex.exec(text)) !== null
  ) {
    properties.push({
      key:
        match[1]
          .toLowerCase(),

      start:
        match.index,

      valueStart:
        regex.lastIndex
    });
  }

  for (
    let i = 0;
    i < properties.length;
    i++
  ) {
    const current =
      properties[i];

    const next =
      properties[i + 1];

    const value =
      text
        .slice(
          current.valueStart,

          next
            ? next.start
            : text.length
        )
        .trim();


    // ======================================
    // n: NAME
    // ======================================

    if (
      current.key === "n"
    ) {
      filters.name =
        value;
    }


    // ======================================
    // a: APPEARANCE
    // ======================================

    else if (
      current.key === "a"
    ) {
      filters.appearance =
        value;
    }


    // ======================================
    // s: SEASON
    // ======================================

    else if (
      current.key === "s"
    ) {
      const v =
        value
          .toLowerCase();


      if (
        v === "0" ||
        v === "s0" ||
        v === "season0"
      ) {
        filters.season =
          0;
      }


      else if (
        v === "1" ||
        v === "s1" ||
        v === "season1"
      ) {
        filters.season =
          1;
      }


      else if (value) {
        filters.season =
          NaN;
      }
    }
  }


  return filters;
}


// ==========================================
// PREFIX / @GROOTX COMMAND
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


  // ========================================
  // VIEW OWN WISHLIST
  // ========================================

  if (!sub) {
    return showWishlist(
      ctx,
      message.author
    );
  }


  // ========================================
  // VIEW ANOTHER USER
  // ========================================

  /*
   * Do NOT use:
   *
   * message.mentions.users.size > 0
   *
   * for add/remove.
   *
   * When the bot is invoked using:
   *
   * @GrootX wishlist add ...
   *
   * the message contains the bot mention.
   *
   * We don't want that mention to make the
   * command think we're trying to view a
   * user's wishlist.
   */

  if (
    ![
      "add",
      "remove"
    ].includes(sub) &&
    message.mentions.users.size > 0
  ) {
    /*
     * Find a mentioned user that isn't
     * the bot itself.
     */

    const targetUser =
      message.mentions.users.find(
        mentionedUser =>
          mentionedUser.id !==
          message.client.user.id
      );


    if (targetUser) {
      return showWishlist(
        ctx,
        targetUser
      );
    }
  }


  // ========================================
  // ADD / REMOVE
  // ========================================

  if (
    [
      "add",
      "remove"
    ].includes(sub)
  ) {
    // Remove add/remove from args.

    args.shift();


    const filters =
      parseWishlistFilters(
        args
      );


    return addOrRemoveWishlist(
      ctx,
      sub,
      filters
    );
  }


  // ========================================
  // HELP / INVALID COMMAND
  // ========================================

  return reply(
    ctx,

    "❌ Wishlist commands:\n\n" +

    "**View:**\n" +

    "`@GrootX wishlist`\n" +

    "`@GrootX wishlist @user`\n\n" +

    "**Add:**\n" +

    "`@GrootX wishlist add n:spider-man`\n" +

    "`@GrootX wishlist add n:spider-man s:0`\n" +

    "`@GrootX wishlist add a:spider-man (2002)`\n" +

    "`@GrootX wishlist add s:0 a:spider-man (2002)`\n" +

    "`@GrootX wishlist add n:spider-man s:0 a:spider-man (2002)`\n\n" +

    "**Remove:**\n" +

    "`@GrootX wishlist remove n:spider-man`\n" +

    "`@GrootX wishlist remove n:spider-man s:0 a:spider-man (2002)`"
  );
}


// ==========================================
// SLASH COMMAND HANDLER
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


  // ========================================
  // /wishlist view
  // ========================================

  if (
    sub === "view"
  ) {
    const targetUser =
      interaction.options
        .getUser(
          "user"
        ) ||
      interaction.user;


    return showWishlist(
      ctx,
      targetUser
    );
  }


  // ========================================
  // /wishlist add
  // /wishlist remove
  // ========================================

  if (
    sub === "add" ||
    sub === "remove"
  ) {
    // n:
    const name =
      interaction.options
        .getString(
          "n"
        ) || "";


    // s:
    const seasonValue =
      interaction.options
        .getString(
          "s"
        );


    // a:
    const appearance =
      interaction.options
        .getString(
          "a"
        ) || "";


    const season =
      seasonValue === null
        ? null
        : Number(
            seasonValue
          );


    return addOrRemoveWishlist(
      ctx,
      sub,
      {
        name,
        season,
        appearance
      }
    );
  }
}


// ==========================================
// SLASH N / S / A OPTIONS
// ==========================================

function addWishlistFilterOptions(
  sub
) {
  return sub

    // ======================================
    // n
    // ======================================

    .addStringOption(
      option =>
        option

          .setName(
            "n"
          )

          .setDescription(
            "Card / character name"
          )

          .setRequired(
            false
          )
    )


    // ======================================
    // s
    // ======================================

    .addStringOption(
      option =>
        option

          .setName(
            "s"
          )

          .setDescription(
            "Card season"
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
    )


    // ======================================
    // a
    // ======================================

    .addStringOption(
      option =>
        option

          .setName(
            "a"
          )

          .setDescription(
            "Appearance / series"
          )

          .setRequired(
            false
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


  // ========================================
  // SLASH COMMAND DATA
  // ========================================

  data:
    new SlashCommandBuilder()

      .setName(
        "wishlist"
      )

      .setDescription(
        "View or manage your wishlist"
      )


      // ====================================
      // VIEW
      // ====================================

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


      // ====================================
      // ADD
      // ====================================

      .addSubcommand(
        sub => {

          sub
            .setName(
              "add"
            )

            .setDescription(
              "Add a card to your wishlist"
            );


          return addWishlistFilterOptions(
            sub
          );
        }
      )


      // ====================================
      // REMOVE
      // ====================================

      .addSubcommand(
        sub => {

          sub
            .setName(
              "remove"
            )

            .setDescription(
              "Remove a card from your wishlist"
            );


          return addWishlistFilterOptions(
            sub
          );
        }
      ),


  // ========================================
  // PREFIX / MENTION EXECUTE
  // ========================================

  async execute(
    message,
    args
  ) {
    return runPrefix(
      message,
      args
    );
  },


  // ========================================
  // SLASH EXECUTE
  // ========================================

  async slashExecute(
    interaction
  ) {
    return runSlash(
      interaction
    );
  }
};
