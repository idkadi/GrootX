const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder, SlashCommandBuilder
} = require("discord.js");
const connectDB = require("../database");
const season0Data = require("../data/cards.js");
const season1Data = require("../data/season1.js");
const renderCard = require("../utils/renderCard");
const path = require("path");

const MAX_WISHES = 15;
let cleanupPromise;

async function wishlistCollection() {
  const db = await connectDB();
  const col = db.collection("wishlists");

  if (!cleanupPromise) {
    cleanupPromise = col.updateMany(
      { "cards.15": { $exists: true } },
      [{ $set: { cards: { $slice: ["$cards", MAX_WISHES] } } }]
    ).catch(error => {
      cleanupPromise = null;
      throw error;
    });
  }

  await cleanupPromise;
  return col;
}

const PER_PAGE = 15;
const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const toArray = data => Array.isArray(data) ? data : data?.cards || [];
const databases = [toArray(season0Data), toArray(season1Data)];
const seasonEmoji = season => SEASON_EMOJIS[Number(season) === 1 ? 1 : 0];
const appearance = card => card.appearance || card.show || "Unknown";
const isHalloween = card => card.event === "halloween2026";
const rarity = card => isHalloween(card)
  ? "Halloween"
  : card.tier || card.rarity || "Unknown";

function cardEmoji(card) {
  if (isHalloween(card)) return "🎃";

  return {
    common: "<:common:1504510702956839033>",
    uncommon: "<:uncommon:1504510929210052698>",
    rare: "<:rare:1504510606718275764>",
    epic: "<:epic:1504510771214680175>",
    legendary: "<:legendary:1504511435974377552>"
  }[String(card.tier || card.rarity || "").toLowerCase()] || "❓";
}

function normalize(entry) {
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? {
        cardId: Number(entry.cardId ?? entry.id),
        season: Number(entry.season ?? 0)
      }
    : { cardId: Number(entry), season: 0 };
}

function key(entry) {
  const e = normalize(entry);
  return `${e.season}:${e.cardId}`;
}

function resolve(entry) {
  const e = normalize(entry);
  const card = databases[e.season]?.find(c => Number(c.id) === e.cardId);
  return card ? { ...card, season: e.season } : null;
}

async function wishlistImage(card) {
  // S0 image files already contain their original card design.
  if (card.season === 0 && card.image) {
    if (/^https?:\/\//i.test(card.image)) return card.image;

    const image = String(card.image).replace(/\\/g, "/");
    return path.resolve(
      __dirname,
      "..",
      image.startsWith("images/") ? image : `images/${image}`
    );
  }

  return renderCard(card, "?", {
    season: card.season,
    event: card.event
  });
}

// Spider-Man and Spider Man both match.
const searchText = value => String(value || "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");

function findCards(filters) {
  const n = searchText(filters.name);
  const a = searchText(filters.appearance);

  return databases.flatMap((cards, season) =>
    filters.season !== null && filters.season !== season
      ? []
      : cards.filter(card =>
          [card.name, ...(Array.isArray(card.aka) ? card.aka : [])]
            .some(name => searchText(name).includes(n)) &&
          (!a || searchText(appearance(card)).includes(a))
        ).map(card => ({ ...card, season }))
  ).sort((x, y) =>
    Number(searchText(y.name) === n) -
      Number(searchText(x.name) === n) ||
    String(x.name).localeCompare(String(y.name)) ||
    appearance(x).localeCompare(appearance(y)) ||
    x.season - y.season ||
    Number(x.id) - Number(y.id)
  );
}

function parseFilters(args) {
  const text = args.join(" ");
  const markers = [...text.matchAll(/(?:^|\s)(n|s|a):/gi)];
  const result = { name: "", season: null, appearance: "" };

  markers.forEach((m, i) => {
    const value = text.slice(
      m.index + m[0].length,
      markers[i + 1]?.index ?? text.length
    ).trim();

    const field = m[1].toLowerCase();

    if (field === "n") result.name = value;
    if (field === "a") result.appearance = value;

    if (field === "s") {
      const v = value.toLowerCase().replace(/^season|^s/, "");
      result.season = v === "0" || v === "1" ? Number(v) : NaN;
    }
  });

  return result;
}

async function reply(ctx, payload) {
  if (typeof payload === "string") payload = { content: payload };

  if (!ctx.interaction) return ctx.message.reply(payload);
  if (ctx.interaction.deferred) return ctx.interaction.editReply(payload);
  if (ctx.interaction.replied) return ctx.interaction.followUp(payload);

  await ctx.interaction.reply(payload);
  return ctx.interaction.fetchReply();
}

function button(id, label, disabled = false, emoji = null) {
  const b = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);

  if (emoji) b.setEmoji(emoji);
  return b;
}

function expire(msg, collector) {
  collector.on("end", () =>
    msg.edit({ components: [] }).catch(() => {})
  );
}

async function componentError(i, error) {
  console.error("[WISHLIST]", error);

  const payload = {
    content: "❌ Could not complete that action. Please try again.",
    ephemeral: true
  };

  if (i.deferred || i.replied) {
    return i.followUp(payload).catch(() => {});
  }

  return i.reply(payload).catch(() => {});
}

async function wishlistCounts(col, entries) {
  const wanted = new Set(
    entries.map(card => key({
      cardId: card.id,
      season: card.season
    }))
  );

  const ids = [...new Set(entries.map(c => Number(c.id)))];

  const docs = await col.find({
    $or: [
      { "cards.cardId": { $in: ids } },
      { "cards.id": { $in: ids } },
      { cards: { $in: ids } }
    ]
  }).toArray();

  const users = new Map();

  for (const doc of docs) {
    if (!doc.userId) continue;

    for (const entry of Array.isArray(doc.cards) ? doc.cards : []) {
      const k = key(entry);
      if (!wanted.has(k)) continue;

      if (!users.has(k)) users.set(k, new Set());
      users.get(k).add(doc.userId);
    }
  }

  return new Map([...users].map(([k, people]) => [k, people.size]));
}

async function showWishlist(ctx, target) {
  const col = await wishlistCollection();
  const doc = await col.findOne({ userId: target.id });
  const original = [];
  const seen = new Set();

  for (const entry of Array.isArray(doc?.cards) ? doc.cards : []) {
    const card = resolve(entry);

    if (card && !seen.has(key(entry))) {
      seen.add(key(entry));
      original.push(card);
    }
  }

  if (!original.length) {
    return reply(
      ctx,
      `💫 **${target.username}**'s wishlist is empty.\n` +
      "Use `@GrootX wishlist add n:spider-man` or `/wishlist add`."
    );
  }

  const counts = await wishlistCounts(col, original);

  let filter = "all";
  let sort = "default";
  let mode = "list";
  let index = 0;
  let page = 0;
  let busy = false;

  const cache = new Map();

  function cards() {
    const list = original.filter(c =>
      filter === "all" ||
      (filter === "halloween"
        ? isHalloween(c)
        : c.season === Number(filter))
    );

    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === "tier") {
      list.sort((a, b) => rarity(a).localeCompare(rarity(b)));
    }

    if (sort === "series") {
      list.sort((a, b) =>
        appearance(a).localeCompare(appearance(b))
      );
    }

    return list;
  }

  function controls(list) {
    const total = mode === "image"
      ? list.length
      : Math.ceil(list.length / PER_PAGE);

    const pos = mode === "image" ? index : page;

    return [
      new ActionRowBuilder().addComponents(
        button("wish_prev", "Previous", pos <= 0),
        button("wish_next", "Next", pos >= total - 1),
        button(
          "wish_toggle",
          mode === "image" ? "List View" : "Image View",
          !list.length
        )
      ),

      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("wish_filter")
          .setPlaceholder("Filter by season")
          .addOptions([
            {
              label: "All cards",
              value: "all",
              default: filter === "all"
            },
            {
              label: "Season 0",
              value: "0",
              emoji: SEASON_EMOJIS[0],
              default: filter === "0"
            },
            {
              label: "Season 1",
              value: "1",
              emoji: SEASON_EMOJIS[1],
              default: filter === "1"
            },
            {
              label: "Halloween 2026",
              value: "halloween",
              emoji: "🎃",
              default: filter === "halloween"
            }
          ])
      ),

      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("wish_sort")
          .setPlaceholder("Sort wishlist")
          .addOptions(
            ["default", "name", "tier", "series"].map(v => ({
              label: v === "default"
                ? "Original order"
                : v[0].toUpperCase() + v.slice(1),
              value: v,
              default: sort === v
            }))
          )
      )
    ];
  }

  const heart = card =>
    `❤️ ${counts.get(key({
      cardId: card.id,
      season: card.season
    })) || 0}`;

  async function payload() {
    const list = cards();

    page = Math.max(
      0,
      Math.min(page, Math.ceil(list.length / PER_PAGE) - 1)
    );

    index = Math.max(0, Math.min(index, list.length - 1));

    const embed = new EmbedBuilder()
      .setColor(0xffc107)
      .setAuthor({
        name: `${target.username}'s Wishlist`,
        iconURL: target.displayAvatarURL()
      });

    const out = {
      embeds: [embed],
      components: controls(list),
      attachments: [],
      files: []
    };

    if (mode === "image" && list.length) {
      const card = list[index];
      const k = key({ cardId: card.id, season: card.season });

      try {
        if (!cache.has(k)) {
          cache.set(k, await wishlistImage(card));
        }

        out.files = [
          new AttachmentBuilder(cache.get(k), {
            name: "wishlist-card.png"
          })
        ];

        embed
          .setTitle(card.name)
          .setDescription(
            `${seasonEmoji(card.season)} ${cardEmoji(card)} ` +
            `**${rarity(card)}** • ${heart(card)}\n` +
            `🎬 ${appearance(card)}`
          )
          .setImage("attachment://wishlist-card.png")
          .setFooter({
            text:
              `Card ${index + 1}/${list.length} • ` +
              `${original.length}/${MAX_WISHES} wishes`
          });
      } catch (error) {
        console.error("[WISHLIST] Render failed:", error);

        embed.setDescription(
          `❌ Could not render ${seasonEmoji(card.season)} ` +
          `**${card.name}**. Check its image and frame files.`
        );
      }
    } else {
      embed
        .setDescription(
          list.length
            ? list
                .slice(page * PER_PAGE, (page + 1) * PER_PAGE)
                .map((c, i) =>
                  `**${page * PER_PAGE + i + 1}.** ` +
                  `${seasonEmoji(c.season)} ${cardEmoji(c)} ` +
                  `**${c.name}** • ${heart(c)}\n` +
                  `└ ${appearance(c)} • ID ${c.id}`
                )
                .join("\n\n")
            : "No cards match this season."
        )
        .setFooter({
          text:
            `Page ${page + 1}/` +
            `${Math.max(1, Math.ceil(list.length / PER_PAGE))} • ` +
            `${original.length}/${MAX_WISHES} wishes`
        });
    }

    return out;
  }

  const msg = await reply(ctx, await payload());
  const collector = msg.createMessageComponentCollector({
    time: 180000
  });

  collector.on("collect", async i => {
    if (i.user.id !== ctx.user.id) {
      return i.reply({
        content: "❌ These controls aren't for you.",
        ephemeral: true
      });
    }

    let acquired = false;

    try {
      // Acknowledge before rendering or database work.
      await i.deferUpdate();

      if (busy) return;
      busy = true;
      acquired = true;

      if (i.customId === "wish_filter") {
        filter = i.values[0];
        page = index = 0;
      }

      if (i.customId === "wish_sort") {
        sort = i.values[0];
        page = index = 0;
      }

      if (i.customId === "wish_toggle") {
        mode = mode === "list" ? "image" : "list";

        if (mode === "image") index = page * PER_PAGE;
        else page = Math.floor(index / PER_PAGE);
      }

      if (i.customId === "wish_prev") {
        if (mode === "image") index--;
        else page--;
      }

      if (i.customId === "wish_next") {
        if (mode === "image") index++;
        else page++;
      }

      const next = await payload();

      if (!collector.ended) {
        await i.editReply(next);
      }
    } catch (error) {
      await componentError(i, error);
    } finally {
      if (acquired) busy = false;
    }
  });

  expire(msg, collector);
}

async function changeWishlist(col, userId, sub, card) {
  const entry = {
    cardId: Number(card.id),
    season: card.season
  };

  // Compare stored snapshots to prevent concurrent additions
  // from bypassing the limit or adding duplicates.
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc = await col.findOne({ userId });
    const stored = Array.isArray(doc?.cards) ? doc.cards : [];

    const unique = [
      ...new Map(stored.map(e => [key(e), e])).values()
    ];

    const exists = stored.some(e => key(e) === key(entry));

    if (sub === "add" && exists) {
      return "❌ That card is already in your wishlist.";
    }

    if (sub === "remove" && !exists) {
      return "❌ That card isn't in your wishlist.";
    }

    if (sub === "add" && unique.length >= MAX_WISHES) {
      return (
        "❌ Your wishlist is full (15 cards maximum). " +
        "Remove a card first."
      );
    }

    const next = sub === "add"
      ? [...unique, entry]
      : unique.filter(e => key(e) !== key(entry));

    if (!doc) {
      try {
        await col.insertOne({ userId, cards: next });
      } catch (e) {
        if (e.code === 11000) continue;
        throw e;
      }
    } else {
      const query = {
        _id: doc._id,
        cards: doc.cards === undefined
          ? { $exists: false }
          : doc.cards
      };

      const result = await col.updateOne(
        query,
        { $set: { cards: next } }
      );

      if (!result.modifiedCount) continue;
    }

    return (
      `${sub === "add" ? "💫 Added" : "🗑️ Removed"} ` +
      `${seasonEmoji(card.season)} ${cardEmoji(card)} ` +
      `**${card.name}** • **${appearance(card)}** • ID ${card.id} ` +
      `${sub === "add" ? "to" : "from"} your wishlist.`
    );
  }

  return (
    "❌ Your wishlist changed while processing. Please try again."
  );
}

async function addOrRemove(ctx, sub, filters) {
  if (!filters.name.trim()) {
    return reply(
      ctx,
      "❌ Name is required. Use `wishlist add n:spider-man` " +
      "(s: and a: are optional)."
    );
  }

  if (
    filters.season !== null &&
    ![0, 1].includes(filters.season)
  ) {
    return reply(ctx, "❌ Season must be 0 or 1.");
  }

  const col = await wishlistCollection();

  // Prevent simultaneous first additions creating two user documents.
  await col.createIndex({ userId: 1 }, { unique: true });

  let matches = findCards(filters);

  if (sub === "remove") {
    const doc = await col.findOne({ userId: ctx.user.id });

    const keys = new Set(
      (Array.isArray(doc?.cards) ? doc.cards : []).map(key)
    );

    matches = matches.filter(c =>
      keys.has(key({ cardId: c.id, season: c.season }))
    );
  }

  if (!matches.length) {
    return reply(
      ctx,
      "❌ No matching cards found. Check n:, s:, and a:."
    );
  }

  if (matches.length === 1) {
    return reply(
      ctx,
      await changeWishlist(col, ctx.user.id, sub, matches[0])
    );
  }

  let page = 0;
  let busy = false;
  const pages = Math.ceil(matches.length / 25);

  function selectionPayload() {
    const options = matches
      .slice(page * 25, (page + 1) * 25)
      .map((card, offset) => ({
        label:
          `${card.name} • S${card.season} • #${card.id}`
            .slice(0, 100),
        description:
          `${rarity(card)} • ${appearance(card)}`
            .slice(0, 100),
        value: String(page * 25 + offset),
        emoji: seasonEmoji(card.season)
      }));

    return {
      content: null,
      embeds: [
        new EmbedBuilder()
          .setColor(0xffc107)
          .setTitle("🔎 Choose the exact card")
          .setDescription(
            `${SEASON_EMOJIS[0]} Season 0 • ` +
            `${SEASON_EMOJIS[1]} Season 1\n` +
            "🎃 Halloween cards are in Season 1.\n" +
            `Found **${matches.length}** matches. ` +
            "All are available through the pages."
          )
          .setFooter({
            text:
              `Page ${page + 1}/${pages} • ` +
              "Selection expires in 2 minutes"
          })
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("wish_pick")
            .setPlaceholder("Choose a card")
            .addOptions(options)
        ),
        new ActionRowBuilder().addComponents(
          button("pick_prev", "Previous", page === 0),
          button("pick_next", "Next", page === pages - 1)
        )
      ]
    };
  }

  const msg = await reply(ctx, selectionPayload());

  const collector = msg.createMessageComponentCollector({
    time: 120000
  });

  collector.on("collect", async i => {
    if (i.user.id !== ctx.user.id) {
      return i.reply({
        content: "❌ This selection isn't for you.",
        ephemeral: true
      });
    }

    let acquired = false;

    try {
      await i.deferUpdate();

      if (busy) return;
      busy = true;
      acquired = true;

      if (
        i.customId === "pick_prev" ||
        i.customId === "pick_next"
      ) {
        page = Math.max(
          0,
          Math.min(
            pages - 1,
            page + (i.customId === "pick_next" ? 1 : -1)
          )
        );

        await i.editReply(selectionPayload());
      } else if (i.customId === "wish_pick") {
        const card = matches[Number(i.values[0])];

        if (!card) {
          throw new Error("Invalid card selection");
        }

        const text = await changeWishlist(
          col,
          ctx.user.id,
          sub,
          card
        );

        await i.editReply({
          content: text,
          embeds: [],
          components: []
        });

        collector.stop("selected");
      }
    } catch (error) {
      await componentError(i, error);
    } finally {
      if (acquired) busy = false;
    }
  });

  expire(msg, collector);
}

async function runSlash(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const ctx = {
    interaction,
    user: interaction.user
  };

  try {
    const sub = interaction.options.getSubcommand(false) || "view";

    if (sub === "view") {
      return await showWishlist(
        ctx,
        interaction.options.getUser("user") || interaction.user
      );
    }

    const s = interaction.options.getString("s");

    return await addOrRemove(ctx, sub, {
      name: interaction.options.getString("n") || "",
      season: s === null ? null : Number(s),
      appearance: interaction.options.getString("a") || ""
    });
  } catch (error) {
    console.error("[WISHLIST] Slash error:", error);

    return reply(
      ctx,
      "❌ Wishlist could not be processed. Please try again."
    );
  }
}

async function execute(message, args = []) {
  if (
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand()
  ) {
    return runSlash(message);
  }

  const ctx = {
    message,
    user: message.author
  };

  try {
    const sub = args[0]?.toLowerCase();

    if (["add", "remove"].includes(sub)) {
      return await addOrRemove(
        ctx,
        sub,
        parseFilters(args.slice(1))
      );
    }

    const target = message.mentions?.users?.find(
      u => u.id !== message.client.user.id
    );

    if (!sub || sub === "view" || target) {
      return await showWishlist(ctx, target || message.author);
    }

    return reply(
      ctx,
      "Use `wishlist`, `wishlist @user`, or " +
      "`wishlist add/remove n:spider-man s:0 " +
      "a:spider-man (2002)`. Only n: is required."
    );
  } catch (error) {
    console.error("[WISHLIST] Prefix error:", error);

    return reply(
      ctx,
      "❌ Wishlist could not be processed. Please try again."
    );
  }
}

function filterOptions(sub) {
  return sub
    .addStringOption(o =>
      o.setName("n")
        .setDescription("Card or character name (required)")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("s")
        .setDescription("Optional season filter")
        .addChoices(
          { name: "Season 0", value: "0" },
          { name: "Season 1", value: "1" }
        )
    )
    .addStringOption(o =>
      o.setName("a")
        .setDescription(
          "Optional appearance, series, or Halloween 2026"
        )
    );
}

module.exports = {
  name: "wishlist",
  aliases: ["wish"],

  data: new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription(
      "View or manage your wishlist (15 cards maximum)"
    )
    .addSubcommand(s =>
      s.setName("view")
        .setDescription("View a user's wishlist")
        .addUserOption(o =>
          o.setName("user")
            .setDescription("Optional user")
        )
    )
    .addSubcommand(s =>
      filterOptions(
        s.setName("add")
          .setDescription("Add a card to your wishlist")
      )
    )
    .addSubcommand(s =>
      filterOptions(
        s.setName("remove")
          .setDescription("Remove a card from your wishlist")
      )
    ),

  execute,
  executeSlash: runSlash,
  slashExecute: runSlash,
  slash: runSlash,
  run: execute
};