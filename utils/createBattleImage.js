const { createCanvas } = require("canvas");

async function createBattleImage(battle) {
  const width = 900;
  const height = 620;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GROOTX BATTLE", width / 2, 40);

  ctx.font = "20px Arial";
  ctx.fillText(
    `${battle.usernames.p1} vs ${battle.usernames.p2}  |  Turn ${battle.turn}/${battle.maxTurns}`,
    width / 2,
    72
  );

  const locations = [
    battle.board.location1,
    battle.board.location2,
    battle.board.location3
  ];

  const boxWidth = 260;
  const boxHeight = 430;
  const spacing = 25;
  const startX = 45;
  const startY = 120;

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];

    const x = startX + i * (boxWidth + spacing);
    const y = startY;

    ctx.fillStyle = "#2b2d31";
    ctx.fillRect(x, y, boxWidth, boxHeight);

    ctx.strokeStyle = "#555";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(loc.name, x + boxWidth / 2, y + 35);

    ctx.font = "16px Arial";
    ctx.fillText(battle.usernames.p2, x + boxWidth / 2, y + 75);

    ctx.fillStyle = "#3a3c43";
    ctx.fillRect(x + 20, y + 90, boxWidth - 40, 120);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.fillText("0 Power", x + boxWidth / 2, y + 160);

    ctx.strokeStyle = "#777";
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 230);
    ctx.lineTo(x + boxWidth - 20, y + 230);
    ctx.stroke();

    ctx.font = "16px Arial";
    ctx.fillText(battle.usernames.p1, x + boxWidth / 2, y + 265);

    ctx.fillStyle = "#3a3c43";
    ctx.fillRect(x + 20, y + 280, boxWidth - 40, 120);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.fillText("0 Power", x + boxWidth / 2, y + 350);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Battle v1: play cards into 3 locations. Win 2 locations to win.", width / 2, 590);

  return canvas.toBuffer();
}

module.exports = createBattleImage;