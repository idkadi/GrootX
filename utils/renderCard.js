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

  // image covers whole canvas, no black background
  ctx.drawImage(img, 0, 0, W, H);

  // bottom panel
  const panelY = 1168;
  const panelH = 250;

  const gradient = ctx.createLinearGradient(0, panelY, W, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.82));
  gradient.addColorStop(1, hexToRgba(color, 0.45));

  ctx.fillStyle = gradient;
  ctx.fillRect(0, panelY, W, panelH);

  // text like reference
  ctx.fillStyle = "#fff";

  ctx.font = "bold 30px Arial";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 65, 1240);

  ctx.font = "bold 42px Arial";
  ctx.fillText(String(card.name || "UNKNOWN").toUpperCase(), 65, 1295);

  ctx.font = "bold 28px Arial";
  ctx.fillText(String(card.appearance || "").toUpperCase(), 65, 1340);

  // ONLY thin tier border, no black/white border
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  return canvas.toBuffer("image/png");
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

module.exports = renderCard;