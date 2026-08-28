const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const path = require("path");
const frames = require("../data/frames");

registerFont(
  path.join(
    __dirname,
    "..",
    "fonts",
    "Oswald-Bold.ttf"
  ),
  {
    family: "Oswald"
  }
);

async function renderCard(
  card,
  serial = "000000",
  ownedCard = null
) {
  const season = Number(
    ownedCard?.season ?? card.season ?? 0
  );

  // =====================================================
  // SEASON 0 — ORIGINAL CARD FORMAT
  // =====================================================

  if (season === 0) {
    const W = 1054;
    const H = 1492;

    const tierColors = {
      common: "#CD7F32",
      uncommon: "#C0C0C0",
      rare: "#FFD700",
      epic: "#8000FF",
      legendary: "#E53935"
    };

    const tier = String(
      card.tier || "common"
    ).toLowerCase();

    const tierColor =
      tierColors[tier] || tierColors.common;

    if (!card.image) {
      throw new Error(
        `Season 0 card ${card.id} is missing image.`
      );
    }

    const oldImagePath = path.join(
      __dirname,
      "..",
      "images",
      card.image
    );

    const oldImage = await loadImage(oldImagePath);

    const oldCanvas = createCanvas(W, H);
    const oldCtx = oldCanvas.getContext("2d");

    // ===================================================
    // TIER-COLOURED OUTER BORDER
    // ===================================================

    oldCtx.fillStyle = tierColor;
    oldCtx.fillRect(0, 0, W, H);

    const innerX = 36;
    const innerY = 36;
    const innerW = 982;
    const innerH = 1420;
    const radius = 18;

    // ===================================================
    // ROUNDED INNER CARD
    // ===================================================

    oldCtx.save();
    oldCtx.beginPath();

    oldCtx.moveTo(
      innerX + radius,
      innerY
    );

    oldCtx.lineTo(
      innerX + innerW - radius,
      innerY
    );

    oldCtx.quadraticCurveTo(
      innerX + innerW,
      innerY,
      innerX + innerW,
      innerY + radius
    );

    oldCtx.lineTo(
      innerX + innerW,
      innerY + innerH - radius
    );

    oldCtx.quadraticCurveTo(
      innerX + innerW,
      innerY + innerH,
      innerX + innerW - radius,
      innerY + innerH
    );

    oldCtx.lineTo(
      innerX + radius,
      innerY + innerH
    );

    oldCtx.quadraticCurveTo(
      innerX,
      innerY + innerH,
      innerX,
      innerY + innerH - radius
    );

    oldCtx.lineTo(
      innerX,
      innerY + radius
    );

    oldCtx.quadraticCurveTo(
      innerX,
      innerY,
      innerX + radius,
      innerY
    );

    oldCtx.closePath();
    oldCtx.clip();

    // ===================================================
    // DRAW ORIGINAL CARD IMAGE
    // ===================================================

    const imageScale = Math.max(
      innerW / oldImage.width,
      innerH / oldImage.height
    );

    const imageW =
      oldImage.width * imageScale;

    const imageH =
      oldImage.height * imageScale;

    const imageX =
      innerX + (innerW - imageW) / 2;

    const imageY =
      innerY + (innerH - imageH) / 2;

    oldCtx.drawImage(
      oldImage,
      imageX,
      imageY,
      imageW,
      imageH
    );

    // ===================================================
    // TRANSLUCENT LOWER INFORMATION PANEL
    // ===================================================

    oldCtx.globalAlpha = 0.88;
    oldCtx.fillStyle = tierColor;

    oldCtx.fillRect(
      innerX,
      1210,
      innerW,
      246
    );

    oldCtx.globalAlpha = 1;
    oldCtx.restore();

    // ===================================================
    // SEASON 0 TEXT
    // ===================================================

    oldCtx.save();

    oldCtx.fillStyle = "#FFFFFF";
    oldCtx.textAlign = "left";
    oldCtx.textBaseline = "alphabetic";

    // Serial number
    oldCtx.font = "700 40px Oswald";

    oldCtx.fillText(
      `#${serial ?? "?"}`,
      70,
      1285
    );

    // Character name
    const oldCardName = String(
      card.name || "UNKNOWN"
    ).toUpperCase();

    let oldNameSize = 66;

    do {
      oldCtx.font =
        `700 ${oldNameSize}px Oswald`;

      if (
        oldCtx.measureText(oldCardName).width <= 900
      ) {
        break;
      }

      oldNameSize -= 2;
    } while (oldNameSize > 42);

    oldCtx.fillText(
      oldCardName,
      70,
      1368
    );

    // Movie / appearance
    const oldAppearance = String(
      card.appearance || card.show || ""
    ).toUpperCase();

    let oldAppearanceSize = 40;

    do {
      oldCtx.font =
        `700 ${oldAppearanceSize}px Oswald`;

      if (
        oldCtx.measureText(oldAppearance).width <= 900
      ) {
        break;
      }

      oldAppearanceSize -= 1;
    } while (oldAppearanceSize > 26);

    oldCtx.fillText(
      oldAppearance,
      70,
      1428
    );

    oldCtx.restore();

    return oldCanvas.toBuffer("image/png");
  }

  // =====================================================
  // SEASON 1 — NEW FRAME FORMAT
  // =====================================================

  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // =====================================================
  // LOAD RAW IMAGE
  // =====================================================

  if (!card.rawImage) {
    throw new Error(
      `Season 1 card ${card.id} is missing rawImage.`
    );
  }

  const imagePath = path.join(
    __dirname,
    "..",
    "images",
    card.rawImage
  );

  const img = await loadImage(imagePath);

  const scale = Math.max(
    W / img.width,
    H / img.height
  );

  const drawW = img.width * scale;
  const drawH = img.height * scale;

  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;

  ctx.drawImage(
    img,
    drawX,
    drawY,
    drawW,
    drawH
  );

  // =====================================================
  // CHOOSE SEASON 1 FRAME
  // =====================================================

  let framePath;

  if (ownedCard?.frameId) {
    const frameData = frames.find(
      frame =>
        Number(frame.id) ===
        Number(ownedCard.frameId)
    );

    if (frameData) {
      framePath = path.join(
        __dirname,
        "..",
        frameData.image
      );
    }
  }

  if (!framePath) {
    const tier = String(
      card.tier || "common"
    ).toLowerCase();

    framePath = path.join(
      __dirname,
      "..",
      "images",
      "default",
      `${tier}.png`
    );
  }

  const frameImg = await loadImage(framePath);

  ctx.drawImage(
    frameImg,
    0,
    0,
    W,
    H
  );

  // =====================================================
  // SEASON 1 CHARACTER NAME
  // =====================================================

  const cardName = String(
    card.name || "UNKNOWN"
  ).toUpperCase();

  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const nameX = W / 2;
  const nameY = 1175;
  const nameMaxWidth = 780;

  let nameFontSize = 72;

  do {
    ctx.font =
      `700 ${nameFontSize}px Oswald`;

    if (
      ctx.measureText(cardName).width <=
      nameMaxWidth
    ) {
      break;
    }

    nameFontSize -= 2;
  } while (nameFontSize > 42);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 6;

  ctx.strokeText(
    cardName,
    nameX,
    nameY
  );

  ctx.fillStyle = "#FFFFFF";

  ctx.fillText(
    cardName,
    nameX,
    nameY
  );

  ctx.restore();

  // =====================================================
  // SEASON 1 MOVIE / APPEARANCE
  // =====================================================

  const appearance = String(
    card.appearance || ""
  ).toUpperCase();

  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const appearanceX = W / 2;
  const appearanceY = 1255;
  const appearanceMaxWidth = 760;

  let appearanceFontSize = 38;

  do {
    ctx.font =
      `700 ${appearanceFontSize}px Oswald`;

    if (
      ctx.measureText(appearance).width <=
      appearanceMaxWidth
    ) {
      break;
    }

    appearanceFontSize -= 1;
  } while (appearanceFontSize > 25);

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;

  ctx.strokeText(
    appearance,
    appearanceX,
    appearanceY
  );

  ctx.fillStyle = "#FFFFFF";

  ctx.fillText(
    appearance,
    appearanceX,
    appearanceY
  );

  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;