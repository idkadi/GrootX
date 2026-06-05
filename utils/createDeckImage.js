const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createDeckImage(deckCards) {
  const cols = 5;
  const rows = 3;
  const spacing = 10;

  const cardWidth = 120;
  const cardHeight = 170;

  const width = cols * cardWidth + spacing * (cols + 1);
  const height = rows * cardHeight + spacing * (rows + 1);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 15; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const x = spacing + col * (cardWidth + spacing);
    const y = spacing + row * (cardHeight + spacing);

    const item = deckCards[i];

    if (!item) {
      ctx.fillStyle = "#2b2d31";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);
      continue;
    }

    try {
      const imagePath = path.join(
        __dirname,
        "..",
        "images",
        item.card.image
      );

      const image = await loadImage(imagePath);
      ctx.drawImage(image, x, y, cardWidth, cardHeight);
    } catch {
      ctx.fillStyle = "#2b2d31";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);
    }
  }

  return canvas.toBuffer();
}

module.exports = createDeckImage;