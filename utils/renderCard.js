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
  const seasonValue = String(
    ownedCard?.season ??
    ownedCard?.cardSeason ??
    card.season ??
    0
  )
    .trim()
    .toLowerCase()
    .replace(/^s/, "");

  const season = Number(seasonValue);

  if (!Number.isInteger(season) || season < 0) {
    throw new Error(`Invalid card season: ${seasonValue}`);
  }

  // Ownership is authoritative when supplied.
  // The fallback supports callers passing a merged owned card.
  const frameId = ownedCard
    ? ownedCard.frameId
    : card.frameId;

  const frameList = Array.isArray(frames)
    ? frames
    : frames.frames || [];

  const hasFrame =
    frameId != null &&
    String(frameId).trim() !== "";

  const equippedFrame = hasFrame
    ? frameList.find(
        frame => String(frame.id) === String(frameId)
      )
    : null;

  if (hasFrame && !equippedFrame) {
    throw new Error(
      `Equipped frame ${frameId} was not found in data/frames.`
    );
  }

  if (equippedFrame && !equippedFrame.image) {
    throw new Error(
      `Equipped frame ${frameId} has no image path.`
    );
  }

  // S0 without a custom frame keeps its original style.
  if (season === 0 && !equippedFrame) {
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

    ctx.fillStyle = tierColor;
    ctx.fillRect(0, 0, W, H);

    const innerX = 36;
    const innerY = 36;
    const innerW = 982;
    const innerH = 1420;
    const radius = 18;

    ctx.save();
    ctx.beginPath();

    ctx.moveTo(innerX + radius, innerY);

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

    const imageScale = Math.max(
      innerW / rawImage.width,
      innerH / rawImage.height
    );

    const imageW = rawImage.width * imageScale;
    const imageH = rawImage.height * imageScale;

    const imageX = innerX + (innerW - imageW) / 2;
    const imageY = innerY + (innerH - imageH) / 2;

    ctx.drawImage(
      rawImage,
      imageX,
      imageY,
      imageW,
      imageH
    );

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = tierColor;
    ctx.fillRect(innerX, 1210, innerW, 246);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.font = "700 40px Oswald";
    ctx.fillText(`#${serial ?? "?"}`, 70, 1285);

    const cardName = String(
      card.name || "UNKNOWN"
    ).toUpperCase();

    let nameFontSize = 66;

    do {
      ctx.font = `700 ${nameFontSize}px Oswald`;

      if (ctx.measureText(cardName).width <= 900) {
        break;
      }

      nameFontSize -= 2;
    } while (nameFontSize > 42);

    ctx.fillText(cardName, 70, 1368);

    const appearance = String(
      card.appearance || card.show || ""
    ).toUpperCase();

    let appearanceFontSize = 40;

    do {
      ctx.font = `700 ${appearanceFontSize}px Oswald`;

      if (ctx.measureText(appearance).width <= 900) {
        break;
      }

      appearanceFontSize -= 1;
    } while (appearanceFontSize > 26);

    ctx.fillText(appearance, 70, 1428);
    ctx.restore();

    return canvas.toBuffer("image/png");
  }

  // S1, plus S0 cards with equipped custom frames.
  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  if (!card.rawImage) {
    throw new Error(
      `Card ${card.id} is missing rawImage.`
    );
  }

  const imagePath = path.join(
    __dirname,
    "..",
    "images",
    card.rawImage
  );

  const rawImage = await loadImage(imagePath);

  const scale = Math.max(
    W / rawImage.width,
    H / rawImage.height
  );

  const drawW = rawImage.width * scale;
  const drawH = rawImage.height * scale;

  ctx.drawImage(
    rawImage,
    (W - drawW) / 2,
    (H - drawH) / 2,
    drawW,
    drawH
  );

  // Priority:
  // 1. Equipped custom frame
  // 2. Event frame
  // 3. Default tier frame
  let framePath = equippedFrame
    ? path.join(
        __dirname,
        "..",
        equippedFrame.image
      )
    : null;

  const event = String(
    ownedCard?.event || card.event || ""
  ).trim().toLowerCase();

  if (!framePath && event === "halloween2026") {
    framePath = path.join(
      __dirname,
      "..",
      "images",
      "default",
      "halloween26.png"
    );
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

  const frameImage = await loadImage(framePath);
  ctx.drawImage(frameImage, 0, 0, W, H);

  const cardName = String(
    card.name || "UNKNOWN"
  ).toUpperCase();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";

  const tier = String(card.tier || "common")
    .trim()
    .toLowerCase();

  const isHalloweenFrame =
    !equippedFrame && event === "halloween2026";

  const isS1EpicFrame =
    season === 1 &&
    !equippedFrame &&
    !isHalloweenFrame &&
    tier === "epic";

  const textOffsetY = isS1EpicFrame ? 22 : 0;

  let nameFontSize = isHalloweenFrame ? 84 : 72;

  do {
    ctx.font = `700 ${nameFontSize}px Oswald`;

    if (ctx.measureText(cardName).width <= 780) {
      break;
    }

    nameFontSize -= 2;
  } while (nameFontSize > 42);

  ctx.fillText(cardName, W / 2, 1175 + textOffsetY);
  ctx.restore();

  const appearance = String(
    card.appearance || card.show || ""
  ).toUpperCase();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";

  let appearanceFontSize = isHalloweenFrame ? 46 : 38;

  do {
    ctx.font = `700 ${appearanceFontSize}px Oswald`;

    if (ctx.measureText(appearance).width <= 760) {
      break;
    }

    appearanceFontSize -= 1;
  } while (appearanceFontSize > 25);

  ctx.fillText(appearance, W / 2, 1255 + textOffsetY);
  ctx.restore();

  // Serial beside the stars on all Season 1 cards.
  if (season === 1) {
    const serialText = `#${serial ?? "?"}`;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 4;

    let serialFontSize = 46;

    while (serialFontSize > 18) {
      ctx.font = `700 ${serialFontSize}px Oswald`;

      if (ctx.measureText(serialText).width <= 190) {
        break;
      }

      serialFontSize--;
    }

    ctx.font = `700 ${serialFontSize}px Oswald`;
    ctx.fillText(serialText, 800, 1355, 190);
    ctx.restore();
  }

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;