const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const locations = require("../data/locations");
const activeBattles = require("../data/activeBattles");

const getBattleDeck = require("../utils/getBattleDeck");
const createBattleImage = require("../utils/createBattleImage");
const createHandImage = require("../utils/createHandImage");
const { calculateBattlePower } = require("../utils/battlePower");

const SIDES = ["left", "middle", "right"];

function pickRandom(arr, count) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function makeBattleId() {
  return Math.random().toString(36).slice(2, 8);
}

function getGif(name) {
  const filePath = path.join(__dirname, "..", "images", "gifs", name);
  return fs.existsSync(filePath) ? filePath : null;
}

function getOpponentId(battle, userId) {
  return userId === battle.player1Id ? battle.player2Id : battle.player1Id;
}

function createBattleButtons(battle, finished = false) {
  if (finished) return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_open_${battle.id}`)
        .setLabel("Open Private Hand")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`battle_forfeit_${battle.id}`)
        .setLabel("Forfeit")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function makeBoardPayload(battle, content, finished = false) {
  const buffer = await createBattleImage(battle);

  return {
    content,
    files: [new AttachmentBuilder(buffer, { name: `battle_turn_${battle.turn}.png` })],
    components: createBattleButtons(battle, finished)
  };
}

function createCardButtons(battle, userId) {
  const hand = battle.hands[userId] || [];
  const rows = [];
  let row = new ActionRowBuilder();

  hand.slice(0, 5).forEach((item, index) => {
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_card_${battle.id}_${index}`)
        .setLabel(`${index + 1}. ${item.card.name.slice(0, 18)}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  if (row.components.length) rows.push(row);
  return rows;
}

function createLocationButtons(battle, cardIndex) {
  const row = new ActionRowBuilder();

  SIDES.forEach((side, i) => {
    const loc = battle.locations[i];

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_${cardIndex}_${side}`)
        .setLabel(loc.name || side)
        .setStyle(ButtonStyle.Success)
    );
  });

  return [row];
}

async function sendPrivateHand(interaction, battle) {
  const hand = battle.hands[interaction.user.id] || [];

  if (battle.pendingMoves[interaction.user.id]) {
    return interaction.reply({
      content: "✅ You already locked your move this turn. Wait for your opponent.",
      ephemeral: true
    });
  }

  if (!hand.length) {
    return interaction.reply({
      content: "You have no cards in hand.",
      ephemeral: true
    });
  }

  const buffer = await createHandImage(hand);

  return interaction.reply({
    content: `Turn ${battle.turn}/${battle.maxTurns} — Pick a card privately:`,
    files: [new AttachmentBuilder(buffer, { name: "hand.png" })],
    components: createCardButtons(battle, interaction.user.id),
    ephemeral: true
  });
}

function getLocationPower(battle, side, userId) {
  const location = battle.locations[SIDES.indexOf(side)];
  const locationCards = battle.board[side].filter(item => item.ownerId === userId);

  return locationCards.reduce((total, item) => {
    const result = calculateBattlePower(item.card, {
      serial: item.serial,
      cardsAtLocation: locationCards.map(c => c.card),
      location
    });

    return total + result.finalPower;
  }, 0);
}

function getWinner(battle) {
  let p1Wins = 0;
  let p2Wins = 0;
  let p1Total = 0;
  let p2Total = 0;

  for (const side of SIDES) {
    const p1 = getLocationPower(battle, side, battle.player1Id);
    const p2 = getLocationPower(battle, side, battle.player2Id);

    p1Total += p1;
    p2Total += p2;

    if (p1 > p2) p1Wins++;
    else if (p2 > p1) p2Wins++;
  }

  if (p1Wins > p2Wins) return battle.player1Id;
  if (p2Wins > p1Wins) return battle.player2Id;

  if (p1Total > p2Total) return battle.player1Id;
  if (p2Total > p1Total) return battle.player2Id;

  return null;
}

function drawCard(battle, userId) {
  const deck = battle.decks[userId];
  if (!deck || !deck.length) return;
  if ((battle.hands[userId] || []).length >= 5) return;

  battle.hands[userId].push(deck.shift());
}

async function sendNewBoardMessage(client, battle, content, finished = false) {
  const channel = await client.channels.fetch(battle.channelId);
  const payload = await makeBoardPayload(battle, content, finished);
  const msg = await channel.send(payload);
  battle.messageId = msg.id;
  return msg;
}

async function finishBattle(client, battle, winnerId, reason = "") {
  battle.finished = true;
  battle.winner = winnerId || null;

  activeBattles.delete(battle.player1Id);
  activeBattles.delete(battle.player2Id);

  const channel = await client.channels.fetch(battle.channelId);

  const text = winnerId
    ? `🏆 Battle finished! Winner: <@${winnerId}> ${reason}\n+500 Coins\n+5 Ultron Chips`
    : `🤝 Battle finished! It's a draw! ${reason}`;

  await sendNewBoardMessage(client, battle, text, true);

  const winGif = getGif("battle_win.gif");
  if (winGif && winnerId) {
    await channel.send({
      content: `🏆 <@${winnerId}> wins the GrootX Battle!`,
      files: [new AttachmentBuilder(winGif)]
    });
  }
}

async function revealIfBothLocked(interaction, battle) {
  const p1Move = battle.pendingMoves[battle.player1Id];
  const p2Move = battle.pendingMoves[battle.player2Id];

  if (!p1Move || !p2Move) {
    return sendNewBoardMessage(
      interaction.client,
      battle,
      `✅ <@${interaction.user.id}> locked their move.\nWaiting for the other player...`
    );
  }

  const revealed = [];

  for (const userId of [battle.player1Id, battle.player2Id]) {
    const move = battle.pendingMoves[userId];
    const hand = battle.hands[userId];

    if (!hand || !hand[move.cardIndex]) continue;

    const played = hand.splice(move.cardIndex, 1)[0];

    battle.board[move.side].push({
      ...played,
      ownerId: userId,
      revealedTurn: battle.turn
    });

    revealed.push(`<@${userId}> played **${played.card.name}** to **${move.side}**.`);
  }

  battle.pendingMoves = {
    [battle.player1Id]: null,
    [battle.player2Id]: null
  };

  drawCard(battle, battle.player1Id);
  drawCard(battle, battle.player2Id);

  const wasFinalTurn = battle.turn >= battle.maxTurns;

  if (wasFinalTurn) {
    battle.winner = getWinner(battle);
    return finishBattle(interaction.client, battle, battle.winner, "");
  }

  battle.turn++;

  return sendNewBoardMessage(
    interaction.client,
    battle,
    `🔁 Reveal complete!\n${revealed.join("\n")}\n\nTurn ${battle.turn}/${battle.maxTurns}: both players choose privately.`
  );
}

module.exports = {
  name: "battle",
  aliases: ["fight"],

  async execute(message, args) {
    const target = message.mentions.users.first();

    if (!target || target.bot || target.id === message.author.id) {
      return message.reply("Mention a real player to battle.");
    }

    if (activeBattles.has(message.author.id) || activeBattles.has(target.id)) {
      return message.reply("One of you is already in a battle.");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_accept_${message.author.id}_${target.id}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`battle_decline_${message.author.id}_${target.id}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const files = [];
    const challengeGif = getGif("battle_challenge.gif");
    if (challengeGif) files.push(new AttachmentBuilder(challengeGif));

    const msg = await message.channel.send({
      content: `<@${target.id}>, <@${message.author.id}> challenged you to a GrootX Battle!`,
      files,
      components: [row]
    });

    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== target.id) {
        return interaction.reply({
          content: "Only the challenged player can accept/decline.",
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith("battle_decline_")) {
        collector.stop();
        return interaction.update({
          content: "Battle declined.",
          files: [],
          components: []
        });
      }

      const p1DeckResult = await getBattleDeck(message.author.id);
      const p2DeckResult = await getBattleDeck(target.id);

      if (!p1DeckResult.ok) {
        return interaction.reply({
          content: `<@${message.author.id}> has no valid battle deck.`,
          ephemeral: true
        });
      }

      if (!p2DeckResult.ok) {
        return interaction.reply({
          content: `<@${target.id}> has no valid battle deck.`,
          ephemeral: true
        });
      }

      const p1Deck = [...p1DeckResult.cards].sort(() => Math.random() - 0.5);
      const p2Deck = [...p2DeckResult.cards].sort(() => Math.random() - 0.5);

      if (p1Deck.length < 5 || p2Deck.length < 5) {
        return interaction.reply({
          content: "Both players need at least 5 cards in their battle deck.",
          ephemeral: true
        });
      }

      const chosenLocations = pickRandom(locations, 3).map((loc, index) => ({
        ...loc,
        revealTurn: index + 1
      }));

      const battle = {
        id: makeBattleId(),

        player1Id: message.author.id,
        player2Id: target.id,

        player1Name: message.author.username,
        player2Name: target.username,

        channelId: message.channel.id,
        messageId: msg.id,

        turn: 1,
        maxTurns: 6,

        locations: chosenLocations,

        hands: {
          [message.author.id]: p1Deck.splice(0, 5),
          [target.id]: p2Deck.splice(0, 5)
        },

        decks: {
          [message.author.id]: p1Deck,
          [target.id]: p2Deck
        },

        pendingMoves: {
          [message.author.id]: null,
          [target.id]: null
        },

        board: {
          left: [],
          middle: [],
          right: []
        },

        finished: false,
        winner: null
      };

      activeBattles.set(message.author.id, battle);
      activeBattles.set(target.id, battle);

      collector.stop();

      await interaction.update({
        content: "✅ Battle accepted! Starting match...",
        files: [],
        components: []
      });

      return sendNewBoardMessage(
        interaction.client,
        battle,
        `⚔️ Battle started!\nTurn 1/${battle.maxTurns}: both players click **Open Private Hand** and lock secretly.`
      );
    });
  },

  async handleButton(interaction) {
    const battle = activeBattles.get(interaction.user.id);

    if (!battle) {
      return interaction.reply({
        content: "You are not in an active battle.",
        ephemeral: true
      });
    }

    if (battle.finished) {
      return interaction.reply({
        content: "This battle is already finished.",
        ephemeral: true
      });
    }

    if (interaction.customId === `battle_open_${battle.id}`) {
      return sendPrivateHand(interaction, battle);
    }

    if (interaction.customId === `battle_forfeit_${battle.id}`) {
      const winnerId = getOpponentId(battle, interaction.user.id);

      await interaction.reply({
        content: "🏳️ You forfeited the battle.",
        ephemeral: true
      });

      return finishBattle(interaction.client, battle, winnerId, `because <@${interaction.user.id}> forfeited.`);
    }

    if (interaction.customId.startsWith(`battle_card_${battle.id}_`)) {
      if (battle.pendingMoves[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your move this turn.",
          ephemeral: true
        });
      }

      const index = Number(interaction.customId.split("_").pop());
      const hand = battle.hands[interaction.user.id];

      if (!hand || !hand[index]) {
        return interaction.reply({
          content: "That card is not in your hand.",
          ephemeral: true
        });
      }

      return interaction.update({
        content: `Selected **${hand[index].card.name}**. Choose a location:`,
        files: [],
        components: createLocationButtons(battle, index)
      });
    }

    if (interaction.customId.startsWith(`battle_loc_${battle.id}_`)) {
      if (battle.pendingMoves[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your move this turn.",
          ephemeral: true
        });
      }

      const parts = interaction.customId.split("_");
      const side = parts.pop();
      const cardIndex = Number(parts.pop());

      if (!SIDES.includes(side)) {
        return interaction.reply({
          content: "Invalid location.",
          ephemeral: true
        });
      }

      const hand = battle.hands[interaction.user.id];

      if (!hand || !hand[cardIndex]) {
        return interaction.reply({
          content: "That card is no longer in your hand.",
          ephemeral: true
        });
      }

      battle.pendingMoves[interaction.user.id] = {
        cardIndex,
        side
      };

      await interaction.update({
        content: `✅ Move locked: **${hand[cardIndex].card.name}** to **${side}**.\nWaiting for opponent...`,
        files: [],
        components: []
      });

      return revealIfBothLocked(interaction, battle);
    }
  }
};
