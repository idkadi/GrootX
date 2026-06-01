const {
  createCanvas,
  loadImage
} = require("canvas");

const path = require("path");

async function createDropImage(cards) {

  const cardWidth = 220;
  const cardHeight = 320;
  const spacing = 20;

  const width =
    (cardWidth * cards.length) +
    (spacing * (cards.length + 1));

  const height = 380;

  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  ctx.fillStyle =
    "#1e1f22";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

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

    // number overlay
    ctx.fillStyle =
      "rgba(0,0,0,0.75)";

    ctx.fillRect(
      x,
      25,
      40,
      40
    );

    ctx.fillStyle =
      "#ffffff";

    ctx.font =
      "bold 24px Arial";

    ctx.textAlign =
      "center";

    ctx.fillText(
      String(i + 1),
      x + 20,
      52
    );
  }

  return canvas.toBuffer();
}

module.exports =
  createDropImage;