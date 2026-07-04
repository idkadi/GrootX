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

  // no black background
  ctx.clearRect(0, 0, W, H);

  // draw image full card size
  const scale = Math.max(W / img.width, H / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // bottom panel
  const panelY = 1168;
  const panelH = 250;

  const gradient = ctx.createLinearGradient(0, panelY, W, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.86));
  gradient.addColorStop(1, hexToRgba(color, 0.5));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, panelY, W, panelH);

  // text
  ctx.fillStyle = "#ffffff";

  ctx.font = "bold 32px Arial";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 65, 1245);

  ctx.font = "bold 52px Arial";
  ctx.fillText(String(card.name || "UNKNOWN").toUpperCase(), 65, 1315);

  ctx.font = "bold 34px Arial";
  ctx.fillText(String(card.appearance || "").toUpperCase(), 65, 1370);

  // ONLY thin rarity border, no black border
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  return canvas.toBuffer("image/png");
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

module.exports = renderCard;