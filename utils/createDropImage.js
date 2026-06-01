const {
  createCanvas,
  loadImage
} = require("canvas");

const path = require("path");

async function createDropImage(cards) {

  const spacing = 20;

  // Smaller cards when 4-card drop
  const cardWidth =
    cards.length === 4
      ? 180
      : 220;

  const cardHeight =
    cards.length === 4
      ? 260
      : 320;

  const width =
    (cardWidth * cards.length) +
    (spacing * (cards.length + 1));

  const height =
    cardHeight + 50;

  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  // Background
  ctx.fillStyle =
    "#1e1f22";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  // Draw cards
  for (let i = 0; i < cards.length; i++) {

    const card =
      cards[i];

    const imagePath =
      path.join(
        __dirname,
        "..",
        "images",
        card.image
      );

    const image =
      await loadImage(
        imagePath
      );

    const x =
      spacing +
      i * (cardWidth + spacing);

    ctx.drawImage(
      image,
      x,
      25,
      cardWidth,
      cardHeight
    );
  }

  return canvas.toBuffer();
}

module.exports =
  createDropImage;