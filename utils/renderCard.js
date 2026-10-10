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

  const eventKey = String(
    ownedCard?.event ||
    card.event ||
    card.series ||
    ""
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const isHalloween = [
    "halloween2026",
    "halloween26"
  ].includes(eventKey);

  // Original S0 style.
  if (season === 0 && !equippedFrame && !isHalloween) {
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

  // Frame overlays for newer seasons, events and custom frames.
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

  // Equipped frame → event frame → default tier frame.
  let framePath = equippedFrame
    ? path.join(
        __dirname,
        "..",
        equippedFrame.image
      )
    : null;

  if (!framePath && isHalloween) {
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

  // Text areas exclude dividers, side decorations and stars.
  const layouts = {
    common: {
      x: 170,
      width: 714,
      top: 1110,
      bottom: 1300,
      name: 68,
      detail: 38,
      color: "#FFFFFF"
    },
    uncommon: {
      x: 170,
      width: 714,
      top: 1110,
      bottom: 1300,
      name: 68,
      detail: 38,
      color: "#FFFFFF"
    },
    rare: {
      x: 180,
      width: 694,
      top: 1110,
      bottom: 1295,
      name: 68,
      detail: 38,
      color: "#FFFFFF"
    },
    epic: {
      x: 175,
      width: 704,
      top: 1140,
      bottom: 1310,
      name: 66,
      detail: 36,
      color: "#FFFFFF"
    },
    legendary: {
      x: 185,
      width: 684,
      top: 1120,
      bottom: 1295,
      name: 68,
      detail: 38,
      color: "#FFFFFF"
    },
    halloween: {
      x: 205,
      width: 644,
      top: 1140,
      bottom: 1340,
      name: 74,
      detail: 42,
      color: "#FFFFFF"
    }
  };

  const tier = String(
    card.tier || "common"
  ).trim().toLowerCase();

  const layoutKey =
    !equippedFrame && isHalloween
      ? "halloween"
      : tier;

  const defaultLayout =
    layouts[layoutKey] || layouts.common;

  // Optional custom-frame text layout from data/frames.
  const layout = {
    ...defaultLayout,
    ...(equippedFrame?.textLayout || {})
  };

  const name = String(
    card.name || "UNKNOWN"
  ).trim().toUpperCase();

  const appearance = String(
    card.appearance ||
    card.show ||
    card.movie ||
    ""
  ).trim().toUpperCase();

  function fitLines(
    text,
    maxSize,
    minSize,
    maxLines,
    width,
    height
  ) {
    if (!text) {
      return {
        lines: [],
        size: maxSize,
        lineHeight: 0
      };
    }

    const words = text.split(/\s+/);

    for (let size = maxSize; size >= minSize; size--) {
      ctx.font = `700 ${size}px Oswald`;

      const lines = [];
      let line = "";
      let valid = true;

      for (const word of words) {
        if (ctx.measureText(word).width > width) {
          valid = false;
          break;
        }

        const candidate = line
          ? `${line} ${word}`
          : word;

        if (ctx.measureText(candidate).width > width) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }

      if (line) lines.push(line);

      const lineHeight = size * 1.22;

      if (
        valid &&
        lines.length <= maxLines &&
        lines.length * lineHeight <= height
      ) {
        return { lines, size, lineHeight };
      }
    }

    ctx.font = `700 ${minSize}px Oswald`;

    let shortened = text;

    while (
      shortened &&
      ctx.measureText(shortened + "…").width > width
    ) {
      shortened = shortened.slice(0, -1);
    }

    return {
      lines: [shortened + "…"],
      size: minSize,
      lineHeight: minSize * 1.22
    };
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = layout.color;

  const panelHeight = layout.bottom - layout.top;
  const gap = appearance ? 10 : 0;

  const nameHeight = appearance
    ? panelHeight * 0.54
    : panelHeight;

  const nameBlock = fitLines(
    name,
    layout.name,
    30,
    2,
    layout.width,
    nameHeight
  );

  const movieBlock = fitLines(
    appearance,
    layout.detail,
    24,
    2,
    layout.width,
    panelHeight - nameHeight - gap
  );

  const totalHeight =
    nameBlock.lines.length * nameBlock.lineHeight +
    movieBlock.lines.length * movieBlock.lineHeight +
    gap;

  let y =
    layout.top +
    (panelHeight - totalHeight) / 2;

  // Name first, then movie.
  for (const block of [nameBlock, movieBlock]) {
    ctx.font = `700 ${block.size}px Oswald`;

    const glowName =
      block === nameBlock &&
      (tier === "legendary" || isHalloween);

    ctx.shadowColor = glowName
      ? "rgba(255,255,255,0.95)"
      : "rgba(0,0,0,0.9)";

    ctx.shadowBlur = glowName ? 14 : 3;

    for (const line of block.lines) {
      ctx.fillText(
        line,
        layout.x + layout.width / 2,
        y + block.lineHeight / 2
      );

      y += block.lineHeight;
    }

    if (block === nameBlock) y += gap;
  }

  ctx.restore();

  // Serial below the movie, beside the stars.
  if (season === 1) {
    const serialText = `#${serial ?? "?"}`;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 4;

    let serialFontSize = 40;

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