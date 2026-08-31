const {
  createCanvas,
  loadImage
} = require("canvas");

const renderCard =
  require("./renderCard");

const SEASON = 1;

async function createHandImage(
  hand = []
) {
  const cardW = 140;
  const cardH = 200;
  const gap = 15;

  const width =
    hand.length * cardW +
    Math.max(
      0,
      hand.length - 1
    ) * gap +
    50;

  const height = 290;

  const canvas =
    createCanvas(
      Math.max(width, 500),
      height
    );

  const ctx =
    canvas.getContext("2d");

  // ==========================================
  // BACKGROUND
  // ==========================================

  const bg =
    ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      height
    );

  bg.addColorStop(
    0,
    "#170a32"
  );

  bg.addColorStop(
    0.5,
    "#231246"
  );

  bg.addColorStop(
    1,
    "#070812"
  );

  ctx.fillStyle = bg;

  ctx.fillRect(
    0,
    0,
    canvas.width,
    height
  );

  // ==========================================
  // TITLE
  // ==========================================

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "bold 30px BattleFont";

  ctx.textAlign =
    "center";

  ctx.fillText(
    "YOUR HAND • S1",
    canvas.width / 2,
    35
  );

  // ==========================================
  // CARDS
  // ==========================================

  for (
    let i = 0;
    i < hand.length;
    i++
  ) {
    const item =
      hand[i];

    if (!item?.card) {
      continue;
    }

    const x =
      25 +
      i * (
        cardW +
        gap
      );

    const y = 55;

    try {
      /*
       * Battle hand is Season 1.
       *
       * renderCard handles:
       *
       * rawImage
       * +
       * S1 default tier frame
       * +
       * card name
       * +
       * appearance
       */

      const cardBuffer =
        await renderCard(
          {
            ...item.card,

            season:
              SEASON
          },

          item.serial ??
          "?",

          {
            ...item,

            season:
              SEASON
          }
        );

      const img =
        await loadImage(
          cardBuffer
        );

      // ======================================
      // S1 CARD IMAGE
      // ======================================

      ctx.drawImage(
        img,
        x,
        y,
        cardW,
        cardH
      );

      // ======================================
      // SERIAL / SLOT BAR
      // ======================================

      ctx.fillStyle =
        "rgba(0,0,0,0.80)";

      ctx.fillRect(
        x,
        y +
          cardH -
          30,
        cardW,
        30
      );

      // Slot number

      ctx.fillStyle =
        "#ffd166";

      ctx.font =
        "bold 16px BattleFont";

      ctx.textAlign =
        "left";

      ctx.fillText(
        `${i + 1}`,
        x + 8,
        y +
          cardH -
          10
      );

      // Serial

      ctx.fillStyle =
        "#ffffff";

      ctx.fillText(
        `#${item.serial ?? "?"}`,
        x + 30,
        y +
          cardH -
          10
      );

      // ======================================
      // ENERGY COST
      // ======================================

      let cost = 1;

      const tier =
        String(
          item.card.tier ||
          ""
        ).toLowerCase();

      if (
        tier === "epic"
      ) {
        cost = 2;
      }

      if (
        tier === "legendary"
      ) {
        cost = 3;
      }

      ctx.beginPath();

      ctx.arc(
        x + 18,
        y + 18,
        16,
        0,
        Math.PI * 2
      );

      ctx.fillStyle =
        "#2b6fff";

      ctx.fill();

      ctx.fillStyle =
        "#ffffff";

      ctx.font =
        "bold 18px BattleFont";

      ctx.textAlign =
        "center";

      ctx.fillText(
        String(cost),
        x + 18,
        y + 24
      );

    } catch (error) {
      console.error(
        `Failed to render hand card ${
          item?.card?.id ??
          "unknown"
        }:`,
        error
      );

      continue;
    }
  }

  return canvas.toBuffer(
    "image/png"
  );
}

module.exports =
  createHandImage;