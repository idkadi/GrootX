const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");
const { calculateBattlePower } = require("./battlePower");
const renderCard = require("./renderCard");
const abilityEngine = require("./abilityEngine");

try {
  registerFont(path.join(__dirname, "..", "fonts", "DejaVuSans.ttf"), {
    family: "BattleFont"
  });

  registerFont(path.join(__dirname, "..", "fonts", "DejaVuSans-Bold.ttf"), {
    family: "BattleFont",
    weight: "bold"
  });
} catch (err) {
  console.error("❌ Font load failed:", err.message);
}

const SIDES = ["left", "middle", "right"];

function safeText(text = "") {
  return String(text).replace(/[^\x20-\x7E]/g, "").trim();
}

function shortText(text, max = 18) {
  text = safeText(text);
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function font(size, bold = false) {
  return `${bold ? "bold " : ""}${size}px BattleFont, sans-serif`;
}

function getLocationCards(battle, side, userId) {
  return (battle.board?.[side] || []).filter(c => c.ownerId === userId);
}

function getLocationObject(battle, side) {
  return battle.locations[SIDES.indexOf(side)];
}

function getLocationPower(battle, side, userId) {
  if (battle.abilityState) return abilityEngine.locationPower(battle, side, userId);
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
  const cut = 42;

  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

async function drawLocation(ctx, location, x, y, w, h) {
  const imagePath = path.join(
    __dirname,
    "..",
    "images",
    "locations",
    location.image
  );

  if (fs.existsSync(imagePath)) {
    try {
      const img = await renderCard.loadAsset(imagePath);

      ctx.save();
      drawHex(ctx, x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      return;
    } catch {}
  }

  drawHex(ctx, x, y, w, h);
  ctx.fillStyle = "#211833";
  ctx.fill();
}

async function drawCard(ctx, item, x, y, w, h, battle) {
  if (!item?.card) return;
  if (item.pendingReveal || abilityEngine.isHidden(battle, item)) {
    ctx.fillStyle = "#172338"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#9b6cff"; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#ffffff"; ctx.font = font(12, true);
    ctx.fillText("HIDDEN", x + w / 2, y + h / 2);
    return;
  }
  try {
    const entry = { ...item.entry, ...item };
    delete entry.entry; delete entry.card;
    const season = entry.season ?? entry.cardSeason ?? item.card.season ?? 0;
    const image = await renderCard.thumbnail({ ...item.card, season }, item.serial ?? entry.serial ?? entry.serialNumber ?? "?", { ...entry, season }, w, h);
    ctx.drawImage(image, x, y, w, h);
    if (battle.abilityState) {
      ctx.fillStyle = "rgba(0,0,0,.85)"; ctx.fillRect(x + w - 35, y + 3, 32, 18);
      ctx.fillStyle = "#ffffff"; ctx.font = font(12, true);
      ctx.fillText(String(abilityEngine.cardPower(battle, item)), x + w - 19, y + 17);
    }
  } catch (error) {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(10);
    ctx.fillText(shortText(item.card.name, 14), x + w / 2, y + h / 2);
    console.error("Battle card render failed:", item.code, error.message);
  }
}

async function drawCardGrid(ctx, cards, centerX, y, battle) {
  const shown = cards.slice(0, 4);
  if (!shown.length) return;

  const cardW = 88;
  const cardH = 126;
  const gapX = 10;
  const gapY = 10;

  const positions = [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 }
  ];

  const totalW = cardW * 2 + gapX;
  const startX = centerX - totalW / 2;

  for (let i = 0; i < shown.length; i++) {
    const pos = positions[i];

    await drawCard(
      ctx,
      shown[i],
      startX + pos.col * (cardW + gapX),
      y + pos.row * (cardH + gapY),
      cardW,
      cardH,
      battle
    );
  }
}

async function createBattleImage(battle) {
  const width = 1150;
  const height = 1000;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#170a32");
  bg.addColorStop(0.5, "#231246");
  bg.addColorStop(1, "#070812");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = font(32, true);

  ctx.fillText(
    `${shortText(battle.player1Name, 20)} VS ${shortText(battle.player2Name, 20)}`,
    width / 2,
    62
  );

  ctx.font = font(28, true);
  ctx.fillText(`TURN ${battle.turn}/${battle.maxTurns}`, width / 2, 105);

  const locW = 270;
  const locH = 165;
  const startX = 95;
  const gap = 75;
  const locY = 430;

  for (let i = 0; i < 3; i++) {
    const side = SIDES[i];
    const location = getLocationObject(battle, side);

    const x = startX + i * (locW + gap);
    const centerX = x + locW / 2;

    const p1Cards = getLocationCards(battle, side, battle.player1Id);
    const p2Cards = getLocationCards(battle, side, battle.player2Id);

    await drawCardGrid(ctx, p1Cards, centerX, 125, battle);

    await drawLocation(ctx, location, x, locY, locW, locH);

    ctx.strokeStyle = "#9b6cff";
    ctx.lineWidth = 6;
    drawHex(ctx, x, locY, locW, locH);
    ctx.stroke();

    const p1Power = getLocationPower(battle, side, battle.player1Id);
    const p2Power = getLocationPower(battle, side, battle.player2Id);

    ctx.fillStyle = "#3b2a30";
    ctx.strokeStyle = "#c49a82";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.roundRect(centerX - 48, locY - 30, 96, 50, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = font(26, true);
    ctx.fillText(String(p1Power), centerX, locY + 4);

    ctx.fillStyle = "#ffffff";
    ctx.font = font(26, true);
    ctx.fillText(shortText(location.name, 15), centerX, locY + 95);

    ctx.fillStyle = "#3b2a30";
    ctx.strokeStyle = "#c49a82";

    ctx.beginPath();
    ctx.roundRect(centerX - 48, locY + locH - 20, 96, 50, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = font(26, true);
    ctx.fillText(String(p2Power), centerX, locY + locH + 14);

    await drawCardGrid(ctx, p2Cards, centerX, 660, battle);
  }

  return renderCard.encodePNG(canvas);
}

module.exports = createBattleImage;
