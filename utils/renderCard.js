const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const path = require("path");
const frames = require("../data/frames");

// Byte-bounded LRU caches: decoded assets and small battle thumbnails only.
function imageCache(limit) {
  const entries = new Map(); let bytes = 0;
  return {
    get(key) { const e = entries.get(key); if (!e) return; entries.delete(key); entries.set(key, e); return e.image; },
    set(key, image) {
      const size = image.width * image.height * 4;
      if (size > limit) return;
      const old = entries.get(key); if (old) { bytes -= old.size; entries.delete(key); }
      while (bytes + size > limit && entries.size) {
        const first = entries.keys().next().value; bytes -= entries.get(first).size; entries.delete(first);
      }
      entries.set(key, { image, size }); bytes += size;
    },
    clear() { entries.clear(); bytes = 0; }
  };
}
const assets = imageCache(48 * 1024 * 1024);
const thumbnails = imageCache(32 * 1024 * 1024);
const assetLoads = new Map();
const thumbnailLoads = new Map();
async function cachedAsset(filename) {
  const hit = assets.get(filename); if (hit) return hit;
  if (assetLoads.has(filename)) return assetLoads.get(filename);
  const pending = loadImage(filename).then(image => { assets.set(filename, image); return image; });
  assetLoads.set(filename, pending);
  try { return await pending; } finally { assetLoads.delete(filename); }
}
function encodePNG(canvas) {
  return new Promise((resolve, reject) => canvas.toBuffer((error, buffer) => {
    if (error) reject(error); else resolve(buffer);
  }, "image/png", { compressionLevel: 3 }));
}
// Limit uncached renders across simultaneous battles on small VPS instances.
let activeRenders = 0; const renderQueue = [];
async function limitedRender(job) {
  if (activeRenders >= 2) await new Promise(resolve => renderQueue.push(resolve));
  else activeRenders++;
  try { return await job(); } finally {
    const next = renderQueue.shift(); if (next) next(); else activeRenders--;
  }
}


registerFont(
  path.join(__dirname, "..", "fonts", "Oswald-Bold.ttf"),
  { family: "Oswald" }
);

async function renderCard(
  card,
  serial = "000000",
  ownedCard = null,
  returnCanvas = false
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

  const eventKey = String(ownedCard?.event || card.event || card.series || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHalloween = ["halloween2026", "halloween26"].includes(eventKey);

  // S0 without a custom frame keeps its original style.
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

    const rawImage = await cachedAsset(imagePath);
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
    ctx.fillText(`#${serial ?? "?"}`, 70, 1430, 900);

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
    ctx.restore();

    return returnCanvas ? canvas : encodePNG(canvas);
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

  const rawImage = await cachedAsset(imagePath);

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

  const frameImage = await cachedAsset(framePath);
  ctx.drawImage(frameImage, 0, 0, W, H);

  // Coordinates are measured on the supplied 1054 × 1492 frame assets.
  // Each box excludes its divider, side decorations, and star row.
  const layouts = {
    common:    { x: 170, width: 714, top: 1110, bottom: 1300, name: 68, detail: 38, color: "#FFFFFF" },
    uncommon:  { x: 170, width: 714, top: 1110, bottom: 1300, name: 68, detail: 38, color: "#FFFFFF" },
    rare:      { x: 180, width: 694, top: 1110, bottom: 1295, name: 68, detail: 38, color: "#FFFFFF" },
    epic:      { x: 175, width: 704, top: 1140, bottom: 1310, name: 66, detail: 36, color: "#FFFFFF" },
    legendary: { x: 185, width: 684, top: 1140, bottom: 1305, name: 68, detail: 38, color: "#FFFFFF" },
    halloween: { x: 205, width: 644, top: 1140, bottom: 1340, name: 74, detail: 42, color: "#FFFFFF" }
  };
  const tier = String(card.tier || "common").trim().toLowerCase();
  const defaultLayout = layouts[!equippedFrame && isHalloween ? "halloween" : tier] || layouts.common;
  // Custom frames may define textLayout using the same fields in data/frames.
  const layout = { ...defaultLayout, ...(equippedFrame?.textLayout || {}) };
  const name = String(card.name || "UNKNOWN").trim().toUpperCase();
  const appearance = String(card.appearance || card.show || card.movie || "").trim().toUpperCase();
  const detailText = appearance;

  // Wrap first, then shrink until both the width and height fit. Extremely
  // long input gets an ellipsis instead of overflowing onto decorations.
  function fitLines(text, maxSize, minSize, maxLines, width, height) {
    if (!text) return { lines: [], size: maxSize, lineHeight: 0 };
    const words = text.split(/\s+/);
    for (let size = maxSize; size >= minSize; size--) {
      ctx.font = `700 ${size}px Oswald`;
      const lines = [];
      let line = "";
      let valid = true;
      for (const word of words) {
        if (ctx.measureText(word).width > width) { valid = false; break; }
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width > width) { lines.push(line); line = word; }
        else line = candidate;
      }
      if (line) lines.push(line);
      const lineHeight = size * 1.22;
      if (valid && lines.length <= maxLines && lines.length * lineHeight <= height) {
        return { lines, size, lineHeight };
      }
    }
    ctx.font = `700 ${minSize}px Oswald`;
    let shortened = text;
    while (shortened && ctx.measureText(shortened + "…").width > width) shortened = shortened.slice(0, -1);
    return { lines: [shortened + "…"], size: minSize, lineHeight: minSize * 1.22 };
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = layout.color;
  ctx.shadowColor = layout.color === "#FFFFFF" ? "rgba(0,0,0,0.9)" : "rgba(255,220,130,0.3)";
  ctx.shadowBlur = 3;
  const panelHeight = layout.bottom - layout.top;
  const serialBlock = fitLines(`#${serial ?? "?"}`, 36, 22, 1, layout.width, 44);
  const serialGap = 8;
  const contentHeight = panelHeight - serialBlock.lineHeight - serialGap;
  const gap = detailText ? 8 : 0;
  const nameHeight = detailText ? contentHeight * 0.56 : contentHeight;
  const nameBlock = fitLines(name, layout.name, 30, 2, layout.width, nameHeight);
  const detailBlock = fitLines(detailText, layout.detail, 24, 2, layout.width, contentHeight - nameHeight - gap);
  const totalHeight = nameBlock.lines.length * nameBlock.lineHeight +
    detailBlock.lines.length * detailBlock.lineHeight + gap + serialGap + serialBlock.lineHeight;
  let y = layout.top + (panelHeight - totalHeight) / 2;
  for (const block of [nameBlock, detailBlock]) {
    ctx.font = `700 ${block.size}px Oswald`;
    const glowName = block === nameBlock && (tier === "legendary" || isHalloween);
    ctx.shadowColor = glowName ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.9)";
    ctx.shadowBlur = glowName ? 14 : 3;
    for (const line of block.lines) {
      ctx.fillText(line, layout.x + layout.width / 2, y + block.lineHeight / 2);
      y += block.lineHeight;
    }
    if (block === nameBlock) y += gap;
  }
  // Serial is centered immediately below the movie within the same panel.
  ctx.font = `700 ${serialBlock.size}px Oswald`;
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 3;
  ctx.fillText(
    serialBlock.lines[0],
    layout.x + layout.width / 2,
    y + serialGap + serialBlock.lineHeight / 2
  );
  ctx.restore();

  return returnCanvas ? canvas : encodePNG(canvas);
}

// Existing callers still receive PNG buffers. Battle callers skip PNG round trips.
renderCard.thumbnail = function(card, serial, ownedCard, width, height) {
  const printed = [card.id, card.rawImage, card.name, card.appearance, card.show,
    card.movie, card.tier, card.season, card.event, card.series, card.frameId];
  const ownership = ownedCard == null ? null : [ownedCard.season,
    ownedCard.cardSeason, ownedCard.frameId, ownedCard.event];
  const key = JSON.stringify([printed, serial, ownership, width, height]);
  const hit = thumbnails.get(key); if (hit) return Promise.resolve(hit);
  if (thumbnailLoads.has(key)) return thumbnailLoads.get(key);
  const pending = limitedRender(async () => {
    const full = await renderCard(card, serial, ownedCard, true);
    const small = createCanvas(width, height);
    small.getContext("2d").drawImage(full, 0, 0, width, height);
    thumbnails.set(key, small);
    return small;
  });
  thumbnailLoads.set(key, pending);
  pending.then(() => thumbnailLoads.delete(key), () => thumbnailLoads.delete(key));
  return pending;
};
renderCard.loadAsset = cachedAsset;
renderCard.encodePNG = encodePNG;
renderCard.clearCache = function() { assets.clear(); thumbnails.clear(); };
module.exports = renderCard;
