const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createDeckImage(deckCards, username) {
  const cols = 5;
  const rows = 3;
  const spacing = 20;

  const cardWidth = 150;
  const cardHeight = 220;

  const topHeight = 55;
  const bottomHeight = 35;

  const width = cols * cardWidth + spacing * (cols + 1);
  const height =
    topHeight +
    rows * cardHeight +
    spacing * (rows + 1) +
    bottomHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GROOTX BATTLE DECK", width / 2, 35);

  for (let i = 0; i < 15; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const x = spacing + col * (cardWidth + spacing);
    const y = topHeight + spacing + row * (cardHeight + spacing);

    const item = deckCards[i];

    if (!item) {
      ctx.fillStyle = "#2b2d31";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.strokeStyle = "#555";
      ctx.lineWidth = 3;
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
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, cardWidth, cardHeight);
    }
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Cards ${deckCards.length}/15`,
    width / 2,
    height - 12
  );

  return canvas.toBuffer();
}

module.exports = createDeckImage;