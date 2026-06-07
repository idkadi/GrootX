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
const MAX_CARDS_PER_LOCATION = 4;

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

function getCardCost(card) {
  const tier = (card?.tier || "").toLowerCase();

  if (tier === "legendary") return 3;
  if (tier === "epic") return 2;

  return 1;
}

function getTurnEnergy(battle) {
  return Math.min(battle.turn, 6);
}

function getUsedEnergy(battle, userId) {
  const selected = battle.tempSelections[userId] || [];
  const hand = battle.hands[userId] || [];

  return selected.reduce((total, move) => {
    const item = hand[move.cardIndex];
    if (!item) return total;

    return total + getCardCost(item.card);
  }, 0);
}

function getRemainingEnergy(battle, userId) {
  return getTurnEnergy(battle) - getUsedEnergy(battle, userId);
}

function getBoardCountAtLocation(battle, userId, side) {
  return (battle.board?.[side] || []).filter(
    item => item.ownerId === userId
  ).length;
}

function getTempCountAtLocation(battle, userId, side) {
  return (battle.tempSelections?.[userId] || []).filter(
    move => move.side === side
  ).length;
}

function isLocationFullForPlayer(battle, userId, side) {
  const cardsAlreadyThere = getBoardCountAtLocation(battle, userId, side);
  const cardsSelectedThere = getTempCountAtLocation(battle, userId, side);

  return cardsAlreadyThere + cardsSelectedThere >= MAX_CARDS_PER_LOCATION;
}

function formatSelectionText(battle, userId) {
  const selected = battle.tempSelections[userId] || [];
  const hand = battle.hands[userId] || [];

  if (!selected.length) return "No cards selected yet.";

  return selected
    .map((move, i) => {
      const item = hand[move.cardIndex];
      const name = item?.card?.name || "Unknown Card";
      const cost = item?.card ? getCardCost(item.card) : "?";

      return `${i + 1}. ${name} → ${move.side} (${cost} Energy)`;
    })
    .join("\n");
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
    files: [
      new AttachmentBuilder(buffer, {
        name: `battle_turn_${battle.turn}.png`
      })
    ],
    components: createBattleButtons(battle, finished)
  };
}

function createCardButtons(battle, userId) {
  const hand = battle.hands[userId] || [];
  const selected = battle.tempSelections[userId] || [];
  const selectedIndexes = selected.map(move => move.cardIndex);

  const rows = [];
  let row = new ActionRowBuilder();

  hand.slice(0, 5).forEach((item, index) => {
    const cost = getCardCost(item.card);
    const disabled =
      selectedIndexes.includes(index) ||
      cost > getRemainingEnergy(battle, userId);

    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_card_${battle.id}_${index}`)
        .setLabel(`${index + 1}. ${item.card.name.slice(0, 12)} (${cost})`)
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  });

  if (row.components.length) rows.push(row);

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_lock_${battle.id}`)
        .setLabel("Lock Turn")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!selected.length),

      new ButtonBuilder()
        .setCustomId(`battle_clear_${battle.id}`)
        .setLabel("Clear Picks")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!selected.length)
    )
  );

  return rows;
}

function createLocationButtons(battle, userId, cardIndex) {
  const row = new ActionRowBuilder();

  SIDES.forEach((side, i) => {
    const loc = battle.locations[i];
    const full = isLocationFullForPlayer(battle, userId, side);

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_${cardIndex}_${side}`)
        .setLabel(full ? `${loc.name || side} FULL` : loc.name || side)
        .setStyle(full ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(full)
    );
  });

  return [row];
}

async function sendPrivateHand(interaction, battle) {
  const userId = interaction.user.id;
  const hand = battle.hands[userId] || [];

  if (battle.lockedPlayers[userId]) {
    return interaction.reply({
      content: "✅ You already locked your turn. Wait for your opponent.",
      ephemeral: true
    });
  }

  if (!hand.length) {
    return interaction.reply({
      content: "You have no cards in hand.",
      ephemeral: true
    });
  }

  const energy = getTurnEnergy(battle);
  const remaining = getRemainingEnergy(battle, userId);

  const buffer = await createHandImage(hand);

  return interaction.reply({
    content:
      `Turn ${battle.turn}/${battle.maxTurns}\n` +
      `⚡ Energy: ${remaining}/${energy} remaining\n\n` +
      `Selected:\n${formatSelectionText(battle, userId)}\n\n` +
      `Pick a card, choose a location, then press **Lock Turn**.`,
    files: [
      new AttachmentBuilder(buffer, {
        name: "hand.png"
      })
    ],
    components: createCardButtons(battle, userId),
    ephemeral: true
  });
}

function getLocationPower(battle, side, userId) {
  const location = battle.locations[SIDES.indexOf(side)];

  const locationCards = battle.board[side].filter(
    item => item.ownerId === userId
  );

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
  const p1Locked = battle.lockedPlayers[battle.player1Id];
  const p2Locked = battle.lockedPlayers[battle.player2Id];

  if (!p1Locked || !p2Locked) {
    return sendNewBoardMessage(
      interaction.client,
      battle,
      `✅ <@${interaction.user.id}> locked their turn.\nWaiting for the other player...`
    );
  }

  const revealed = [];

  for (const userId of [battle.player1Id, battle.player2Id]) {
    const moves = battle.pendingMoves[userId] || [];
    const hand = battle.hands[userId];

    const sortedMoves = [...moves].sort((a, b) => b.cardIndex - a.cardIndex);

    for (const move of sortedMoves) {
      if (!hand || !hand[move.cardIndex]) continue;

      const currentCount = getBoardCountAtLocation(
        battle,
        userId,
        move.side
      );

      if (currentCount >= MAX_CARDS_PER_LOCATION) {
        revealed.push(
          `<@${userId}> could not play a card to **${move.side}** because it is full.`
        );
        continue;
      }

      const played = hand.splice(move.cardIndex, 1)[0];

      battle.board[move.side].push({
        ...played,
        ownerId: userId,
        revealedTurn: battle.turn
      });

      revealed.push(
        `<@${userId}> played **${played.card.name}** to **${move.side}**.`
      );
    }
  }

  battle.pendingMoves = {
    [battle.player1Id]: [],
    [battle.player2Id]: []
  };

  battle.tempSelections = {
    [battle.player1Id]: [],
    [battle.player2Id]: []
  };

  battle.lockedPlayers = {
    [battle.player1Id]: false,
    [battle.player2Id]: false
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
    `🔁 Reveal complete!\n${revealed.join("\n") || "No cards were played."}\n\n` +
      `Turn ${battle.turn}/${battle.maxTurns}: both players have **${getTurnEnergy(battle)} Energy**.`
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

    const collector = msg.createMessageComponentCollector({
      time: 60000
    });

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
          content:
            `<@${message.author.id}> has no valid battle deck.\n` +
            `They need exactly **12 valid cards**.`,
          ephemeral: true
        });
      }

      if (!p2DeckResult.ok) {
        return interaction.reply({
          content:
            `<@${target.id}> has no valid battle deck.\n` +
            `They need exactly **12 valid cards**.`,
          ephemeral: true
        });
      }

      const p1Deck = [...p1DeckResult.cards].sort(() => Math.random() - 0.5);
      const p2Deck = [...p2DeckResult.cards].sort(() => Math.random() - 0.5);

      if (p1Deck.length !== 12 || p2Deck.length !== 12) {
        return interaction.reply({
          content: "Both players need exactly **12 cards** in their battle deck.",
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
          [message.author.id]: [],
          [target.id]: []
        },

        tempSelections: {
          [message.author.id]: [],
          [target.id]: []
        },

        lockedPlayers: {
          [message.author.id]: false,
          [target.id]: false
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
        `⚔️ Battle started!\n` +
          `Turn 1/${battle.maxTurns}: both players have **1 Energy**.\n` +
          `Common/Uncommon/Rare = 1 Energy • Epic = 2 • Legendary = 3\n` +
          `Max ${MAX_CARDS_PER_LOCATION} cards per location.`
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

      return finishBattle(
        interaction.client,
        battle,
        winnerId,
        `because <@${interaction.user.id}> forfeited.`
      );
    }

    if (interaction.customId === `battle_clear_${battle.id}`) {
      if (battle.lockedPlayers[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your turn.",
          ephemeral: true
        });
      }

      battle.tempSelections[interaction.user.id] = [];

      return interaction.update({
        content:
          `Turn ${battle.turn}/${battle.maxTurns}\n` +
          `⚡ Energy: ${getTurnEnergy(battle)}/${getTurnEnergy(battle)} remaining\n\n` +
          `Selected:\nNo cards selected yet.\n\n` +
          `Pick a card, choose a location, then press **Lock Turn**.`,
        files: [],
        components: createCardButtons(battle, interaction.user.id)
      });
    }

    if (interaction.customId === `battle_lock_${battle.id}`) {
      if (battle.lockedPlayers[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your turn.",
          ephemeral: true
        });
      }

      const selected = battle.tempSelections[interaction.user.id] || [];

      if (!selected.length) {
        return interaction.reply({
          content: "Select at least one card before locking.",
          ephemeral: true
        });
      }

      battle.pendingMoves[interaction.user.id] = selected;
      battle.lockedPlayers[interaction.user.id] = true;

      await interaction.update({
        content:
          `✅ Turn locked!\n\n` +
          `Your plays:\n${formatSelectionText(battle, interaction.user.id)}\n\n` +
          `Waiting for opponent...`,
        files: [],
        components: []
      });

      return revealIfBothLocked(interaction, battle);
    }

    if (interaction.customId.startsWith(`battle_card_${battle.id}_`)) {
      if (battle.lockedPlayers[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your turn.",
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

      const alreadySelected = (battle.tempSelections[interaction.user.id] || [])
        .some(move => move.cardIndex === index);

      if (alreadySelected) {
        return interaction.reply({
          content: "You already selected that card this turn.",
          ephemeral: true
        });
      }

      const cost = getCardCost(hand[index].card);

      if (cost > getRemainingEnergy(battle, interaction.user.id)) {
        return interaction.reply({
          content: `Not enough energy. This card costs **${cost} Energy**.`,
          ephemeral: true
        });
      }

      return interaction.update({
        content:
          `Selected **${hand[index].card.name}** (${cost} Energy).\n` +
          `Choose a location:`,
        files: [],
        components: createLocationButtons(battle, interaction.user.id, index)
      });
    }

    if (interaction.customId.startsWith(`battle_loc_${battle.id}_`)) {
      if (battle.lockedPlayers[interaction.user.id]) {
        return interaction.reply({
          content: "You already locked your turn.",
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

      if (isLocationFullForPlayer(battle, interaction.user.id, side)) {
        return interaction.reply({
          content: `❌ This location is full. Max **${MAX_CARDS_PER_LOCATION} cards** per location.`,
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

      const alreadySelected = (battle.tempSelections[interaction.user.id] || [])
        .some(move => move.cardIndex === cardIndex);

      if (alreadySelected) {
        return interaction.reply({
          content: "You already selected that card this turn.",
          ephemeral: true
        });
      }

      const cost = getCardCost(hand[cardIndex].card);

      if (cost > getRemainingEnergy(battle, interaction.user.id)) {
        return interaction.reply({
          content: `Not enough energy. This card costs **${cost} Energy**.`,
          ephemeral: true
        });
      }

      battle.tempSelections[interaction.user.id].push({
        cardIndex,
        side
      });

      const energy = getTurnEnergy(battle);
      const remaining = getRemainingEnergy(battle, interaction.user.id);

      return interaction.update({
        content:
          `✅ Added **${hand[cardIndex].card.name}** to **${side}**.\n\n` +
          `⚡ Energy: ${remaining}/${energy} remaining\n\n` +
          `Selected:\n${formatSelectionText(battle, interaction.user.id)}\n\n` +
          `Pick another card or press **Lock Turn**.`,
        files: [],
        components: createCardButtons(battle, interaction.user.id)
      });
    }
  }
};