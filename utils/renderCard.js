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

  // transparent / clean background
  ctx.clearRect(0, 0, W, H);

  // outer purple frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // image area
  const x = 40;
  const y = 40;
  const imgW = W - 80;
  const imgH = H - 80;
  const radius = 18;

  roundedClip(ctx, x, y, imgW, imgH, radius);

  const scale = Math.max(imgW / img.width, imgH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (imgW - drawW) / 2;
  const drawY = y + (imgH - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();

  // bottom info panel
  const panelX = 40;
  const panelY = 1215;
  const panelW = W - 80;
  const panelH = 235;

  const gradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.9));
  gradient.addColorStop(1, hexToRgba(color, 0.55));

  ctx.fillStyle = gradient;
  roundedRect(ctx, panelX, panelY, panelW, panelH, 16);
  ctx.fill();

  // text
  ctx.fillStyle = "#ffffff";

  ctx.font = "bold 32px Arial";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 65, 1285);

  ctx.font = "bold 48px Arial";
  ctx.fillText(String(card.name || "UNKNOWN").toUpperCase(), 65, 1345);

  ctx.font = "bold 31px Arial";
  ctx.fillText(String(card.appearance || "").toUpperCase(), 65, 1395);

  return canvas.toBuffer("image/png");
}

function roundedClip(ctx, x, y, w, h, r) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, r);
  ctx.clip();
}

function roundedRect(ctx, x, y, w, h, r) {
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