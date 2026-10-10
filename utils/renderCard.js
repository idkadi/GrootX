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

  // Original S0 frame style.
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

    const rawImage = await loadImage(
      path.join(
        __dirname,
        "..",
        "images",
        card.rawImage
      )
    );

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

    ctx.drawImage(
      rawImage,
      innerX + (innerW - imageW) / 2,
      innerY + (innerH - imageH) / 2,
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

    ctx.fillText(cardName, 70, 1290, 900);

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

    ctx.fillText(appearance, 70, 1362, 900);

    ctx.font = "700 40px Oswald";
    ctx.fillText(`#${serial ?? "?"}`, 70, 1430, 900);

    ctx.restore();

    return canvas.toBuffer("image/png");
  }

  const W = 1054;
  const H = 1492;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  if (!card.rawImage) {
    throw new Error(
      `Card ${card.id} is missing rawImage.`
    );
  }

  const rawImage = await loadImage(
    path.join(
      __dirname,
      "..",
      "images",
      card.rawImage
    )
  );

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

  // Equipped frame → event frame → tier frame.
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

  // Individual safe text areas for the supplied frames.
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

  const layout = {
    ...defaultLayout,
    ...(equippedFrame?.textLayout || {})
  };

  const name = String(
    card.name || "UNKNOWN"
  ).trim().toUpperCase();

  const movie = String(
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
        return {
          lines,
          size,
          lineHeight
        };
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

  // Reserve serial space before fitting name and movie.
  const serialBlock = fitLines(
    `#${serial ?? "?"}`,
    36,
    22,
    1,
    layout.width,
    44
  );

  const serialGap = 8;

  const contentHeight =
    panelHeight -
    serialBlock.lineHeight -
    serialGap;

  const movieGap = movie ? 8 : 0;

  const nameHeight = movie
    ? contentHeight * 0.56
    : contentHeight;

  const nameBlock = fitLines(
    name,
    layout.name,
    30,
    2,
    layout.width,
    nameHeight
  );

  const movieBlock = fitLines(
    movie,
    layout.detail,
    24,
    2,
    layout.width,
    contentHeight - nameHeight - movieGap
  );

  const totalHeight =
    nameBlock.lines.length * nameBlock.lineHeight +
    movieBlock.lines.length * movieBlock.lineHeight +
    movieGap +
    serialGap +
    serialBlock.lineHeight;

  let y =
    layout.top +
    (panelHeight - totalHeight) / 2;

  // 1. Name
  // 2. Movie
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

    if (block === nameBlock) {
      y += movieGap;
    }
  }

  // 3. Serial — centered directly below the movie.
  ctx.font = `700 ${serialBlock.size}px Oswald`;
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 3;

  ctx.fillText(
    serialBlock.lines[0],
    layout.x + layout.width / 2,
    y + serialGap + serialBlock.lineHeight / 2
  );

  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;