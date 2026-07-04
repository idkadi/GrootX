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
  const canvas = createCanvas(1054, 1492);
  const ctx = canvas.getContext("2d");

  const tier = (card.tier || "common").toLowerCase();
  const color = COLORS[tier] || COLORS.common;

  const imagePath = card.rawImage
    ? path.join(__dirname, "..", "images", card.rawImage)
    : path.join(__dirname, "..", "images", card.image);

  const img = await loadImage(imagePath);

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, 1054, 1492);

  ctx.strokeStyle = color;
  ctx.lineWidth = 18;
  ctx.strokeRect(35, 35, 984, 1422);

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(55, 55, 944, 1382);

  ctx.drawImage(img, 70, 70, 914, 1120);

  const gradient = ctx.createLinearGradient(70, 1180, 984, 1420);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = gradient;
  ctx.fillRect(70, 1180, 914, 240);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 32px Arial";
  ctx.fillText(`#${serial}`, 95, 1250);

  ctx.font = "bold 50px Arial";
  ctx.fillText(card.name.toUpperCase(), 95, 1315);

  ctx.font = "bold 30px Arial";
  ctx.fillText(card.appearance.toUpperCase(), 95, 1365);

  return canvas.toBuffer("image/png");
}

module.exports = renderCard;