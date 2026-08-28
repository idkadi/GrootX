const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const path = require("path");
const renderCard = require("./renderCard");

registerFont(
  path.join(__dirname, "..", "fonts", "Oswald-Bold.ttf"),
  { family: "Oswald" }
);

const COLORS = {
  common: "#8B5A2B",
  uncommon: "#BFC7D5",
  rare: "#FFD700",
  epic: "#7A2CFF",
  legendary: "#E53935"
};

async function renderInfo(
  card,
  selectedSeason = null
) {
  const season = Number(
    selectedSeason ?? card.season ?? 0
  );

  // =====================================================
  // SEASON 1 — RAW IMAGE + SEPARATE FRAME
  // =====================================================

  if (season === 1) {
    return renderCard(
      {
        ...card,
        season: 1
      },
      null,
      {
        season: 1
      }
    );
  }

  // =====================================================
  // SEASON 0 — RAW IMAGE + OLD COLOURED FORMAT
  // =====================================================

  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const tier = String(
    card.tier || "common"
  ).toLowerCase();

  const color =
    COLORS[tier] || COLORS.common;

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

  const rawImage =
    await loadImage(imagePath);

  // Tier-coloured background
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);

  const margin = 36;
  const radius = 18;

  const imageX = margin;
  const imageY = margin;

  const imageWidth =
    W - margin * 2;

  const imageHeight =
    H - margin * 2;

  const scale = Math.max(
    imageWidth / rawImage.width,
    imageHeight / rawImage.height
  );

  const drawWidth =
    rawImage.width * scale;

  const drawHeight =
    rawImage.height * scale;

  const drawX =
    imageX +
    (imageWidth - drawWidth) / 2;

  const drawY =
    imageY +
    (imageHeight - drawHeight) / 2;

  roundedClip(
    ctx,
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    radius
  );

  ctx.drawImage(
    rawImage,
    drawX,
    drawY,
    drawWidth,
    drawHeight
  );

  ctx.restore();

  // Lower coloured panel
  const panelY = 1210;

  const panelHeight =
    H - panelY - margin;

  const gradient =
    ctx.createLinearGradient(
      imageX,
      panelY,
      imageX + imageWidth,
      panelY
    );

  gradient.addColorStop(
    0,
    hexToRgba(color, 0.9)
  );

  gradient.addColorStop(
    1,
    hexToRgba(color, 0.72)
  );

  ctx.fillStyle = gradient;

  ctx.fillRect(
    imageX,
    panelY,
    imageWidth,
    panelHeight
  );

  // Text
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // Tier instead of serial
  ctx.font = "700 32px Oswald";

  ctx.fillText(
    String(
      card.tier || "COMMON"
    ).toUpperCase(),
    70,
    1285
  );

  // Character name
  const cardName = String(
    card.name || "UNKNOWN"
  ).toUpperCase();

  let nameFontSize = 54;

  do {
    ctx.font =
      `700 ${nameFontSize}px Oswald`;

    if (
      ctx.measureText(cardName).width <= 900
    ) {
      break;
    }

    nameFontSize -= 2;
  } while (nameFontSize > 38);

  ctx.fillText(
    cardName,
    70,
    1365
  );

  // Appearance
  const appearance = String(
    card.appearance || card.show || ""
  ).toUpperCase();

  let appearanceFontSize = 34;

  do {
    ctx.font =
      `700 ${appearanceFontSize}px Oswald`;

    if (
      ctx.measureText(appearance).width <= 900
    ) {
      break;
    }

    appearanceFontSize -= 1;
  } while (appearanceFontSize > 24);

  ctx.fillText(
    appearance,
    70,
    1425
  );

  return canvas.toBuffer("image/png");
}

function roundedClip(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  ctx.save();

  roundedRect(
    ctx,
    x,
    y,
    width,
    height,
    radius
  );

  ctx.clip();
}

function roundedRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  ctx.beginPath();

  ctx.moveTo(
    x + radius,
    y
  );

  ctx.lineTo(
    x + width - radius,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + radius
  );

  ctx.lineTo(
    x + width,
    y + height - radius
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height
  );

  ctx.lineTo(
    x + radius,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - radius
  );

  ctx.lineTo(
    x,
    y + radius
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + radius,
    y
  );

  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(
    hex.replace("#", ""),
    16
  );

  return (
    `rgba(${(value >> 16) & 255}, ` +
    `${(value >> 8) & 255}, ` +
    `${value & 255}, ${alpha})`
  );
}

module.exports = renderInfo;