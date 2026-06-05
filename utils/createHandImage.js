const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createHandImage(hand = []) {
  const cardW = 115;
  const cardH = 165;
  const gap = 12;

  const width = hand.length * cardW + Math.max(0, hand.length - 1) * gap + 40;
  const height = 230;

  const canvas = createCanvas(Math.max(width, 400), height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#101116";
  ctx.fillRect(0, 0, canvas.width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.fillText("Your Hand", 20, 35);

  for (let i = 0; i < hand.length; i++) {
    const item = hand[i];
    const x = 20 + i * (cardW + gap);
    const y = 55;

    try {
      const imagePath = path.join(__dirname, "..", "images", item.card.image);
      const img = await loadImage(imagePath);
      ctx.drawImage(img, x, y, cardW, cardH);
    } catch {
      continue;
    }

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);

    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(x, y + cardH - 25, cardW, 25);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Arial";
    ctx.fillText(`${i + 1}. #${item.serial}`, x + 6, y + cardH - 8);
  }

  return canvas.toBuffer();
}

module.exports = createHandImage;