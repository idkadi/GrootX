const {
  createCanvas,
  loadImage
} = require("canvas");

const renderCard = require("./renderCard");

async function createMarketImage(cards) {
  const spacing = 20;

  const cardWidth = 190;
  const cardHeight = 275;

  const width =
    cardWidth * cards.length +
    spacing * (cards.length + 1);

  const height = 385;

  const canvas = createCanvas(
    width,
    height
  );

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.textAlign = "center";

  ctx.fillText(
    "GrootX Daily Market • Season 1",
    width / 2,
    45
  );

  for (
    let i = 0;
    i < cards.length;
    i++
  ) {
    const card =
      cards[i];

    const x =
      spacing +
      i * (
        cardWidth +
        spacing
      );

    const y = 75;

    /*
     * MARKET IS SEASON 1 ONLY.
     *
     * This forces renderCard() to use:
     *
     * S1 rawImage
     * +
     * default tier frame
     * +
     * S1 name / appearance layout
     */

    const cardBuffer =
      await renderCard(
        {
          ...card,
          season: 1
        },

        card.serial ??
        card.tier.toUpperCase(),

        {
          season: 1
        }
      );

    const image =
      await loadImage(
        cardBuffer
      );

    ctx.drawImage(
      image,
      x,
      y,
      cardWidth,
      cardHeight
    );

    ctx.fillStyle =
      "#ffffff";

    ctx.font =
      "bold 18px Arial";

    ctx.textAlign =
      "center";

    ctx.fillText(
      `${card.price.toLocaleString()} coins`,
      x + cardWidth / 2,
      y + cardHeight + 35
    );
  }

  return canvas.toBuffer(
    "image/png"
  );
}

module.exports =
  createMarketImage;