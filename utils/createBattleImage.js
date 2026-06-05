const { createCanvas, loadImage } = require("canvas");
const path = require("path");

const { calculateBattlePower } = require("./battlePower");

const SIDES = ["left", "middle", "right"];

function shortText(text, max = 18) {
  text = String(text || "");
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function getLocationCards(battle, side, userId) {
  return battle.board[side].filter(c => c.ownerId === userId);
}

function getLocationObject(battle, side) {
  const index = SIDES.indexOf(side);
  return battle.locations[index];
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

async function drawCard(ctx, item, x, y, w, h) {
  if (!item) return;

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
    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x, y + h - 28, w, 28);

  ctx.fillStyle = "#ffffff";
  ctx.font = "13px Arial";
  ctx.fillText(`#${item.serial}`, x + 6, y + h - 10);
}

async function createBattleImage(battle) {
  const width = 1100;
  const height = 720;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111217";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.fillText("⚔️ GrootX Battle", 40, 50);

  ctx.font = "22px Arial";
  ctx.fillText(`Turn ${battle.turn}/${battle.maxTurns}`, 40, 85);

  ctx.fillText(
    `${battle.player1Name || "Player 1"} vs ${battle.player2Name || "Player 2"}`,
    780,
    55
  );

  const locW = 320;
  const locH = 155;
  const gap = 30;
  const startX = 40;
  const locY = 115;

  for (let i = 0; i < 3; i++) {
    const side = SIDES[i];
    const location = getLocationObject(battle, side);

    const x = startX + i * (locW + gap);

    const p1Power = getLocationPower(battle, side, battle.player1Id);
    const p2Power = getLocationPower(battle, side, battle.player2Id);

    ctx.fillStyle = "#20222b";
    ctx.fillRect(x, locY, locW, locH);

    ctx.strokeStyle = "#7b2cff";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, locY, locW, locH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial";
    ctx.fillText(shortText(location.name || location, 16), x + 18, locY + 40);

    ctx.font = "16px Arial";
    ctx.fillStyle = "#c7c7c7";
    ctx.fillText(shortText(location.description || "Location boost active", 30), x + 18, locY + 70);

    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${battle.player1Name || "P1"}: ${p1Power}`, x + 18, locY + 112);
    ctx.fillText(`${battle.player2Name || "P2"}: ${p2Power}`, x + 170, locY + 112);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px Arial";
  ctx.fillText(`${battle.player2Name || "Player 2"} Board`, 40, 320);

  ctx.fillText(`${battle.player1Name || "Player 1"} Board`, 40, 545);

  const cardW = 78;
  const cardH = 110;

  for (let i = 0; i < 3; i++) {
    const side = SIDES[i];
    const xBase = startX + i * (locW + gap);

    const p2Cards = getLocationCards(battle, side, battle.player2Id);
    const p1Cards = getLocationCards(battle, side, battle.player1Id);

    for (let j = 0; j < Math.min(p2Cards.length, 3); j++) {
      await drawCard(ctx, p2Cards[j], xBase + j * 88, 340, cardW, cardH);
    }

    for (let j = 0; j < Math.min(p1Cards.length, 3); j++) {
      await drawCard(ctx, p1Cards[j], xBase + j * 88, 565, cardW, cardH);
    }
  }

  return canvas.toBuffer();
}

module.exports = createBattleImage;