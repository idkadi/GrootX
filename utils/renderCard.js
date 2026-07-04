const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");

registerFont(path.join(__dirname, "..", "fonts", "Oswald-Bold.ttf"), {
  family: "Oswald",
});

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

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);

  const margin = 36;
  const radius = 18;

  const imgX = margin;
  const imgY = margin;
  const imgW = W - margin * 2;
  const imgH = H - margin * 2;

  const scale = Math.max(imgW / img.width, imgH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = imgX + (imgW - drawW) / 2;
  const drawY = imgY + (imgH - drawH) / 2;

  roundedClip(ctx, imgX, imgY, imgW, imgH, radius);
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();

  const panelY = 1210;
  const panelH = H - panelY - margin;

  const gradient = ctx.createLinearGradient(imgX, panelY, imgX + imgW, panelY);
  gradient.addColorStop(0, hexToRgba(color, 0.9));
  gradient.addColorStop(1, hexToRgba(color, 0.72));

  ctx.fillStyle = gradient;
  ctx.fillRect(imgX, panelY, imgW, panelH);

  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";

  ctx.font = "700 32px Oswald";
  ctx.fillText(`#${String(serial).padStart(6, "0")}`, 70, 1285);

  ctx.font = "700 54px Oswald";
  ctx.fillText(String(card.name || "UNKNOWN").toUpperCase(), 70, 1365);

  ctx.font = "700 34px Oswald";
  ctx.fillText(String(card.appearance || "").toUpperCase(), 70, 1425);

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