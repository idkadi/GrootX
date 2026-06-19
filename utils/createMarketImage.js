const { createCanvas, loadImage } = require("canvas");
const path = require("path");

module.exports = async function createMarketImage(cards) {
  const canvas = createCanvas(1200, 560);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GrootX Daily Market", 600, 55);

  const cardW = 190;
  const cardH = 285;
  const gap = 35;
  const startX = 65;
  const y = 110;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const x = startX + i * (cardW + gap);

    ctx.fillStyle = "#151515";
    ctx.roundRect(x - 10, y - 10, cardW + 20, cardH + 120, 18);
    ctx.fill();

    try {
      const imgPath = path.resolve(
        __dirname,
        "..",
        "images",
        card.image
      );

      console.log("Market loading:", card.name, imgPath);

      const img = await loadImage(imgPath);
      ctx.drawImage(img, x, y, cardW, cardH);
    } catch (err) {
      console.log("Market image failed:", card.name, card.image, err.message);

      ctx.fillStyle = "#333333";
      ctx.fillRect(x, y, cardW, cardH);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Arial";
      ctx.fillText("IMAGE", x + cardW / 2, y + cardH / 2 - 10);
      ctx.fillText("MISSING", x + cardW / 2, y + cardH / 2 + 20);
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Arial";
    ctx.fillText(card.name, x + cardW / 2, y + cardH + 32);

    ctx.font = "18px Arial";
    ctx.fillText(card.tier.toUpperCase(), x + cardW / 2, y + cardH + 62);

    ctx.font = "18px Arial";
    ctx.fillText(`${card.price.toLocaleString()} coins`, x + cardW / 2, y + cardH + 92);
  }

  return canvas.toBuffer("image/png");
};