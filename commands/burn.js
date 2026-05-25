const cards = require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

function random(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function getRandomShard() {
  const shards = [
    "space_shard",
    "mind_shard",
    "reality_shard",
    "power_shard",
    "time_shard",
    "soul_shard"
  ];

  return shards[
    Math.floor(Math.random() * shards.length)
  ];
}

function formatItemName(item) {
  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getItemEmoji(item) {
  switch (item) {
    case "space_shard": return "<:spaceshards:1504767068480995429>";
    case "mind_shard": return "<:mindsshards:1504767348517638195>";
    case "reality_shard": return "<:realityshards:1504767197883531386>";
    case "power_shard": return "<:powershards:1504767126462926949>";
    case "time_shard": return "<:timeshards:1504766994074046525>";
    case "soul_shard": return "<:soulshards:1504767256775757845>";
    default: return "✨";
  }
}

module.exports = {
  name: "burn",

  async execute(message, args) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const balancesCol = db.collection("balances");
    const inventoryCol = db.collection("inventory");

    const userId = message.author.id;

    let burnedEntry;

    if (!args[0]) {
      burnedEntry = await collectionsCol
        .find({ userId })
        .sort({ _id: -1 })
        .limit(1)
        .next();
    } else {
      burnedEntry = await collectionsCol.findOne({
        userId,
        code: args[0].toLowerCase()
      });
    }

    if (!burnedEntry) {
      return message.reply("❌ Card not found.");
    }

    if (burnedEntry.favorite) {
      return message.reply("⭐ You cannot burn a favorited card.");
    }

    const card = cards.find(
      c => Number(c.id) === Number(burnedEntry.cardId)
    );

    if (!card) {
      return message.reply("❌ Card data not found.");
    }

    const confirmEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⚠️ Confirm Burn")
      .setDescription(
        `**${card.name}**\n` +
        `└ ${burnedEntry.code} • #${burnedEntry.serial}\n\n` +
        `This action is irreversible.`
      )
      .setFooter({
        text: "Burning permanently destroys the card."
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm")
        .setLabel("🔥 Confirm")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("cancel")
        .setLabel("❌ Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    const confirmMessage = await message.reply({
      embeds: [confirmEmbed],
      components: [row]
    });

    const collector = confirmMessage.createMessageComponentCollector({
      time: 30000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This is not your burn confirmation.",
          ephemeral: true
        });
      }

      if (interaction.customId === "cancel") {
        collector.stop();

        return interaction.update({
          content: "❌ Burn canceled.",
          embeds: [],
          components: []
        });
      }

      if (interaction.customId === "confirm") {
        collector.stop();

        let coins = 0;
        let shards = 0;

        switch (card.tier) {
          case "common":
            coins = random(25, 50);
            shards = random(3, 5);
            break;

          case "uncommon":
            coins = random(50, 100);
            shards = random(5, 8);
            break;

          case "rare":
            coins = random(100, 200);
            shards = random(10, 15);
            break;

          case "epic":
            coins = random(250, 500);
            shards = random(15, 25);
            break;

          case "legendary":
            coins = random(1000, 1500);
            shards = random(50, 100);
            break;
        }

        const shardType = getRandomShard();

        await collectionsCol.deleteOne({
          _id: burnedEntry._id
        });

        await removeCardFromAlbums(
  db,
  userId,
  burnedEntry.code
);

        await balancesCol.updateOne(
          { userId },
          {
            $inc: {
              coins
            }
          },
          {
            upsert: true
          }
        );

        await inventoryCol.updateOne(
          { userId },
          {
            $inc: {
              [`items.${shardType}`]: shards
            }
          },
          {
            upsert: true
          }
        );

        const resultEmbed = new EmbedBuilder()
          .setColor(0xff5500)
          .setTitle("🔥 Card Burned")
          .setDescription(
            `Burned **${card.name}**\n` +
            `└ ${burnedEntry.code}`
          )
          .addFields(
            {
              name: "<:grootcoin:1504742213110861834> Coins Earned",
              value: `${coins} Coins`,
              inline: true
            },
            {
              name: "✨ Shards Earned",
              value:
                `${getItemEmoji(shardType)} ` +
                `${formatItemName(shardType)} x${shards}`,
              inline: true
            }
          )
          .setFooter({
            text: "The card has been permanently destroyed."
          })
          .setTimestamp();

        await interaction.update({
          embeds: [resultEmbed],
          components: []
        });
      }
    });
  }
};