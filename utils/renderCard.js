const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const path = require("path");
const frames = require("../data/frames");

registerFont(
  path.join(__dirname, "..", "fonts", "Oswald-Bold.ttf"),
  { family: "Oswald" }
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
  // SEASON 0 — RAW IMAGE + OLD COLOURED FORMAT
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

    if (!card.rawImage) {
      throw new Error(
        `Season 0 card ${card.id} is missing rawImage.`
      );
    }

    const imagePath = path.join(
      __dirname,
      "..",
      "images",
      card.rawImage
    );

    const rawImage = await loadImage(imagePath);

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Tier-coloured outer border
    ctx.fillStyle = tierColor;
    ctx.fillRect(0, 0, W, H);

    const innerX = 36;
    const innerY = 36;
    const innerW = 982;
    const innerH = 1420;
    const radius = 18;

    // Rounded inner card clipping
    ctx.save();
    ctx.beginPath();

    ctx.moveTo(
      innerX + radius,
      innerY
    );

    ctx.lineTo(
      innerX + innerW - radius,
      innerY
    );

    ctx.quadraticCurveTo(
      innerX + innerW,
      innerY,
      innerX + innerW,
      innerY + radius
    );

    ctx.lineTo(
      innerX + innerW,
      innerY + innerH - radius
    );

    ctx.quadraticCurveTo(
      innerX + innerW,
      innerY + innerH,
      innerX + innerW - radius,
      innerY + innerH
    );

    ctx.lineTo(
      innerX + radius,
      innerY + innerH
    );

    ctx.quadraticCurveTo(
      innerX,
      innerY + innerH,
      innerX,
      innerY + innerH - radius
    );

    ctx.lineTo(
      innerX,
      innerY + radius
    );

    ctx.quadraticCurveTo(
      innerX,
      innerY,
      innerX + radius,
      innerY
    );

    ctx.closePath();
    ctx.clip();

    // Cover inner card with raw image
    const imageScale = Math.max(
      innerW / rawImage.width,
      innerH / rawImage.height
    );

    const imageW =
      rawImage.width * imageScale;

    const imageH =
      rawImage.height * imageScale;

    const imageX =
      innerX + (innerW - imageW) / 2;

    const imageY =
      innerY + (innerH - imageH) / 2;

    ctx.drawImage(
      rawImage,
      imageX,
      imageY,
      imageW,
      imageH
    );

    // Translucent information panel
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = tierColor;

    ctx.fillRect(
      innerX,
      1210,
      innerW,
      246
    );

    ctx.globalAlpha = 1;
    ctx.restore();

    // Text
    ctx.save();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Serial
    ctx.font = "700 40px Oswald";

    ctx.fillText(
      `#${serial ?? "?"}`,
      70,
      1285
    );

    // Character name
    const cardName = String(
      card.name || "UNKNOWN"
    ).toUpperCase();

    let nameFontSize = 66;

    do {
      ctx.font =
        `700 ${nameFontSize}px Oswald`;

      if (
        ctx.measureText(cardName).width <= 900
      ) {
        break;
      }

      nameFontSize -= 2;
    } while (nameFontSize > 42);

    ctx.fillText(
      cardName,
      70,
      1368
    );

    // Appearance
    const appearance = String(
      card.appearance || card.show || ""
    ).toUpperCase();

    let appearanceFontSize = 40;

    do {
      ctx.font =
        `700 ${appearanceFontSize}px Oswald`;

      if (
        ctx.measureText(appearance).width <= 900
      ) {
        break;
      }

      appearanceFontSize -= 1;
    } while (appearanceFontSize > 26);

    ctx.fillText(
      appearance,
      70,
      1428
    );

    ctx.restore();

    return canvas.toBuffer("image/png");
  }

  // =====================================================
  // SEASON 1 — RAW IMAGE + SEPARATE FRAME
  // =====================================================

  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

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

  const rawImage = await loadImage(imagePath);

  // Draw raw image over entire canvas
  const scale = Math.max(
    W / rawImage.width,
    H / rawImage.height
  );

  const drawW =
    rawImage.width * scale;

  const drawH =
    rawImage.height * scale;

  const drawX =
    (W - drawW) / 2;

  const drawY =
    (H - drawH) / 2;

  ctx.drawImage(
    rawImage,
    drawX,
    drawY,
    drawW,
    drawH
  );

  // Choose Season 1 frame
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

  // Default tier frame
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

  // Draw frame over raw image
  const frameImage =
    await loadImage(framePath);

  ctx.drawImage(
    frameImage,
    0,
    0,
    W,
    H
  );

  // Character name
  const cardName = String(
    card.name || "UNKNOWN"
  ).toUpperCase();

  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";

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

  ctx.fillText(
    cardName,
    nameX,
    nameY
  );

  ctx.restore();

  // Appearance
  const appearance = String(
    card.appearance || card.show || ""
  ).toUpperCase();

  ctx.save();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";

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

  ctx.fillText(
    appearance,
    appearanceX,
    appearanceY
  );

  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;