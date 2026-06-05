const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

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

function createOpenHandButton(battle) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_open_${battle.id}`)
        .setLabel("Open Private Hand")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

async function makeBoardPayload(battle, content, finished = false) {
  const buffer = await createBattleImage(battle);

  return {
    content,
    files: [
      new AttachmentBuilder(buffer, {
        name: "battle.png"
      })
    ],
    components: finished ? [] : createOpenHandButton(battle)
  };
}

function createCardButtons(battle, userId) {
  const hand = battle.hands[userId] || [];
  const row = new ActionRowBuilder();

  hand.slice(0, 5).forEach((item, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_card_${battle.id}_${index}`)
        .setLabel(`${index + 1}. ${item.card.name.slice(0, 18)}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  return [row];
}

function createLocationButtons(battle) {
  const row = new ActionRowBuilder();

  SIDES.forEach((side, i) => {
    const loc = battle.locations[i];

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_${side}`)
        .setLabel(loc.name || loc)
        .setStyle(ButtonStyle.Success)
    );
  });

  return [row];
}

async function sendPrivateHand(interaction, battle) {
  const hand = battle.hands[interaction.user.id] || [];

  if (!hand.length) {
    return interaction.reply({
      content: "You have no cards in hand.",
      ephemeral: true
    });
  }

  const buffer = await createHandImage(hand);

  return interaction.reply({
    content: "Pick a card:",
    files: [
      new AttachmentBuilder(buffer, {
        name: "hand.png"
      })
    ],
    components: createCardButtons(battle, interaction.user.id),
    ephemeral: true
  });
}

async function editPublicBoard(client, battle, content, finished = false) {
  const channel = await client.channels.fetch(battle.channelId);
  const msg = await channel.messages.fetch(battle.messageId);
  const payload = await makeBoardPayload(battle, content, finished);

  return msg.edit(payload);
}

function switchTurn(battle) {
  if (battle.currentPlayerId === battle.player1Id) {
    battle.currentPlayerId = battle.player2Id;
  } else {
    battle.currentPlayerId = battle.player1Id;
    battle.turn++;
  }
}

function drawCard(battle, userId) {
  const deck = battle.decks[userId];
  if (!deck || !deck.length) return;

  battle.hands[userId].push(deck.shift());
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

  for (const side of SIDES) {
    const p1 = getLocationPower(battle, side, battle.player1Id);
    const p2 = getLocationPower(battle, side, battle.player2Id);

    if (p1 > p2) p1Wins++;
    else if (p2 > p1) p2Wins++;
  }

  if (p1Wins > p2Wins) return battle.player1Id;
  if (p2Wins > p1Wins) return battle.player2Id;

  return null;
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
        .setLabel("Accept Battle")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`battle_decline_${message.author.id}_${target.id}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await message.channel.send({
      content: `<@${target.id}>, <@${message.author.id}> challenged you to a GrootX Battle!`,
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

      const p1Deck = [...p1DeckResult.cards];
      const p2Deck = [...p2DeckResult.cards];

      if (p1Deck.length < 5 || p2Deck.length < 5) {
        return interaction.reply({
          content: "Both players need at least 5 cards in their deck.",
          ephemeral: true
        });
      }

      const battle = {
        id: makeBattleId(),

        player1Id: message.author.id,
        player2Id: target.id,

        player1Name: message.author.username,
        player2Name: target.username,

        currentPlayerId: message.author.id,

        channelId: message.channel.id,
        messageId: msg.id,

        turn: 1,
        maxTurns: 6,

        locations: pickRandom(locations, 3),

        hands: {
          [message.author.id]: p1Deck.splice(0, 5),
          [target.id]: p2Deck.splice(0, 5)
        },

        decks: {
          [message.author.id]: p1Deck,
          [target.id]: p2Deck
        },

        selectedCardIndex: null,

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

      const payload = await makeBoardPayload(
        battle,
        `⚔️ Battle started! <@${battle.currentPlayerId}> click **Open Private Hand**.`
      );

      return interaction.update(payload);
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

    if (interaction.user.id !== battle.currentPlayerId) {
      return interaction.reply({
        content: "It is not your turn.",
        ephemeral: true
      });
    }

    if (interaction.customId.startsWith(`battle_open_${battle.id}`)) {
      return sendPrivateHand(interaction, battle);
    }

    if (interaction.customId.startsWith(`battle_card_${battle.id}_`)) {
      const index = Number(interaction.customId.split("_").pop());
      const hand = battle.hands[interaction.user.id];

      if (!hand || !hand[index]) {
        return interaction.reply({
          content: "That card is not in your hand.",
          ephemeral: true
        });
      }

      battle.selectedCardIndex = index;

      return interaction.update({
        content: `Selected **${hand[index].card.name}**. Choose location:`,
        files: [],
        components: createLocationButtons(battle)
      });
    }

    if (interaction.customId.startsWith(`battle_loc_${battle.id}_`)) {
      const side = interaction.customId.split("_").pop();

      if (!SIDES.includes(side)) {
        return interaction.reply({
          content: "Invalid location.",
          ephemeral: true
        });
      }

      const hand = battle.hands[interaction.user.id];

      if (battle.selectedCardIndex === null || !hand[battle.selectedCardIndex]) {
        return interaction.reply({
          content: "Pick a card first.",
          ephemeral: true
        });
      }

      const played = hand.splice(battle.selectedCardIndex, 1)[0];

      battle.board[side].push({
        ...played,
        ownerId: interaction.user.id
      });

      battle.selectedCardIndex = null;

      await interaction.update({
        content: `✅ Played **${played.card.name}** to **${side}**.`,
        files: [],
        components: []
      });

      const finalMove =
        battle.turn >= battle.maxTurns &&
        battle.currentPlayerId === battle.player2Id;

      if (finalMove) {
        battle.finished = true;
        battle.winner = getWinner(battle);

        activeBattles.delete(battle.player1Id);
        activeBattles.delete(battle.player2Id);

        const resultText = battle.winner
          ? `🏆 Battle finished! Winner: <@${battle.winner}>`
          : "🤝 Battle finished! It's a draw!";

        return editPublicBoard(interaction.client, battle, resultText, true);
      }

      drawCard(battle, interaction.user.id);
      switchTurn(battle);

      return editPublicBoard(
        interaction.client,
        battle,
        `Played **${played.card.name}** to **${side}**.\n<@${battle.currentPlayerId}> click **Open Private Hand**.`
      );
    }
  }
};