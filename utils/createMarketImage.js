const { createCanvas, loadImage } = require("canvas");
const path = require("path");

module.exports = async function createMarketImage(cards) {
  const width = 1200;
  const height = 520;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🛒 GrootX Daily Market", width / 2, 55);

  const cardW = 190;
  const cardH = 285;
  const gap = 35;
  const startX = 65;
  const y = 110;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    const x = startX + i * (cardW + gap);

    ctx.fillStyle = "#151515";
    ctx.roundRect(x - 10, y - 10, cardW + 20, cardH + 95, 18);
    ctx.fill();

    try {
      const imgPath = path.join(__dirname, "..", card.image);
      const img = await loadImage(imgPath);
      ctx.drawImage(img, x, y, cardW, cardH);
    } catch {
      ctx.fillStyle = "#333";
      ctx.fillRect(x, y, cardW, cardH);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(card.name, x + cardW / 2, y + cardH + 32);

    ctx.font = "18px Arial";
    ctx.fillText(`${card.price.toLocaleString()} coins`, x + cardW / 2, y + cardH + 62);
  }

  return canvas.toBuffer("image/png");
};