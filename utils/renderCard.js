const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

const frames = require("../data/frames");

registerFont(
  path.join(__dirname, "..", "fonts", "Oswald-Bold.ttf"),
  {
    family: "Oswald",
  }
);

async function renderCard(card, serial = "000000", ownedCard = null) {
  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // =====================================================
  // 1. LOAD RAW CARD IMAGE
  // =====================================================

  const imagePath = card.rawImage
    ? path.join(__dirname, "..", "images", card.rawImage)
    : path.join(__dirname, "..", "images", card.image);

  const img = await loadImage(imagePath);

  // =====================================================
  // 2. DRAW RAW IMAGE - COVER ENTIRE CARD
  // =====================================================

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
  // 3. CHOOSE FRAME
  // =====================================================

  let framePath;

  // If user has equipped a custom frame, use that
  if (ownedCard?.frameId) {
    const frameData = frames.find(
      f => Number(f.id) === Number(ownedCard.frameId)
    );

    if (frameData) {
      framePath = path.join(
        __dirname,
        "..",
        frameData.image
      );
    }
  }

  // Otherwise use default tier frame
  if (!framePath) {
    const tier = String(card.tier || "common").toLowerCase();

    framePath = path.join(
      __dirname,
      "..",
      "images",
      "default",
      `${tier}.png`
    );
  }

  // =====================================================
  // 4. DRAW FRAME OVER RAW IMAGE
  // =====================================================

  const frameImg = await loadImage(framePath);

  ctx.drawImage(
    frameImg,
    0,
    0,
    W,
    H
  );

  // =====================================================
  // 5. CHARACTER NAME
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
    ctx.font = `700 ${nameFontSize}px Oswald`;

    if (
      ctx.measureText(cardName).width <=
      nameMaxWidth
    ) {
      break;
    }

    nameFontSize -= 2;

  } while (nameFontSize > 42);

  // Small black outline for readability
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
  // 6. MOVIE / APPEARANCE
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

  // =====================================================
  // FINAL IMAGE
  // =====================================================

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;