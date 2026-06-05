const connectDB = require("../database");
const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const activeBattles = new Map();

function normalizeCode(code) {
  return String(code || "").trim().toLowerCase();
}

function getCardData(cardId) {
  return cards.find(c => Number(c.id) === Number(cardId));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function makeBattleEmbed(battle) {
  return new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle("⚔️ GrootX Battle")
    .setDescription(
      `**${battle.usernames.p1}** vs **${battle.usernames.p2}**\n` +
      `Turn **${battle.turn}/${battle.maxTurns}**\n\n` +

      `**Location 1**\n` +
      `${battle.usernames.p2}: ${battle.board.location1.p2.length} cards\n` +
      `${battle.usernames.p1}: ${battle.board.location1.p1.length} cards\n\n` +

      `**Location 2**\n` +
      `${battle.usernames.p2}: ${battle.board.location2.p2.length} cards\n` +
      `${battle.usernames.p1}: ${battle.board.location2.p1.length} cards\n\n` +

      `**Location 3**\n` +
      `${battle.usernames.p2}: ${battle.board.location3.p2.length} cards\n` +
      `${battle.usernames.p1}: ${battle.board.location3.p1.length} cards\n\n` +

      `Click **View Hand** to see your cards.`
    );
}

function makeBattleButtons(battleId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`battle_hand_${battleId}`)
      .setLabel("View Hand")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`battle_play_${battleId}`)
      .setLabel("Play Card")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`battle_end_${battleId}`)
      .setLabel("End Turn")
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  name: "battle",
  aliases: ["fight", "pvp"],

  async execute(message, args) {
    const opponent = message.mentions.users.first();

    if (!opponent) {
      return message.reply("❌ Use: `!battle @user`");
    }

    if (opponent.bot) {
      return message.reply("❌ You can't battle bots.");
    }

    if (opponent.id === message.author.id) {
      return message.reply("❌ You can't battle yourself.");
    }

    const db = await connectDB();
    const decksCol = db.collection("decks");
    const collectionsCol = db.collection("collections");

    const challengerDeck = await decksCol.findOne({ userId: message.author.id });
    const opponentDeck = await decksCol.findOne({ userId: opponent.id });

    if (!challengerDeck || !challengerDeck.cards || challengerDeck.cards.length < 15) {
      return message.reply("❌ You need a full **15-card deck** first.");
    }

    if (!opponentDeck || !opponentDeck.cards || opponentDeck.cards.length < 15) {
      return message.reply(`❌ ${opponent.username} needs a full **15-card deck** first.`);
    }

    const battleId = `${message.author.id}_${opponent.id}_${Date.now()}`;

    const challengeEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⚔️ GrootX Battle Challenge")
      .setDescription(
        `${message.author} challenged ${opponent}!\n\n` +
        `${opponent}, do you accept?`
      );

    const challengeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`battle_accept_${battleId}`)
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`battle_decline_${battleId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await message.reply({
      embeds: [challengeEmbed],
      components: [challengeRow]
    });

    const collector = msg.createMessageComponentCollector({
      time: 10 * 60 * 1000
    });

    collector.on("collect", async interaction => {
      if (
        interaction.customId === `battle_accept_${battleId}` ||
        interaction.customId === `battle_decline_${battleId}`
      ) {
        if (interaction.user.id !== opponent.id) {
          return interaction.reply({
            content: "❌ This battle challenge is not for you.",
            ephemeral: true
          });
        }

        if (interaction.customId === `battle_decline_${battleId}`) {
          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0x777777)
                .setTitle("❌ Battle Declined")
                .setDescription(`${opponent} declined the battle.`)
            ],
            components: []
          });
        }

        const allEntries = await collectionsCol
          .find({
            userId: { $in: [message.author.id, opponent.id] }
          })
          .toArray();

        const makeFullDeck = (userId, deckCodes) => {
          return deckCodes
            .map(code => {
              const entry = allEntries.find(e =>
                e.userId === userId &&
                normalizeCode(e.code) === normalizeCode(code)
              );

              if (!entry) return null;

              const card = getCardData(entry.cardId);
              if (!card) return null;

              return {
                code: entry.code,
                serial: entry.serial,
                cardId: entry.cardId,
                name: card.name,
                tier: card.tier
              };
            })
            .filter(Boolean);
        };

        const p1Deck = shuffle(makeFullDeck(message.author.id, challengerDeck.cards));
        const p2Deck = shuffle(makeFullDeck(opponent.id, opponentDeck.cards));

        const battle = {
          battleId,
          players: {
            p1: message.author.id,
            p2: opponent.id
          },
          usernames: {
            p1: message.author.username,
            p2: opponent.username
          },
          decks: {
            p1: p1Deck,
            p2: p2Deck
          },
          hands: {
            p1: p1Deck.splice(0, 5),
            p2: p2Deck.splice(0, 5)
          },
          board: {
            location1: { p1: [], p2: [] },
            location2: { p1: [], p2: [] },
            location3: { p1: [], p2: [] }
          },
          turn: 1,
          maxTurns: 6,
          status: "active"
        };

        activeBattles.set(battleId, battle);

        return interaction.update({
          embeds: [makeBattleEmbed(battle)],
          components: [makeBattleButtons(battleId)]
        });
      }

      const battle = activeBattles.get(battleId);

      if (!battle) {
        return interaction.reply({
          content: "❌ This battle no longer exists.",
          ephemeral: true
        });
      }

      const playerKey =
        interaction.user.id === battle.players.p1
          ? "p1"
          : interaction.user.id === battle.players.p2
            ? "p2"
            : null;

      if (!playerKey) {
        return interaction.reply({
          content: "❌ You are not in this battle.",
          ephemeral: true
        });
      }

      if (interaction.customId === `battle_hand_${battleId}`) {
        const hand = battle.hands[playerKey];

        const handText = hand.length
          ? hand.map((c, i) => {
              return `**${i + 1}.** \`${c.code}\` • #${c.serial} • **${c.name}**`;
            }).join("\n")
          : "Your hand is empty.";

        return interaction.reply({
          content: `🃏 **Your Hand**\n\n${handText}`,
          ephemeral: true
        });
      }

      if (interaction.customId === `battle_play_${battleId}`) {
        return interaction.reply({
          content:
            "Play command coming next.\n\n" +
            "Next we add buttons:\n" +
            "`Card 1` `Card 2` `Card 3` `Card 4` `Card 5`\n" +
            "then location buttons.",
          ephemeral: true
        });
      }

      if (interaction.customId === `battle_end_${battleId}`) {
        return interaction.reply({
          content: "Turn ending comes after card play is added.",
          ephemeral: true
        });
      }
    });
  }
};