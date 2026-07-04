const { createCanvas, loadImage } = require("canvas");
const path = require("path");

const COLORS = {
  common: "#8B5A2B",
  uncommon: "#BFC7D5",
  rare: "#FFD700",
  epic: "#7A2CFF",
  legendary: "#E53935",
};

async function renderCard(card, serial = "000000") {
  const W = 1054;
  const H = 1492;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const tier = (card.tier || "common").toLowerCase();
  const color = COLORS[tier] || COLORS.common;

  const imagePath = card.rawImage
    ? path.join(__dirname, "..", "images", card.rawImage)
    : path.join(__dirname, "..", "images", card.image);

  const img = await loadImage(imagePath);

  // Full image, no black border/background
  roundRect(ctx, 35, 35, W - 70, H - 70, 14);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, 35, 35, W - 70, H - 70);
  ctx.restore();

  // Thin tier border
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.strokeRect(12, 12, W - 24, H - 24);

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Bottom panel like your reference
  const panelX = 35;
  const panelY = 1185;
  const panelW = W - 70;
  const panelH = 230;

  const gradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.82));
  gradient.addColorStop(1, hexToRgba(color, 0.55));

  ctx.fillStyle = gradient;
  roundRect(ctx, panelX, panelY, panelW, panelH, 12);
  ctx.fill();

  // Text smaller + compact
  ctx.fillStyle = "#ffffff";

  ctx.font = "bold 28px Arial";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 65, 1255);

  ctx.font = "bold 38px Arial";
  ctx.fillText(String(card.name || "UNKNOWN").toUpperCase(), 65, 1305);

  ctx.font = "bold 25px Arial";
  ctx.fillText(String(card.appearance || "").toUpperCase(), 65, 1343);

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

module.exports = renderCard;