const {
  createCanvas,
  loadImage
} = require("canvas");

const renderCard = require("./renderCard");

async function createDropImage(cards) {
  const spacing = 24;

  const cardWidth =
    cards.length === 4
      ? 190
      : 240;

  const cardHeight =
    cards.length === 4
      ? 270
      : 340;

  const width =
    (cardWidth * cards.length) +
    (spacing * (cards.length + 1));

  const height =
    cardHeight + 50;

  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    const cardBuffer = await renderCard(
      card,
      card.tier.toUpperCase()
    );

    const image = await loadImage(cardBuffer);

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

  return canvas.toBuffer("image/png");
}

module.exports = createDropImage;