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

  // ===== Artwork =====
  const margin = 36;

  const imgX = margin;
  const imgY = margin;
  const imgW = W - margin * 2;
  const imgH = H - margin * 2;

  const scale = Math.max(imgW / img.width, imgH / img.height);

  const drawW = img.width * scale;
  const drawH = img.height * scale;

  const drawX = imgX + (imgW - drawW) / 2;
  const drawY = imgY + (imgH - drawH) / 2;

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(imgX + 18, imgY);
  ctx.lineTo(imgX + imgW - 18, imgY);
  ctx.quadraticCurveTo(imgX + imgW, imgY, imgX + imgW, imgY + 18);
  ctx.lineTo(imgX + imgW, imgY + imgH - 18);
  ctx.quadraticCurveTo(
    imgX + imgW,
    imgY + imgH,
    imgX + imgW - 18,
    imgY + imgH
  );
  ctx.lineTo(imgX + 18, imgY + imgH);
  ctx.quadraticCurveTo(imgX, imgY + imgH, imgX, imgY + imgH - 18);
  ctx.lineTo(imgX, imgY + 18);
  ctx.quadraticCurveTo(imgX, imgY, imgX + 18, imgY);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  ctx.restore();

  // ===== Bottom Panel =====
  const panelY = 1210;
  const panelH = H - panelY;

  const gradient = ctx.createLinearGradient(0, panelY, W, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.90));
  gradient.addColorStop(1, hexToRgba(color, 0.72));

  ctx.fillStyle = gradient;
  ctx.fillRect(margin, panelY, W - margin * 2, panelH);

  // ===== Text =====
  ctx.fillStyle = "#fff";

  ctx.font = "bold 32px Arial";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 70, 1285);

  ctx.font = "bold 54px Arial";
  ctx.fillText(
    String(card.name || "UNKNOWN").toUpperCase(),
    70,
    1365
  );

  ctx.font = "bold 34px Arial";
  ctx.fillText(
    String(card.appearance || "").toUpperCase(),
    70,
    1425
  );

  // ===== Thin rarity border =====
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  return canvas.toBuffer("image/png");
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);

  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

module.exports = renderCard;