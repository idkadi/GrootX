const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createDeckImage(deckCards) {
  const cols = 4;
  const rows = 3;
  const spacing = 12;

  const cardWidth = 130;
  const cardHeight = 185;

  const width = cols * cardWidth + spacing * (cols + 1);
  const height = rows * cardHeight + spacing * (rows + 1);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#14151a";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const x = spacing + col * (cardWidth + spacing);
    const y = spacing + row * (cardHeight + spacing);

    const item = deckCards[i];

    if (!item) {
      ctx.fillStyle = "#24262d";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      ctx.fillStyle = "#888";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+", x + cardWidth / 2, y + cardHeight / 2 + 10);

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
      ctx.fillStyle = "#24262d";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);
    }
  }

  return canvas.toBuffer("image/png");
}

module.exports = createDeckImage;