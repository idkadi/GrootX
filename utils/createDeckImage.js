const { createCanvas, loadImage } = require("canvas");
const path = require("path");

async function createDeckImage(deckCards, username) {
  const cols = 5;
  const rows = 3;
  const spacing = 20;

  const cardWidth = 150;
  const cardHeight = 220;

  const topHeight = 95;
  const bottomHeight = 70;

  const width = cols * cardWidth + spacing * (cols + 1);
  const height = topHeight + rows * cardHeight + spacing * (rows + 1) + bottomHeight;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.fillText("⚔️ GROOTX BATTLE DECK", width / 2, 38);

  ctx.font = "18px Arial";
  ctx.fillText(`${username}'s 15 Card Deck`, width / 2, 68);

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

      ctx.fillStyle = "#777";
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("EMPTY", x + cardWidth / 2, y + cardHeight / 2);
      continue;
    }

    try {
      const imagePath = path.join(__dirname, "..", "images", item.card.image);
      const image = await loadImage(imagePath);

      ctx.drawImage(image, x, y, cardWidth, cardHeight);
    } catch {
      ctx.fillStyle = "#2b2d31";
      ctx.fillRect(x, y, cardWidth, cardHeight);

      ctx.fillStyle = "#fff";
      ctx.font = "16px Arial";
      ctx.textAlign = "center";
      ctx.fillText("Image Missing", x + cardWidth / 2, y + cardHeight / 2);
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(x, y + cardHeight - 42, cardWidth, 42);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`#${item.entry.serial}`, x + cardWidth / 2, y + cardHeight - 24);

    ctx.font = "bold 14px Arial";
    ctx.fillText(item.entry.code, x + cardWidth / 2, y + cardHeight - 7);
  }

  const legendary = deckCards.filter(x => x?.card?.tier?.toLowerCase() === "legendary").length;
  const epic = deckCards.filter(x => x?.card?.tier?.toLowerCase() === "epic").length;

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `📦 ${deckCards.length}/15   🌟 Legendary ${legendary}/5   💜 Epic ${epic}/7`,
    width / 2,
    height - 28
  );

  return canvas.toBuffer();
}

module.exports = createDeckImage;