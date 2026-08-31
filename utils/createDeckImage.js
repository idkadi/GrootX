const { createCanvas, loadImage } = require("canvas");

const renderCard = require("../utils/renderCard");

const SEASON = 1;

async function createDeckImage(deckCards) {
  const cols = 4;
  const rows = 3;
  const spacing = 12;

  const cardWidth = 130;
  const cardHeight = 185;

  const width =
    cols * cardWidth +
    spacing * (cols + 1);

  const height =
    rows * cardHeight +
    spacing * (rows + 1);

  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle = "#14151a";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  for (let i = 0; i < 12; i++) {
    const row =
      Math.floor(i / cols);

    const col =
      i % cols;

    const x =
      spacing +
      col * (
        cardWidth +
        spacing
      );

    const y =
      spacing +
      row * (
        cardHeight +
        spacing
      );

    const item =
      deckCards[i];

    if (!item) {
      drawEmptySlot(
        ctx,
        x,
        y,
        cardWidth,
        cardHeight
      );

      continue;
    }

    try {
      const cardInfo =
        item.card;

      const ownedCard =
        item.ownedCard ||
        item.collectionCard ||
        item;

      const serial =
        ownedCard.serial ||
        item.serial ||
        "000000";

      // ======================================
      // SEASON 1 DECK CARD
      // ======================================

      /*
       * Decks use Season 1 cards only.
       *
       * Since these are OWNED cards,
       * ownedCard is passed to renderCard.
       *
       * This means:
       *
       * No custom frame:
       * S1 rawImage
       * + default tier frame
       *
       * Custom frame equipped:
       * S1 rawImage
       * + user's frameId
       */

      const buffer =
        await renderCard(
          {
            ...cardInfo,
            season: SEASON
          },

          serial,

          {
            ...ownedCard,
            season: SEASON
          }
        );

      const renderedCard =
        await loadImage(
          buffer
        );

      ctx.drawImage(
        renderedCard,
        x,
        y,
        cardWidth,
        cardHeight
      );

    } catch (err) {
      console.error(
        "Deck image render error:",
        err
      );

      drawEmptySlot(
        ctx,
        x,
        y,
        cardWidth,
        cardHeight
      );
    }
  }

  return canvas.toBuffer(
    "image/png"
  );
}

function drawEmptySlot(
  ctx,
  x,
  y,
  cardWidth,
  cardHeight
) {
  ctx.fillStyle =
    "#24262d";

  ctx.fillRect(
    x,
    y,
    cardWidth,
    cardHeight
  );

  ctx.strokeStyle =
    "#555";

  ctx.lineWidth = 2;

  ctx.strokeRect(
    x,
    y,
    cardWidth,
    cardHeight
  );

  ctx.fillStyle =
    "#888";

  ctx.font =
    "bold 28px sans-serif";

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    "+",
    x + cardWidth / 2,
    y + cardHeight / 2
  );
}

module.exports =
  createDeckImage;