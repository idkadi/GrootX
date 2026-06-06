const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");
const { calculateBattlePower } = require("./battlePower");

try {
  registerFont("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", {
    family: "DejaVuSans"
  });
  registerFont("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", {
    family: "DejaVuSans",
    weight: "bold"
  });
} catch (err) {
  console.log("Battle font load failed:", err.message);
}

const SIDES = ["left", "middle", "right"];

function cleanText(text = "") {
  return String(text).replace(/[^\x20-\x7E]/g, "").trim();
}

function shortText(text, max = 18) {
  text = cleanText(text);
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function isRevealed(battle, index) {
  const loc = battle.locations[index];
  return battle.turn >= (loc.revealTurn || index + 1);
}

function getLocationCards(battle, side, userId) {
  return (battle.board?.[side] || []).filter(c => c.ownerId === userId);
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

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawHexPath(ctx, x, y, w, h) {
  const cut = 52;
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h / 2);
  ctx.closePath();
}

async function drawLocationImage(ctx, location, x, y, w, h) {
  const imageName = location.image;
  if (!imageName) return false;

  const possiblePaths = [
    path.join(__dirname, "..", "assets", "locations", imageName),
    path.join(__dirname, "..", "images", "locations", imageName),
    path.join(__dirname, "..", "locations", imageName)
  ];

  const imagePath = possiblePaths.find(p => fs.existsSync(p));
  if (!imagePath) return false;

  try {
    const img = await loadImage(imagePath);
    ctx.save();
    drawHexPath(ctx, x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

async function createBattleImage(battle) {
  const width = 1150;
  const height = 680;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgPath = path.join(__dirname, "..", "assets", "battle_bg.jpg");
  if (fs.existsSync(bgPath)) {
    try {
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, width, height);
    } catch {
      ctx.fillStyle = "#101116";
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#150d2e");
    gradient.addColorStop(0.45, "#251440");
    gradient.addColorStop(1, "#070912");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px DejaVuSans";
  ctx.fillText(`${shortText(battle.player1Name, 16)} VS ${shortText(battle.player2Name, 16)}`, width / 2, 55);

  ctx.font = "bold 30px DejaVuSans";
  ctx.fillText(`TURN ${battle.turn}/${battle.maxTurns}`, width / 2, 100);

  const locW = 320;
  const locH = 250;
  const startX = 60;
  const gap = 35;
  const locY = 210;

  for (let i = 0; i < 3; i++) {
    const side = SIDES[i];
    const location = battle.locations[i];
    const x = startX + i * (locW + gap);
    const centerX = x + locW / 2;
    const revealed = isRevealed(battle, i);

    drawHexPath(ctx, x, locY, locW, locH);
    ctx.fillStyle = "#1a1530";
    ctx.fill();

    if (revealed) {
      const hasImage = await drawLocationImage(ctx, location, x, locY, locW, locH);
      if (!hasImage) {
        drawHexPath(ctx, x, locY, locW, locH);
        ctx.fillStyle = "#211833";
        ctx.fill();
      }
    } else {
      drawHexPath(ctx, x, locY, locW, locH);
      ctx.fillStyle = "#17152a";
      ctx.fill();
      ctx.fillStyle = "rgba(110,80,255,0.25)";
      ctx.fill();
    }

    drawHexPath(ctx, x, locY, locW, locH);
    ctx.strokeStyle = revealed ? "#9b6cff" : "#55506c";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.save();
    roundedRect(ctx, centerX - 75, locY - 26, 150, 54, 18);
    ctx.fillStyle = "#3b2a30";
    ctx.fill();
    ctx.strokeStyle = "#b68a73";
    ctx.lineWidth = 4;
    ctx.stroke();

    const p1Power = getLocationPower(battle, side, battle.player1Id);
    const p2Power = getLocationPower(battle, side, battle.player2Id);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px DejaVuSans";
    ctx.fillText(`${p1Power}`, centerX, locY + 11);
    ctx.restore();

    ctx.save();
    roundedRect(ctx, centerX - 75, locY + locH - 28, 150, 54, 18);
    ctx.fillStyle = "#3b2a30";
    ctx.fill();
    ctx.strokeStyle = "#b68a73";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px DejaVuSans";
    ctx.fillText(`${p2Power}`, centerX, locY + locH + 9);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px DejaVuSans";
    ctx.fillText(revealed ? shortText(location.name, 17) : "???", centerX, locY + 105);

    ctx.font = "bold 20px DejaVuSans";
    ctx.fillStyle = "#e9e4ff";
    ctx.fillText(
      revealed ? shortText(location.description || "", 26) : `Reveals Turn ${location.revealTurn || i + 1}`,
      centerX,
      locY + 145
    );

    ctx.font = "bold 22px DejaVuSans";
    ctx.fillStyle = "#cfd5ff";
    ctx.fillText(`${battle.player1Name}: ${p1Power}`, centerX, locY + 185);
    ctx.fillText(`${battle.player2Name}: ${p2Power}`, centerX, locY + 215);
  }

  return canvas.toBuffer("image/png");
}

module.exports = createBattleImage;
