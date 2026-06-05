const connectDB = require("../database");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const activeBattles = new Map();

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

    const challengerDeck = await decksCol.findOne({
      userId: message.author.id
    });

    const opponentDeck = await decksCol.findOne({
      userId: opponent.id
    });

    if (!challengerDeck || challengerDeck.cards.length < 15) {
      return message.reply("❌ You need a full **15-card deck** first.");
    }

    if (!opponentDeck || opponentDeck.cards.length < 15) {
      return message.reply(`❌ ${opponent.username} needs a full **15-card deck** first.`);
    }

    const battleId = `${message.author.id}_${opponent.id}_${Date.now()}`;

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⚔️ GrootX Battle Challenge")
      .setDescription(
        `${message.author} challenged ${opponent}!\n\n` +
        `${opponent}, do you accept the battle?`
      )
      .setFooter({
        text: "Battle v1 • 3 Locations • 6 Turns"
      });

    const row = new ActionRowBuilder().addComponents(
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
      embeds: [embed],
      components: [row]
    });

    const collector = msg.createMessageComponentCollector({
      time: 60000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== opponent.id) {
        return interaction.reply({
          content: "❌ This battle challenge is not for you.",
          ephemeral: true
        });
      }

      if (interaction.customId === `battle_decline_${battleId}`) {
        collector.stop("declined");

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

      if (interaction.customId === `battle_accept_${battleId}`) {
        collector.stop("accepted");

        const battle = {
          battleId,
          channelId: message.channel.id,

          players: {
            p1: message.author.id,
            p2: opponent.id
          },

          usernames: {
            p1: message.author.username,
            p2: opponent.username
          },

          decks: {
            p1: shuffle([...challengerDeck.cards]),
            p2: shuffle([...opponentDeck.cards])
          },

          hands: {
            p1: [],
            p2: []
          },

          board: {
            location1: {
              name: "Location 1",
              p1: [],
              p2: []
            },
            location2: {
              name: "Location 2",
              p1: [],
              p2: []
            },
            location3: {
              name: "Location 3",
              p1: [],
              p2: []
            }
          },

          turn: 1,
          maxTurns: 6,
          status: "active"
        };

        battle.hands.p1 = battle.decks.p1.splice(0, 5);
        battle.hands.p2 = battle.decks.p2.splice(0, 5);

        activeBattles.set(battleId, battle);

        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0x00aeff)
              .setTitle("⚔️ Battle Started")
              .setDescription(
                `**${message.author.username}** vs **${opponent.username}**\n\n` +
                `Turn: **1/6**\n\n` +
                `🃏 Both players drew **5 cards**.\n` +
                `📍 3 locations created.\n\n` +
                `Next step: add battle board + play card buttons.`
              )
          ],
          components: []
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason === "accepted" || reason === "declined") return;

      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x777777)
            .setTitle("⌛ Battle Expired")
            .setDescription("The battle challenge expired.")
        ],
        components: []
      }).catch(() => {});
    });
  }
};

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [array[i], array[j]] = [array[j], array[i]];
  }

  return array;
}