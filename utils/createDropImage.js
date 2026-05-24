const {
  createCanvas,
  loadImage
} = require("canvas");

const path = require("path");

async function createDropImage(cards) {

  // SMALLER CLEANER SIZE
  const cardWidth = 220;
  const cardHeight = 320;

  const spacing = 20;

  const width =
    (cardWidth * 3) +
    (spacing * 4);

  const height = 380;

  // CANVAS
  const canvas =
    createCanvas(width, height);

  const ctx =
    canvas.getContext("2d");

  // BACKGROUND
  ctx.fillStyle =
    "#1e1f22";

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  // CARD POSITIONS
  const positions = [

    spacing,

    spacing * 2 +
    cardWidth,

    spacing * 3 +
    (cardWidth * 2)

  ];

  // DRAW CARDS
  for (let i = 0; i < cards.length; i++) {

    const card =
      cards[i];

    // IMAGE PATH
    const imagePath =
      path.join(

        __dirname,
        "..",
        "images",
        card.image

      );

    // LOAD IMAGE
    const image =
      await loadImage(
        imagePath
      );

    // DRAW IMAGE
    ctx.drawImage(

      image,

      positions[i],

      25,

      cardWidth,

      cardHeight

    );

  }

  // FINAL IMAGE
  return canvas.toBuffer();

}

module.exports =
  createDropImage;