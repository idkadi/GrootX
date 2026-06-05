const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const cards = require("../data/cards");
const locations = require("../data/locations");
const activeBattles = require("../data/activeBattles");
const { calculateBattlePower } = require("../utils/battlePower");

function pickRandom(arr, count) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function makeBattleId() {
  return Math.random().toString(36).slice(2, 8);
}

function getRandomCard() {
  const card = cards[Math.floor(Math.random() * cards.length)];

  return {
    ...card,
    serial: Math.floor(Math.random() * 2000) + 1
  };
}

function createHand() {
  return Array.from({ length: 5 }, () => getRandomCard());
}

function getLocationCards(battle, side, userId) {
  return battle.board[side].filter(card => card.ownerId === userId);
}

function getLocationObject(battle, side) {
  const sides = ["left", "middle", "right"];
  const index = sides.indexOf(side);
  return battle.locations[index];
}

function getLocationPower(battle, side, userId) {
  const locationCards = getLocationCards(battle, side, userId);
  const location = getLocationObject(battle, side);

  return locationCards.reduce((total, playedCard) => {
    const result = calculateBattlePower(playedCard, {
      serial: playedCard.serial,
      cardsAtLocation: locationCards,
      location
    });

    return total + result.finalPower;
  }, 0);
}

function renderBoard(battle) {
  const sides = ["left", "middle", "right"];

  return sides.map(side => {
    const location = getLocationObject(battle, side);

    const p1Cards = getLocationCards(battle, side, battle.player1Id);
    const p2Cards = getLocationCards(battle, side, battle.player2Id);

    const p1Power = getLocationPower(battle, side, battle.player1Id);
    const p2Power = getLocationPower(battle, side, battle.player2Id);

    const p1List = p1Cards.length
      ? p1Cards.map(c => `• ${c.name} #${c.serial}`).join("\n")
      : "No cards";

    const p2List = p2Cards.length
      ? p2Cards.map(c => `• ${c.name} #${c.serial}`).join("\n")
      : "No cards";

    return `⬢ **${location.name || location}**
${location.description || "No effect"}

<@${battle.player1Id}> Power: **${p1Power}**
${p1List}

<@${battle.player2Id}> Power: **${p2Power}**
${p2List}`;
  }).join("\n\n");
}

function createBattleEmbed(battle) {
  return new EmbedBuilder()
    .setTitle("⚔️ GrootX Battle")
    .setDescription(
      `**Turn:** ${battle.turn}/${battle.maxTurns}\n` +
      `**Current Player:** <@${battle.currentPlayerId}>\n\n` +
      renderBoard(battle)
    )
    .setColor("#7b2cff")
    .setFooter({ text: "Pick a card first, then choose a location." });
}

function createCardButtons(battle) {
  const hand = battle.hands[battle.currentPlayerId] || [];
  const row = new ActionRowBuilder();

  hand.slice(0, 5).forEach((card, index) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_card_${battle.id}_${index}`)
        .setLabel(`${index + 1}. ${card.name.slice(0, 20)}`)
        .setStyle(ButtonStyle.Primary)
    );
  });

  return [row];
}

function createLocationButtons(battle) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_left`)
        .setLabel("⬢ Left")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_middle`)
        .setLabel("⬢ Middle")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`battle_loc_${battle.id}_right`)
        .setLabel("⬢ Right")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function switchTurn(battle) {
  if (battle.currentPlayerId === battle.player1Id) {
    battle.currentPlayerId = battle.player2Id;
  } else {
    battle.currentPlayerId = battle.player1Id;
    battle.turn++;
  }
}

function getWinner(battle) {
  const sides = ["left", "middle", "right"];

  let p1Wins = 0;
  let p2Wins = 0;

  for (const side of sides) {
    const p1Power = getLocationPower(battle, side, battle.player1Id);
    const p2Power = getLocationPower(battle, side, battle.player2Id);

    if (p1Power > p2Power) p1Wins++;
    else if (p2Power > p1Power) p2Wins++;
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
          content: "Only the challenged player can use this.",
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith("battle_decline")) {
        collector.stop();

        return interaction.update({
          content: "Battle declined.",
          components: []
        });
      }

      const battle = {
        id: makeBattleId(),

        player1Id: message.author.id,
        player2Id: target.id,
        currentPlayerId: message.author.id,

        turn: 1,
        maxTurns: 6,

        locations: pickRandom(locations, 3),

        hands: {
          [message.author.id]: createHand(),
          [target.id]: createHand()
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

      return interaction.update({
        content: "Battle started!",
        embeds: [createBattleEmbed(battle)],
        components: createCardButtons(battle)
      });
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

    if (interaction.user.id !== battle.currentPlayerId) {
      return interaction.reply({
        content: "It is not your turn.",
        ephemeral: true
      });
    }

    if (interaction.customId.startsWith(`battle_card_${battle.id}_`)) {
      const index = Number(interaction.customId.split("_").pop());
      const hand = battle.hands[interaction.user.id];

      if (!hand[index]) {
        return interaction.reply({
          content: "That card is not in your hand.",
          ephemeral: true
        });
      }

      battle.selectedCardIndex = index;

      const selectedCard = hand[index];

      return interaction.update({
        content: `Selected **${selectedCard.name}**. Now choose a location.`,
        embeds: [createBattleEmbed(battle)],
        components: createLocationButtons(battle)
      });
    }

    if (interaction.customId.startsWith(`battle_loc_${battle.id}_`)) {
      const side = interaction.customId.split("_").pop();
      const hand = battle.hands[interaction.user.id];

      if (battle.selectedCardIndex === null) {
        return interaction.reply({
          content: "Pick a card first.",
          ephemeral: true
        });
      }

      const card = hand.splice(battle.selectedCardIndex, 1)[0];

      battle.board[side].push({
        ...card,
        ownerId: interaction.user.id
      });

      battle.selectedCardIndex = null;

      const isFinalMove =
        battle.turn >= battle.maxTurns &&
        battle.currentPlayerId === battle.player2Id;

      if (isFinalMove) {
        battle.finished = true;
        battle.winner = getWinner(battle);

        activeBattles.delete(battle.player1Id);
        activeBattles.delete(battle.player2Id);

        const resultText = battle.winner
          ? `🏆 Battle finished! Winner: <@${battle.winner}>`
          : "🤝 Battle finished! It's a draw!";

        return interaction.update({
          content: resultText,
          embeds: [createBattleEmbed(battle)],
          components: []
        });
      }

      switchTurn(battle);

      return interaction.update({
        content: `Played **${card.name}** to **${side}**.`,
        embeds: [createBattleEmbed(battle)],
        components: createCardButtons(battle)
      });
    }
  }
};