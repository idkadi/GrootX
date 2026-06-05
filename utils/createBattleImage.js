const {
  createCanvas,
  loadImage,
  registerFont
} = require("canvas");

const path = require("path");
const { calculateBattlePower } = require("./battlePower");

try {
  registerFont("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", {
    family: "BattleFont"
  });
} catch {}

const SIDES = ["left", "middle", "right"];

function cleanText(text = "") {
  return String(text)
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function shortText(text, max = 18) {
  text = cleanText(text);
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function getLocationCards(battle, side, userId) {
  return battle.board[side].filter(c => c.ownerId === userId);
}

function getLocationObject(battle, side) {
  return battle.locations[SIDES.indexOf(side)];
}

function getLocationPower(battle, side, userId) {
  const locationCards = getLocationCards(battle, side, userId);
  const location = getLocationObject(battle, side);

  return locationCards.reduce((total, item) => {
    const result = calculateBattlePower(item.card, {
      serial: item.serial,
      cardsAtLocation: locationCards.map(c => c.card),
      location
    });

    return total + result.finalPower;
  }, 0);
}

function drawHex(ctx, x, y, w, h) {
  const cut = 35;

  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

async function drawCard(ctx, item, x, y, w, h) {
  if (!item || !item.card) return;

  try {
    const imagePath = path.join(
      __dirname,
      "..",
      "images",
      item.card.image
    );

    const img = await loadImage(imagePath);
    ctx.drawImage(img, x, y, w, h);
  } catch {
    return;
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x, y + h - 26, w, 26);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 13px BattleFont";
  ctx.fillText(`#${item.serial}`, x + 6, y + h - 9);
}

async function drawCardsRow(ctx, cards, centerX, y) {
  const cardW = 95;
  const cardH = 135;
  const gap = 8;

  const shown = cards.slice(0, 3);
  const totalW =
    shown.length * cardW +
    Math.max(0, shown.length - 1) * gap;

  const startX = centerX - totalW / 2;

  for (let i = 0; i < shown.length; i++) {
    await drawCard(
      ctx,
      shown[i],
      startX + i * (cardW + gap),
      y,
      cardW,
      cardH
    );
  }
}

async function createBattleImage(battle) {
  const width = 1150;
  const height = 720;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#101116";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px BattleFont";
  ctx.fillText("GrootX Battle", 40, 48);

  ctx.font = "22px BattleFont";
  ctx.fillText(`Turn ${battle.turn}/${battle.maxTurns}`, 40, 82);

  ctx.font = "bold 24px BattleFont";
  ctx.fillText(cleanText(battle.player1Name || "Player 1"), 450, 52);

  ctx.font = "20px BattleFont";
  ctx.fillText("VS", 555, 82);

  ctx.font = "bold 24px BattleFont";
  ctx.fillText(cleanText(battle.player2Name || "Player 2"), 610, 52);

  const colW = 340;
  const gap = 25;
  const startX = 45;

  const p1CardY = 115;
  const locY = 280;
  const p2CardY = 455;

  const locW = 300;
  const locH = 115;

  for (let i = 0; i < 3; i++) {
    const side = SIDES[i];
    const x = startX + i * (colW + gap);
    const centerX = x + colW / 2;

    const location = getLocationObject(battle, side);

    const p1Cards = getLocationCards(
      battle,
      side,
      battle.player1Id
    );

    const p2Cards = getLocationCards(
      battle,
      side,
      battle.player2Id
    );

    await drawCardsRow(ctx, p1Cards, centerX, p1CardY);

    const hexX = centerX - locW / 2;

    drawHex(ctx, hexX, locY, locW, locH);
    ctx.fillStyle = "#211833";
    ctx.fill();

    ctx.strokeStyle = "#8f5cff";
    ctx.lineWidth = 4;
    ctx.stroke();

    const p1Power = getLocationPower(
      battle,
      side,
      battle.player1Id
    );

    const p2Power = getLocationPower(
      battle,
      side,
      battle.player2Id
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 25px BattleFont";
    ctx.textAlign = "center";
    ctx.fillText(
      shortText(location.name || location, 18),
      centerX,
      locY + 38
    );

    ctx.font = "bold 30px BattleFont";
    ctx.fillText(`${p1Power} - ${p2Power}`, centerX, locY + 78);

    ctx.font = "14px BattleFont";
    ctx.fillStyle = "#cfc6ff";
    ctx.fillText(
      shortText(location.description || "Location boost", 32),
      centerX,
      locY + 101
    );

    ctx.textAlign = "left";

    await drawCardsRow(ctx, p2Cards, centerX, p2CardY);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px BattleFont";

  ctx.fillText(
    `${cleanText(battle.player1Name || "Player 1")} cards`,
    40,
    110
  );

  ctx.fillText(
    `${cleanText(battle.player2Name || "Player 2")} cards`,
    40,
    650
  );

  return canvas.toBuffer();
}

module.exports = createBattleImage;