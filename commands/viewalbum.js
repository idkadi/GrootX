const fs = require("fs");
const path = require("path");

const {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
 ButtonStyle
} = require("discord.js");

const {
  createCanvas,
  loadImage
} = require("canvas");

const connectDB = require("../database");

const slotsPath =
  path.join(
    __dirname,
    "../data/layouts/slots.json"
  );

const backgroundsPath =
  path.join(
    __dirname,
    "../images/backgrounds"
  );

const imagesPath =
  path.join(
    __dirname,
    "../images"
  );

const cardsData =
  require("../data/cards.js");

const backgrounds =
  require("../data/backgrounds.js");

function loadJSON(filePath) {

  if (!fs.existsSync(filePath))
    return {};

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

}

function getCardsArray() {

  if (Array.isArray(cardsData))
    return cardsData;

  if (Array.isArray(cardsData.cards))
    return cardsData.cards;

  return [];

}

function makeButtons() {

  return new ActionRowBuilder()
    .addComponents(

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

    backgrounds.find(
      bg =>
        Number(bg.id) === savedBgId
    ) ||

    backgrounds.find(
      bg =>
        Number(bg.id) === 0
    )

  );

}

async function generateAlbumPage(
  album,
  page,
  pageNumber
) {

  const slotsData =
    loadJSON(slotsPath);

  const allCards =
    getCardsArray();

  const layoutId =
    String(page.layout);

  const slotPositions =
    slotsData[layoutId];

  if (!slotPositions) {

    throw new Error(
      "Slot positions not found."
    );

  }

  const bgData =
    getBackgroundData(page);

  if (!bgData) {

    throw new Error(
      "Background data not found."
    );

  }

  const bgPath =
    path.join(
      backgroundsPath,
      bgData.file
    );

  if (!fs.existsSync(bgPath)) {

    throw new Error(
      `Background image not found: ${bgData.file}`
    );

  }

  const canvas =
    createCanvas(1600, 900);

  const ctx =
    canvas.getContext("2d");

  const bg =
    await loadImage(bgPath);

  ctx.drawImage(
    bg,
    0,
    0,
    1600,
    900
  );

  const placedCards =
    page.slots || [];

  for (
    let i = 0;
    i < slotPositions.length;
    i++
  ) {

    const placed =
      placedCards[i];

    if (!placed)
      continue;

    const cardInfo =
      allCards.find(

        c =>
          Number(c.id) ===
          Number(placed.cardId)

      );

    if (!cardInfo)
      continue;

    const cardPath =
      path.join(
        imagesPath,
        cardInfo.image
      );

    if (!fs.existsSync(cardPath))
      continue;

    const slot =
      slotPositions[i];

    try {

      const cardImage =
        await loadImage(cardPath);

      ctx.drawImage(

        cardImage,

        slot.x,
        slot.y,

        slot.width,
        slot.height

      );

    }

    catch {}

  }

  const fileName =

    `album-page-${Date.now()}.png`;

  const buffer =
    canvas.toBuffer("image/png");

  const file =
    new AttachmentBuilder(
      buffer,
      {
        name: fileName
      }
    );

  const embed =
    new EmbedBuilder()

      .setColor(0x00aeff)

      .setTitle(
        `📖 ${album.name}`
      )

      .setDescription(

        `Page: **${pageNumber}/${album.pages.length}**\n` +

        `Layout: **${layoutId}**\n` +

        `Background: **${bgData.name}**\n` +

        `Cards placed: **${placedCards.filter(Boolean).length}/${slotPositions.length}**`

      )

      .setImage(
        `attachment://${fileName}`
      );

  return {
    embed,
    file
  };

}

module.exports = {

  name: "viewalbum",
  aliases: ["va", "albumview"],

  async execute(message, args) {

    const albumName =
      args.join(" ");

    if (!albumName) {

      return message.reply(

        "❌ Use: `!viewalbum <album name>`"

      );

    }

    const db =
      await connectDB();

    const albumsCol =
      db.collection("albums");

    const userId =
      message.author.id;

    let album =
      await albumsCol.findOne({

        userId,

        name: {
          $regex:
            `^${albumName}$`,
          $options: "i"
        }

      });

    if (!album) {

      return message.reply(
        "❌ Album not found."
      );

    }

    if (
      !album.pages ||
      album.pages.length === 0
    ) {

      return message.reply(
        "❌ This album has no pages."
      );

    }

    let pageIndex = 0;

    let page =
      album.pages[pageIndex];

    if (!page.layout) {

      return message.reply(
        "❌ Page 1 has no layout."
      );

    }

    let generated;

    try {

      generated =
        await generateAlbumPage(

          album,
          page,
          pageIndex + 1

        );

    }

    catch (err) {

      return message.reply(
        `❌ ${err.message}`
      );

    }

    const msg =
      await message.reply({

        embeds: [
          generated.embed
        ],

        files: [
          generated.file
        ],

        components: [
          makeButtons()
        ]

      });

    const collector =
      msg.createMessageComponentCollector({
        time: 120000
      });

    collector.on(
      "collect",

      async interaction => {

        if (
          interaction.user.id !==
          message.author.id
        ) {

          return interaction.reply({

            content:
              "❌ This album viewer is not for you.",

            ephemeral: true

          });

        }

        const freshAlbum =
          await albumsCol.findOne({

            userId,

            name: {
              $regex:
                `^${albumName}$`,
              $options: "i"
            }

          });

        if (!freshAlbum) {

          return interaction.reply({

            content:
              "❌ Album not found anymore.",

            ephemeral: true

          });

        }

        if (
          interaction.customId ===
          "album_prev"
        ) {

          pageIndex--;

          if (pageIndex < 0) {

            pageIndex =
              freshAlbum.pages.length - 1;

          }

        }

        if (
          interaction.customId ===
          "album_next"
        ) {

          pageIndex++;

          if (
            pageIndex >=
            freshAlbum.pages.length
          ) {

            pageIndex = 0;

          }

        }

        const currentPage =
          freshAlbum.pages[pageIndex];

        if (!currentPage.layout) {

          return interaction.reply({

            content:

              `❌ Page ${pageIndex + 1} has no layout.`,

            ephemeral: true

          });

        }

        let generatedPage;

        try {

          generatedPage =
            await generateAlbumPage(

              freshAlbum,

              currentPage,

              pageIndex + 1

            );

        }

        catch (err) {

          return interaction.reply({

            content:
              `❌ ${err.message}`,

            ephemeral: true

          });

        }

        return interaction.update({

          embeds: [
            generatedPage.embed
          ],

          files: [
            generatedPage.file
          ],

          components: [
            makeButtons()
          ]

        });

      }

    );

    collector.on(
      "end",

      async () => {

        await msg.edit({

          components: []

        }).catch(() => {});

      }

    );

  }

};