const fs = require("fs");
const path = require("path");

const {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const { createCanvas, loadImage } = require("canvas");
const connectDB = require("../database");
const renderCard = require("../utils/renderCard");
const backgrounds = require("../data/backgrounds.js");

const slotsPath = path.join(
  __dirname,
  "../data/layouts/slots.json"
);

const backgroundsPath = path.join(
  __dirname,
  "../images/backgrounds"
);

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function asCards(data) {
  return Array.isArray(data)
    ? data
    : data.cards || [];
}

const eventKey = value =>
  String(value || "").trim().toLowerCase();

function seasonOf(record) {
  const value = String(
    record.season ?? record.cardSeason ?? 0
  ).trim().toLowerCase();

  if (!/^(?:s)?\d+$/.test(value)) {
    throw new Error("Invalid card season.");
  }

  const season = Number(value.replace(/^s/, ""));

  if (!Number.isSafeInteger(season)) {
    throw new Error("Invalid card season.");
  }

  return season;
}

function catalogFor(season) {
  // S0: cards.js
  // S1: season1.js
  // S2: season2.js, and so on.
  const file = path.join(
    __dirname,
    "../data",
    season === 0 ? "cards.js" : `season${season}.js`
  );

  if (!fs.existsSync(file)) {
    throw new Error(
      `Season ${season} catalog is unavailable.`
    );
  }

  const cards = asCards(require(file));

  if (!Array.isArray(cards)) {
    throw new Error(
      `Season ${season} catalog has an invalid format.`
    );
  }

  return cards;
}

async function resolveCard(
  db,
  userId,
  placed,
  getLegacyCopies
) {
  const code = typeof placed === "string"
    ? placed
    : placed.code ?? placed.cardCode;

  let owned;

  if (code != null) {
    owned = await db.collection("collections").findOne({
      userId,
      code: String(code).trim().toLowerCase()
    });

    if (!owned) {
      throw new Error(
        "Placed card is no longer in your collection."
      );
    }
  } else {
    // Recover old slots only when the owned copy is unambiguous.
    const copies = await getLegacyCopies();

    const matches = copies.filter(card => {
      if (
        card.cardId == null ||
        placed.cardId == null ||
        String(card.cardId) !== String(placed.cardId)
      ) {
        return false;
      }

      if (
        placed.season != null ||
        placed.cardSeason != null
      ) {
        try {
          if (seasonOf(card) !== seasonOf(placed)) {
            return false;
          }
        } catch {
          return false;
        }
      }

      return (
        placed.event == null ||
        eventKey(card.event) === eventKey(placed.event)
      );
    });

    if (matches.length !== 1) {
      throw new Error(
        "Re-place this card using its code; " +
        "the old slot cannot identify its exact copy."
      );
    }

    owned = matches[0];
  }

  const season = seasonOf(owned);

  const candidates = catalogFor(season).filter(card =>
    card.id != null &&
    owned.cardId != null &&
    String(card.id) === String(owned.cardId)
  );

  const matches = candidates.filter(card =>
    eventKey(card.event) === eventKey(owned.event)
  );

  let card = matches.length === 1
    ? matches[0]
    : null;

  // Older event records may lack an event flag.
  if (
    !card &&
    !owned.event &&
    candidates.length === 1
  ) {
    card = candidates[0];
  }

  if (!card) {
    throw new Error(
      "Card catalog entry is missing or ambiguous."
    );
  }

  const event = owned.event || card.event || null;

  return {
    card: {
      ...card,
      season,
      event
    },
    owned: {
      ...owned,
      season,
      event
    }
  };
}

function makeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("album_prev")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("album_next")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
  );
}

function getBackgroundData(page) {
  const savedBgId =
    page.background !== undefined &&
    page.background !== null
      ? Number(page.background)
      : 0;

  return (
    backgrounds.find(bg =>
      Number(bg.id) === savedBgId
    ) ||
    backgrounds.find(bg =>
      Number(bg.id) === 0
    )
  );
}

async function generateAlbumPage(
  db,
  album,
  page,
  pageNumber
) {
  const slotsData = loadJSON(slotsPath);
  const warnings = [];
  const renderedCopies = new Map();

  let legacyCopies;
  let renderedCount = 0;

  // Query the full collection only if a legacy slot requires it.
  const getLegacyCopies = () =>
    legacyCopies ||= db
      .collection("collections")
      .find({ userId: album.userId })
      .toArray();

  const slotPositions =
    slotsData[String(page.layout)];

  if (!Array.isArray(slotPositions)) {
    throw new Error("Slot positions not found.");
  }

  const bgData = getBackgroundData(page);

  if (!bgData) {
    throw new Error("Background data not found.");
  }

  const bgPath = path.join(
    backgroundsPath,
    bgData.file
  );

  if (!fs.existsSync(bgPath)) {
    throw new Error(
      `Background image not found: ${bgData.file}`
    );
  }

  const canvas = createCanvas(1600, 900);
  const ctx = canvas.getContext("2d");

  const bg = await loadImage(bgPath);
  ctx.drawImage(bg, 0, 0, 1600, 900);

  const placedCards = page.slots || [];

  for (let i = 0; i < slotPositions.length; i++) {
    const placed = placedCards[i];

    if (!placed) continue;

    const slot = slotPositions[i];

    try {
      const { card, owned } = await resolveCard(
        db,
        album.userId,
        placed,
        getLegacyCopies
      );

      // Always pass the live owned record.
      // renderCard chooses its equipped/event/default frame.
      const identity = String(owned.code);

      let cardImage = renderedCopies.get(identity);

      if (!cardImage) {
        const buffer = await renderCard(
          card,
          owned.serial ?? "?",
          owned
        );

        cardImage = await loadImage(buffer);
        renderedCopies.set(identity, cardImage);
      }

      ctx.drawImage(
        cardImage,
        slot.x,
        slot.y,
        slot.width,
        slot.height
      );

      renderedCount++;
    } catch (error) {
      console.error(
        `[viewalbum] Slot ${i + 1}:`,
        error
      );

      warnings.push(
        `Slot ${i + 1}: ${error.message}`
      );
    }
  }

  const fileName = `album-page-${Date.now()}.png`;

  const file = new AttachmentBuilder(
    canvas.toBuffer("image/png"),
    { name: fileName }
  );

  const embed = new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle(`📖 ${album.name}`.slice(0, 256))
    .setDescription(
      `📄 Page **${pageNumber}/${album.pages.length}**` +
      ` • ⭐ ${renderedCount}/${slotPositions.length} Cards`
    )
    .setImage(`attachment://${fileName}`);

  if (warnings.length) {
    embed.addFields({
      name: "⚠️ Cards needing attention",
      value: warnings.join("\n").slice(0, 1024)
    });
  }

  return { embed, file };
}

module.exports = {
  name: "viewalbum",
  aliases: ["va", "albumview"],

  data: new SlashCommandBuilder()
    .setName("viewalbum")
    .setDescription(
      "View an album with equipped card frames."
    )
    .addStringOption(option =>
      option
        .setName("album")
        .setDescription("Album name")
        .setRequired(true)
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;

    if (
      slash &&
      !message.deferred &&
      !message.replied
    ) {
      await message.deferReply();
    }

    const reply = payload =>
      slash
        ? message.editReply(payload)
        : message.reply(payload);

    const albumName = (
      slash
        ? message.options.getString("album", true)
        : args.join(" ")
    ).trim();

    if (!albumName) {
      return reply(
        "❌ Use: `!viewalbum <album name>`"
      );
    }

    try {
      const db = await connectDB();
      const albumsCol = db.collection("albums");
      const userId = user.id;

      const escapedName = albumName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const album = await albumsCol.findOne({
        userId,
        name: {
          $regex: `^${escapedName}$`,
          $options: "i"
        }
      });

      if (!album) {
        return reply("❌ Album not found.");
      }

      if (!album.pages?.length) {
        return reply("❌ This album has no pages.");
      }

      let pageIndex = 0;
      const page = album.pages[pageIndex];

      if (page.layout == null) {
        return reply("❌ Page 1 has no layout.");
      }

      let generated;

      try {
        generated = await generateAlbumPage(
          db,
          album,
          page,
          pageIndex + 1
        );
      } catch (error) {
        return reply(`❌ ${error.message}`);
      }

      const msg = await reply({
        embeds: [generated.embed],
        files: [generated.file],
        components: [makeButtons()]
      });

      const collector =
        msg.createMessageComponentCollector({
          time: 120000
        });

      let rendering = false;

      collector.on("collect", async interaction => {
        if (
          !["album_prev", "album_next"].includes(
            interaction.customId
          )
        ) {
          return;
        }

        if (interaction.user.id !== user.id) {
          return interaction.reply({
            content:
              "❌ This album viewer is not for you.",
            ephemeral: true
          });
        }

        try {
          await interaction.deferUpdate();
        } catch (error) {
          console.error(
            "[viewalbum] Button acknowledgement:",
            error
          );
          return;
        }

        if (rendering || collector.ended) return;
        rendering = true;

        try {
          // Follow the album's identity even if it is renamed.
          const freshAlbum = await albumsCol.findOne({
            _id: album._id,
            userId
          });

          if (!freshAlbum?.pages?.length) {
            return await msg.edit({
              content: "❌ Album not found anymore.",
              embeds: [],
              attachments: [],
              files: [],
              components: []
            });
          }

          if (interaction.customId === "album_prev") {
            pageIndex--;

            if (pageIndex < 0) {
              pageIndex = freshAlbum.pages.length - 1;
            }
          }

          if (interaction.customId === "album_next") {
            pageIndex++;

            if (pageIndex >= freshAlbum.pages.length) {
              pageIndex = 0;
            }
          }

          pageIndex = (
            (pageIndex % freshAlbum.pages.length) +
            freshAlbum.pages.length
          ) % freshAlbum.pages.length;

          const currentPage =
            freshAlbum.pages[pageIndex];

          if (currentPage.layout == null) {
            return await msg.edit({
              content:
                `❌ Page ${pageIndex + 1} has no layout.`,
              embeds: [],
              attachments: [],
              files: [],
              components: []
            });
          }

          let generatedPage;

          try {
            generatedPage = await generateAlbumPage(
              db,
              freshAlbum,
              currentPage,
              pageIndex + 1
            );
          } catch (error) {
            return await msg.edit({
              content: `❌ ${error.message}`,
              embeds: [],
              attachments: [],
              files: [],
              components: []
            });
          }

          return await msg.edit({
            content: null,
            embeds: [generatedPage.embed],
            attachments: [],
            files: [generatedPage.file],
            components: [makeButtons()]
          });
        } catch (error) {
          console.error(
            "[viewalbum] Page update failed:",
            error
          );

          await interaction.followUp({
            content:
              "❌ Could not load this page. Please try again.",
            ephemeral: true
          }).catch(() => {});
        } finally {
          rendering = false;
        }
      });

      collector.on("end", async () => {
        await msg.edit({
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      console.error("[viewalbum]", error);

      await reply({
        content:
          "❌ Could not load your album. Please try again.",
        embeds: [],
        components: []
      }).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;