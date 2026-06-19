const {
  createCanvas,
  loadImage
} = require("canvas");

const path = require("path");

async function createMarketImage(cards) {
  const spacing = 20;

  const cardWidth = 190;
  const cardHeight = 275;

  const width =
    cardWidth * cards.length +
    spacing * (cards.length + 1);

  const height = 430;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GrootX Daily Market", width / 2, 45);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    const imagePath = path.join(
      __dirname,
      "..",
      "images",
      card.image
    );

    const x =
      spacing +
      i * (cardWidth + spacing);

    const y = 75;

    const image = await loadImage(imagePath);

    ctx.drawImage(
      image,
      x,
      y,
      cardWidth,
      cardHeight
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";

    ctx.fillText(
      card.name,
      x + cardWidth / 2,
      y + cardHeight + 30
    );

    ctx.font = "16px Arial";

    ctx.fillText(
      card.tier.toUpperCase(),
      x + cardWidth / 2,
      y + cardHeight + 55
    );

    ctx.fillText(
      `${card.price.toLocaleString()} coins`,
      x + cardWidth / 2,
      y + cardHeight + 80
    );
  }

  return canvas.toBuffer();
}

module.exports = createMarketImage;