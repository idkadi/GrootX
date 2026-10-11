const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const cards = require("../data/cards");
const locations = require("../data/locations");
const activeBattles = require("../data/activeBattles");

const connectDB = require("../database");
const createBattleImage = require("../utils/createBattleImage");
const createHandImage = require("../utils/createHandImage");
const abilityEngine = require("../utils/abilityEngine");
const abilityUI = require("../utils/abilityUI");
const weaponUI = require("../utils/weaponUI");
const getBattleDeck = require("../utils/getBattleDeck");
const { resolveEntry } = require("../utils/battleCatalogue");
const updateRanked = require("../utils/updateRanked");

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

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function getCardData(cardId) {
  return cards.find(c => Number(c.id) === Number(cardId));
}

function getCardCost(card) {
  const tier = (card?.tier || "").toLowerCase();

  if (tier === "legendary") return 3;
  if (tier === "epic") return 2;

  return 1;
}

function getTurnEnergy(battle) {
  return Math.min(battle.turn + 1, 7);
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

function createDefaultDecks(oldCards = []) {
  return {
    "1": {
      unlocked: true,
      name: "Deck 1",
      cards: (oldCards || []).map(normalizeCode)
    },
    "2": {
      unlocked: false,
      name: "Deck 2",
      cards: []
    },
    "3": {
      unlocked: false,
      name: "Deck 3",
      cards: []
    }
  };
}

async function ensureDeckDoc(decksCol, userId) {
  let deckDoc = await decksCol.findOne({ userId });

  if (!deckDoc) {
    deckDoc = {
      userId,
      activeDeck: 1,
      decks: createDefaultDecks()
    };

    await decksCol.insertOne(deckDoc);
    return deckDoc;
  }

  if (!deckDoc.decks) {
    deckDoc.decks = createDefaultDecks(deckDoc.cards || []);
    deckDoc.activeDeck = deckDoc.activeDeck || 1;

    await decksCol.updateOne(
      { userId },
      {
        $set: {
          decks: deckDoc.decks,
          activeDeck: deckDoc.activeDeck
        },
        $unset: {
          cards: ""
        }
      }
    );
  }

  for (const deckNo of ["1", "2", "3"]) {
    if (!deckDoc.decks[deckNo]) {
      deckDoc.decks[deckNo] = {
        unlocked: deckNo === "1",
        name: `Deck ${deckNo}`,
        cards: []
      };
    }

    deckDoc.decks[deckNo].cards =
      (deckDoc.decks[deckNo].cards || []).map(normalizeCode);
  }

  if (!deckDoc.activeDeck) deckDoc.activeDeck = 1;

  await decksCol.updateOne(
    { userId },
    {
      $set: {
        decks: deckDoc.decks,
        activeDeck: deckDoc.activeDeck
      }
    }
  );

  return deckDoc;
}

async function getBattleDeckFromSlot(userId, deckNo) {
  const db = await connectDB();
  await ensureDeckDoc(db.collection("decks"), userId);
  return getBattleDeck(userId, deckNo);
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
  if (battle.phase === "ability_choice") return abilityUI.boardButtons(battle);
  if (battle.phase !== "playing") return [];

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_open_${battle.id}`)
        .setLabel("Open Private Hand")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`battle_abintel_${battle.id}`)
        .setLabel("Private Intel / Reveal Sue")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`battle_weaponopen_${battle.id}`)
        .setLabel("Weapons")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(battle.turn < 2),

      new ButtonBuilder()
        .setCustomId(`battle_forfeit_${battle.id}`)
        .setLabel("Forfeit")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function createDeckPickButtons(battle) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_pickdeck_${battle.id}_1`)
        .setLabel("Deck 1")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`battle_pickdeck_${battle.id}_2`)
        .setLabel("Deck 2")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`battle_pickdeck_${battle.id}_3`)
        .setLabel("Deck 3")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

async function makeDeckSelectPayload(battle) {
  const buffer = await createBattleImage(battle);

  return {
    content:
      `🌍 **Locations Revealed**\n\n` +
      `<@${battle.player1Id}> and <@${battle.player2Id}>, choose your deck.\n` +
      `Battle starts after both players choose.`,
    files: [
      new AttachmentBuilder(buffer, {
        name: "battle_locations.png"
      })
    ],
    components: createDeckPickButtons(battle)
  };
}

async function makeBoardPayload(battle, content, finished = false) {
  const buffer = await createBattleImage(battle);

  return {
    content: (content + (battle.abilityState?.log.length ? "\n\n**Abilities**\n" + battle.abilityState.log.slice(-6).map(e => e.text).join("\n") : "")).slice(0, 2000),
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

  hand.slice(0, 12).forEach((item, index) => {
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
        .setLabel("Lock Turn / Pass")
        .setStyle(ButtonStyle.Success)
        .setDisabled(false),

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
    const full = isLocationFullForPlayer(battle, userId, side) || !abilityEngine.canPlace(battle, userId, side);

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

  if (battle.phase !== "playing") {
    return interaction.reply({
      content: "Deck selection is still going on.",
      ephemeral: true
    });
  }

  const hand = battle.hands[userId] || [];

  if (battle.lockedPlayers[userId]) {
    return interaction.reply({
      content: "✅ You already locked your turn. Wait for your opponent.",
      ephemeral: true
    });
  }

  if (!hand.length) {
    return interaction.reply({
      content: "No cards in hand. You can pass this round.",
      ephemeral: true, components: createCardButtons(battle, userId)
    });
  }

  const energy = getTurnEnergy(battle);
  const remaining = getRemainingEnergy(battle, userId);

  await interaction.deferReply({ ephemeral: true });
  const buffer = await createHandImage(hand);

  return interaction.editReply({
    content:
      `Turn ${battle.turn}/${battle.maxTurns}\n` +
      `⚡ Energy: ${remaining}/${energy} remaining\n\n` +
      `Selected:\n${formatSelectionText(battle, userId)}\n\n` +
      (`Pick a card, choose a location, then press **Lock Turn**.\n` + abilityEngine.privateIntel(battle, userId)).slice(0, 1800),
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
  return abilityEngine.locationPower(battle, side, userId);
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
  if (battle.finishing) return;
  battle.finishing = true;
  battle.finished = true;
  battle.winner = winnerId || null;

  activeBattles.delete(battle.player1Id);
  activeBattles.delete(battle.player2Id);

  const channel = await client.channels.fetch(battle.channelId);

  let text;

  if (winnerId) {
    const loserId =
      winnerId === battle.player1Id
        ? battle.player2Id
        : battle.player1Id;

    let rankedText = "";

    try {
      const ranked = await updateRanked(winnerId, loserId);

      rankedText =
        `\n\n🏅 **Ranked Update**\n` +
        `<@${winnerId}>: **+${ranked.winGain}** trophies\n` +
        `<@${loserId}>: **${ranked.lossAmount}** trophies\n\n` +
        `<@${winnerId}> now has **${ranked.winnerTrophies}** trophies.\n` +
        `<@${loserId}> now has **${ranked.loserTrophies}** trophies.` +
        (ranked.rewardsText || "");
    } catch (err) {
      console.error("Ranked update failed:", err);
      rankedText = `\n\n⚠️ Ranked trophies could not be updated.`;
    }

    text =
      `🏆 Battle finished! Winner: <@${winnerId}> ${reason}` +
      rankedText;
  } else {
    text = `🤝 Battle finished! It's a draw! ${reason}`;
  }

  await sendNewBoardMessage(client, battle, text, true);

  const winGif = getGif("battle_win.gif");

  if (winGif && winnerId) {
    await channel.send({
      content: `🏆 <@${winnerId}> wins the GrootX Battle!`,
      files: [new AttachmentBuilder(winGif)]
    });
  }
}

async function startBattleAfterDeckSelection(interaction, battle) {
  const p1DeckNo = battle.selectedDecks[battle.player1Id];
  const p2DeckNo = battle.selectedDecks[battle.player2Id];

  if (!p1DeckNo || !p2DeckNo || battle.starting || battle.phase !== "deck_select") return;
  battle.starting = true;
  try {

  const p1DeckResult = await getBattleDeckFromSlot(battle.player1Id, p1DeckNo);
  const p2DeckResult = await getBattleDeckFromSlot(battle.player2Id, p2DeckNo);

  if (!p1DeckResult.ok) {
    activeBattles.delete(battle.player1Id);
    activeBattles.delete(battle.player2Id);

    return interaction.channel.send(
      `❌ Battle cancelled.\n<@${battle.player1Id}>: ${p1DeckResult.reason}`
    );
  }

  if (!p2DeckResult.ok) {
    activeBattles.delete(battle.player1Id);
    activeBattles.delete(battle.player2Id);

    return interaction.channel.send(
      `❌ Battle cancelled.\n<@${battle.player2Id}>: ${p2DeckResult.reason}`
    );
  }

  const p1Deck = [...p1DeckResult.cards].sort(() => Math.random() - 0.5);
  const p2Deck = [...p2DeckResult.cards].sort(() => Math.random() - 0.5);

  battle.phase = "playing";

  battle.turn = 1;
  battle.maxTurns = 6;

  battle.hands = {
    [battle.player1Id]: p1Deck.splice(0, 5),
    [battle.player2Id]: p2Deck.splice(0, 5)
  };

  battle.decks = {
    [battle.player1Id]: p1Deck,
    [battle.player2Id]: p2Deck
  };

  battle.selectedDeckNames = {
    [battle.player1Id]: p1DeckResult.deckName,
    [battle.player2Id]: p2DeckResult.deckName
  };

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

  battle.finished = false;
  battle.winner = null;
  const db = await connectDB();
  const collectionCandidates = {};
  for (const userId of [battle.player1Id, battle.player2Id]) {
    const entries = await db.collection("collections").find({ userId }).toArray();
    collectionCandidates[userId] = entries.flatMap(entry => {
      const record = resolveEntry(entry);
      return record ? [{ entry: { ...entry, season: record.season, event: record.event },
        card: { ...record.card, season: record.season, event: record.event },
        code: entry.code, serial: entry.serial ?? entry.serialNumber }] : [];
    });
  }
  abilityEngine.initBattle(battle, { locationPool: locations, collectionCandidates });
  await weaponUI.loadInventory(battle, db);
  return await sendNewBoardMessage(
    interaction.client,
    battle,
    `⚔️ Battle started!\n\n` +
    `<@${battle.player1Id}> chose **${p1DeckResult.deckName}**.\n` +
    `<@${battle.player2Id}> chose **${p2DeckResult.deckName}**.\n\n` +
    `Turn 1/${battle.maxTurns}: both players have **2 Energy**.`
  );
  } catch (error) {
    activeBattles.delete(battle.player1Id);
    activeBattles.delete(battle.player2Id);
    throw error;
  } finally {
    battle.starting = false;
  }

}

async function completeAbilityTurn(client, battle) {
  if (battle.finished || battle.completingTurn) return;
  battle.completingTurn = true;
  try {
    abilityEngine.endTurn(battle);
    const final = battle.turn >= battle.maxTurns;
    if (final) return await finishBattle(client, battle, getWinner(battle), "");
    drawCard(battle, battle.player1Id);
    drawCard(battle, battle.player2Id);
    battle.turn++;
    abilityEngine.startTurn(battle);
    if (battle.turn === battle.maxTurns) {
      for (const userId of [battle.player1Id, battle.player2Id]) {
        battle.hands[userId].push(...battle.decks[userId].splice(0));
      }
    }
    battle.phase = "playing";
    return await sendNewBoardMessage(client, battle,
      `🔁 Reveal complete!\nTurn ${battle.turn}/${battle.maxTurns}: both players have **${getTurnEnergy(battle)} Energy**.` +
      (battle.turn === battle.maxTurns ? "\n🔥 Final turn: all remaining cards drawn." : ""));
  } finally { battle.completingTurn = false; }
}

async function resumeAbilities(client, battle, advance = true) {
  if (battle.finished) return;
  const request = advance ? abilityEngine.nextRequest(battle) : battle.abilityState?.request;
  if (request) {
    battle.phase = "ability_choice";
    return sendNewBoardMessage(client, battle,
      `🎯 <@${request.ownerId}>, press **Choose Ability Target** to resolve your card. Choices are private.`);
  }
  if (advance) return completeAbilityTurn(client, battle);
  return sendNewBoardMessage(client, battle, "Battle board updated.");
}

async function revealIfBothLocked(interaction, battle) {
  if (!battle.lockedPlayers[battle.player1Id] || !battle.lockedPlayers[battle.player2Id]) {
    return sendNewBoardMessage(interaction.client, battle,
      `✅ <@${interaction.user.id}> locked their turn. Waiting for the other player...`);
  }
  if (battle.revealing || battle.phase !== "playing") return;
  battle.revealing = true;
  battle.phase = "ability_choice";
  try {
    const queues = {};
    for (const userId of [battle.player1Id, battle.player2Id]) {
      const moves = battle.pendingMoves[userId] || [];
      const hand = battle.hands[userId];
      const planned = moves.map(move => ({ ...move, item: hand[move.cardIndex] }));
      queues[userId] = [];
      for (const move of planned) {
        if (!move.item || !abilityEngine.canPlace(battle, userId, move.side)) continue;
        const index = hand.indexOf(move.item);
        if (index < 0) continue;
        hand.splice(index, 1);
        const played = move.item;
        abilityEngine.prepareItem(battle, played, userId);
        played.ownerId = userId; played.revealedTurn = battle.turn; played.pendingReveal = true;
        battle.board[move.side].push(played);
        queues[userId].push(played);
      }
    }
    const first = battle.turn % 2 ? battle.player1Id : battle.player2Id;
    const second = getOpponentId(battle, first);
    const ordered = [];
    for (let i = 0; i < Math.max(queues[first].length, queues[second].length); i++) {
      if (queues[first][i]) ordered.push(queues[first][i]);
      if (queues[second][i]) ordered.push(queues[second][i]);
    }
    for (const userId of [battle.player1Id, battle.player2Id]) {
      battle.pendingMoves[userId] = []; battle.tempSelections[userId] = [];
      battle.lockedPlayers[userId] = false;
    }
    abilityEngine.enqueueReveals(battle, ordered);
    return await resumeAbilities(interaction.client, battle);
  } finally { battle.revealing = false; }
}

module.exports = {
  name: "battle",
  aliases: ["fight"],

  finishBattle,

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

      await interaction.deferUpdate();

      const chosenLocations = pickRandom(locations, 3).map((loc, index) => ({
        ...loc,
        revealTurn: index + 1
      }));

      const battle = {
        id: makeBattleId(),
        phase: "deck_select",

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
          [message.author.id]: [],
          [target.id]: []
        },

        decks: {
          [message.author.id]: [],
          [target.id]: []
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

        selectedDecks: {
          [message.author.id]: null,
          [target.id]: null
        },

        selectedDeckNames: {},

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

      const payload = await makeDeckSelectPayload(battle);

      return msg.edit(payload);
    });
        collector.on("end", async (_, reason) => {
      if (reason === "time") {
        await msg.edit({
          content: "⏰ Battle challenge expired.",
          files: [],
          components: []
        }).catch(() => {});
      }
    });
  },

 async handleButton(interaction) {
  if (
    interaction.customId.startsWith("battle_accept_") ||
    interaction.customId.startsWith("battle_decline_")
  ) {
    return;
  }

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

    if (battle.starting) {
      return interaction.reply({ content: "The battle is starting. Please wait a moment.", ephemeral: true });
    }

    if (interaction.customId.startsWith(`battle_pickdeck_${battle.id}_`)) {
      await interaction.deferReply({ ephemeral: true });

      if (![battle.player1Id, battle.player2Id].includes(interaction.user.id)) {
        return interaction.editReply("❌ You are not part of this battle.");
      }

      if (battle.phase !== "deck_select") {
        return interaction.editReply("Deck selection is already over.");
      }

      const deckNo = Number(interaction.customId.split("_").pop());

      if (![1, 2, 3].includes(deckNo)) {
        return interaction.editReply("Invalid deck.");
      }

      const deckResult = await getBattleDeckFromSlot(interaction.user.id, deckNo);

      if (!deckResult.ok) {
        return interaction.editReply(`❌ ${deckResult.reason}`);
      }

      battle.selectedDecks[interaction.user.id] = deckNo;
      battle.selectedDeckNames[interaction.user.id] = deckResult.deckName;

      await interaction.editReply(`✅ You selected **${deckResult.deckName}**.`);

      const p1Picked = battle.selectedDecks[battle.player1Id];
      const p2Picked = battle.selectedDecks[battle.player2Id];

      if (!p1Picked || !p2Picked) {
        return interaction.channel.send(
          `✅ <@${interaction.user.id}> locked a deck.\nWaiting for the other player...`
        );
      }

      return startBattleAfterDeckSelection(interaction, battle);
    }

    if (battle.abilityChoosing) {
      return interaction.reply({content: "Your ability choice is resolving. Please wait.", ephemeral: true});
    }
    if (battle.weaponApplying) {
      return interaction.reply({ content: "A weapon is resolving. Try again shortly.", ephemeral: true });
    }
    if (interaction.customId.startsWith("battle_weapon")) {
      return weaponUI.handle(interaction, battle,
        () => sendNewBoardMessage(interaction.client, battle, `Round ${battle.turn}: weapon resolved.`));
    }
    if (battle.completingTurn || battle.revealing) {
      return interaction.reply({ content: "The turn is resolving. Try again shortly.", ephemeral: true });
    }
    if (interaction.customId.startsWith("battle_ab")) {
      return abilityUI.handle(interaction, battle,
        advance => resumeAbilities(interaction.client, battle, advance));
    }
    if (interaction.customId === `battle_forfeit_${battle.id}`) {
      await interaction.reply({ content: "You forfeited.", ephemeral: true });
      return finishBattle(interaction.client, battle, getOpponentId(battle, interaction.user.id), "by forfeit.");
    }
    if (battle.phase !== "playing") {
      return interaction.reply({
        content: battle.phase === "ability_choice" ? "An ability target is being chosen. Use the latest battle buttons." : "Battle has not started yet. Choose decks first.",
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

      if (isLocationFullForPlayer(battle, interaction.user.id, side) || !abilityEngine.canPlace(battle, interaction.user.id, side)) {
        return interaction.reply({
          content: `❌ This location is full or blocked by an effect.`,
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
    return interaction.reply({ content: "This battle button expired. Use the latest board.", ephemeral: true });
  }
};