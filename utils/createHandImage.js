const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createHandImage(hand = []) {
  const cardW = 140;
  const cardH = 200;
  const gap = 15;

  const width =
    hand.length * cardW +
    Math.max(0, hand.length - 1) * gap +
    50;

  const height = 290;

  const canvas = createCanvas(Math.max(width, 500), height);
  const ctx = canvas.getContext("2d");

  // background
  const bg = ctx.createLinearGradient(0, 0, canvas.width, height);
  bg.addColorStop(0, "#170a32");
  bg.addColorStop(0.5, "#231246");
  bg.addColorStop(1, "#070812");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, height);

  // title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px BattleFont";
  ctx.textAlign = "center";
  ctx.fillText("YOUR HAND", canvas.width / 2, 35);

  for (let i = 0; i < hand.length; i++) {
    const item = hand[i];

    const x = 25 + i * (cardW + gap);
    const y = 55;

    try {
      const imagePath = path.join(
        __dirname,
        "..",
        "images",
        item.card.image
      );

      const img = await loadImage(imagePath);

      // card image
      ctx.drawImage(img, x, y, cardW, cardH);

      // dark serial bar
      ctx.fillStyle = "rgba(0,0,0,0.80)";
      ctx.fillRect(
        x,
        y + cardH - 30,
        cardW,
        30
      );

      // card slot number
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 16px BattleFont";
      ctx.textAlign = "left";

      ctx.fillText(
        `${i + 1}`,
        x + 8,
        y + cardH - 10
      );

      // serial
      ctx.fillStyle = "#ffffff";

      ctx.fillText(
        `#${item.serial}`,
        x + 30,
        y + cardH - 10
      );

      // energy cost
      let cost = 1;

      const tier = (item.card.tier || "").toLowerCase();

      if (tier === "epic") cost = 2;
      if (tier === "legendary") cost = 3;

      ctx.beginPath();
      ctx.arc(x + 18, y + 18, 16, 0, Math.PI * 2);

      ctx.fillStyle = "#2b6fff";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px BattleFont";
      ctx.textAlign = "center";

      ctx.fillText(
        String(cost),
        x + 18,
        y + 24
      );

    } catch {
      continue;
    }
  }

  return canvas.toBuffer("image/png");
}

module.exports = createHandImage;