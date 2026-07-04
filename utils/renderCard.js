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

  // main image full card
  roundRect(ctx, 40, 40, W - 80, H - 80, 18);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, 40, 40, W - 80, H - 80);
  ctx.restore();

  // thin tier border only
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  roundRect(ctx, 25, 25, W - 50, H - 50, 0);
  ctx.stroke();

  // bottom translucent panel
  const panelX = 40;
  const panelY = 1160;
  const panelW = W - 80;
  const panelH = 292;

  const gradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.85));
  gradient.addColorStop(1, hexToRgba(color, 0.45));

  ctx.fillStyle = gradient;
  roundRect(ctx, panelX, panelY, panelW, panelH, 14);
  ctx.fill();

  // text
  ctx.fillStyle = "#fff";

  ctx.font = "bold 34px Arial";
  ctx.fillText(`#${serial}`, 70, 1235);

  ctx.font = "bold 54px Arial";
  ctx.fillText(card.name.toUpperCase(), 70, 1310);

  ctx.font = "bold 32px Arial";
  ctx.fillText(card.appearance.toUpperCase(), 70, 1360);

  return canvas.toBuffer("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();

  if (r <= 0) {
    ctx.rect(x, y, w, h);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

module.exports = renderCard;