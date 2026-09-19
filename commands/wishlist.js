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

  const nameQuery =
    String(name || "")
      .trim()
      .toLowerCase();

  const appearanceQuery =
    String(appearance || "")
      .trim()
      .toLowerCase();

  const results = [];


  function searchDatabase(
    database,
    cardSeason
  ) {

    for (const card of database) {

      // ================================
      // NAME / AKA FILTER
      // ================================

      let nameMatches = true;

      if (nameQuery) {

        const actualName =
          String(card.name || "")
            .toLowerCase();

        const nameMatch =
          actualName.includes(
            nameQuery
          );

        const akaMatch =
          Array.isArray(card.aka)
            ? card.aka.some(alias =>
                String(alias || "")
                  .toLowerCase()
                  .includes(nameQuery)
              )
            : false;

        nameMatches =
          nameMatch || akaMatch;
      }


      // ================================
      // APPEARANCE FILTER
      // ================================

      let appearanceMatches = true;

      if (appearanceQuery) {

        const cardAppearance =
          String(
            card.appearance ||
            card.show ||
            ""
          ).toLowerCase();

        appearanceMatches =
          cardAppearance.includes(
            appearanceQuery
          );
      }


      // ================================
      // MATCH
      // ================================

      if (
        nameMatches &&
        appearanceMatches
      ) {

        results.push({
          ...card,
          season: cardSeason
        });

      }
    }
  }


  // ====================================
  // SEASON FILTER
  // ====================================

  if (
    season === 0 ||
    season === 1
  ) {

    searchDatabase(
      getSeasonCards(season),
      season
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


  // ====================================
  // RANK RESULTS BEFORE 25 LIMIT
  // ====================================

  results.sort((a, b) => {

    const aName =
      String(a.name || "")
        .toLowerCase();

    const bName =
      String(b.name || "")
        .toLowerCase();


    if (nameQuery) {

      // Exact names first

      const aExact =
        aName === nameQuery;

      const bExact =
        bName === nameQuery;

      if (
        aExact !== bExact
      ) {
        return aExact
          ? -1
          : 1;
      }


      // Starts-with next

      const aStarts =
        aName.startsWith(
          nameQuery
        );

      const bStarts =
        bName.startsWith(
          nameQuery
        );

      if (
        aStarts !== bStarts
      ) {
        return aStarts
          ? -1
          : 1;
      }
    }


    // Alphabetical next

    const nameCompare =
      aName.localeCompare(
        bName
      );

    if (
      nameCompare !== 0
    ) {
      return nameCompare;
    }


    // Then appearance

    const appearanceCompare =
      String(
        a.appearance ||
        a.show ||
        ""
      ).localeCompare(
        String(
          b.appearance ||
          b.show ||
          ""
        )
      );

    if (
      appearanceCompare !== 0
    ) {
      return appearanceCompare;
    }


    // Then season

    return (
      Number(a.season) -
      Number(b.season)
    );

  });


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