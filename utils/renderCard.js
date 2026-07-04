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

  ctx.clearRect(0, 0, W, H);

  // Thin tier frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Rounded image
  roundRect(ctx, 65, 65, 924, 1290, 18);
  ctx.save();
  ctx.clip();
  ctx.drawImage(img, 65, 65, 924, 1290);
  ctx.restore();

  // Bottom transparent panel
  const panelY = 1170;
  const panelH = 185;

  const gradient = ctx.createLinearGradient(65, panelY, 989, panelY + panelH);
  gradient.addColorStop(0, hexToRgba(color, 0.82));
  gradient.addColorStop(1, hexToRgba(color, 0.55));

  ctx.fillStyle = gradient;
  roundRect(ctx, 65, panelY, 924, panelH, 14);
  ctx.fill();

  // Text
  ctx.fillStyle = "#fff";

  ctx.font = "bold 32px Arial";
  ctx.fillText(`#${serial}`, 90, 1235);

  ctx.font = "bold 46px Arial";
  ctx.fillText(card.name.toUpperCase(), 90, 1295);

  ctx.font = "bold 29px Arial";
  ctx.fillText(card.appearance.toUpperCase(), 90, 1340);

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