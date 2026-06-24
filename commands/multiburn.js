const cards = require("../data/cards");

const {
  EmbedBuilder
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

function getShardEmoji(shard) {
  switch (shard) {
    case "space_shard": return "<:spaceshards:1504767068480995429>";
    case "mind_shard": return "<:mindsshards:1504767348517638195>";
    case "reality_shard": return "<:realityshards:1504767197883531386>";
    case "power_shard": return "<:powershards:1504767126462926949>";
    case "time_shard": return "<:timeshards:1504766994074046525>";
    case "soul_shard": return "<:soulshards:1504767256775757845>";
    default: return "✨";
  }
}

function formatShardName(shard) {
  return shard
    .replace("_shard", " Shard")
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  name: "multiburn",
  aliases: ["mburn"],

  async execute(message, args) {
    if (!args.length) {
      return message.reply(
        "❌ Provide card codes.\n\n" +
        "Example:\n" +
        "`!multiburn q7mz2x a8n91p`"
      );
    }

    const codes = [...new Set(args.map(code => code.toLowerCase()))];

    const warningEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⚠️ Confirm Multi Burn")
      .setDescription(
        "React with 🔥 to confirm.\n\n" +
        "Favorited cards will not be burned."
      );

    const warningMsg = await message.reply({
      embeds: [warningEmbed]
    });

    await warningMsg.react("🔥");

    const filter = (reaction, user) => {
      return (
        reaction.emoji.name === "🔥" &&
        user.id === message.author.id
      );
    };

    const collector = warningMsg.createReactionCollector({
      filter,
      max: 1,
      time: 30000
    });

    collector.on("collect", async () => {
      const db = await connectDB();

      const collectionsCol = db.collection("collections");
      const balancesCol = db.collection("balances");
      const inventoryCol = db.collection("inventory");

      const userId = message.author.id;

      let totalCoins = 0;
      const totalShards = {};
      const burnedCards = [];

      for (const code of codes) {
        const deleted = await collectionsCol.findOneAndDelete({
          userId,
          code,
          favorite: { $ne: true }
        });

        const entry = deleted?.value || deleted;

        if (!entry) continue;

        const card = cards.find(
          c => Number(c.id) === Number(entry.cardId)
        );

        if (!card) continue;

        let coinsMin = 0;
        let coinsMax = 0;
        let shardMin = 0;
        let shardMax = 0;

        switch (card.tier) {
          case "common":
            coinsMin = 25;
            coinsMax = 50;
            shardMin = 3;
            shardMax = 5;
            break;

          case "uncommon":
            coinsMin = 50;
            coinsMax = 100;
            shardMin = 5;
            shardMax = 8;
            break;

          case "rare":
            coinsMin = 100;
            coinsMax = 200;
            shardMin = 10;
            shardMax = 15;
            break;

          case "epic":
            coinsMin = 250;
            coinsMax = 500;
            shardMin = 15;
            shardMax = 25;
            break;

          case "legendary":
            coinsMin = 1000;
            coinsMax = 1500;
            shardMin = 50;
            shardMax = 100;
            break;
        }

        const earnedCoins = random(coinsMin, coinsMax);
        const earnedShards = random(shardMin, shardMax);
        const shardType = getRandomShard();

        totalCoins += earnedCoins;

        if (!totalShards[shardType]) {
          totalShards[shardType] = 0;
        }

        totalShards[shardType] += earnedShards;

        await inventoryCol.updateOne(
          { userId },
          {
            $inc: {
              [`items.${shardType}`]: earnedShards
            }
          },
          {
            upsert: true
          }
        );

        await removeCardFromAlbums(
          db,
          userId,
          entry.code
        );

        burnedCards.push(
          `🔥 ${card.name}\n` +
          `└ ${entry.code}`
        );
      }

      if (burnedCards.length === 0) {
        return message.reply(
          "❌ No valid burnable cards found."
        );
      }

      await balancesCol.updateOne(
        { userId },
        {
          $inc: {
            coins: totalCoins
          }
        },
        {
          upsert: true
        }
      );

      const shardText = Object.entries(totalShards)
        .map(([shard, amount]) => {
          return (
            `${getShardEmoji(shard)} ` +
            `${formatShardName(shard)}\n` +
            `└ x${amount}`
          );
        })
        .join("\n\n");

      const resultEmbed = new EmbedBuilder()
        .setColor(0xff5500)
        .setTitle("🔥 Multi Burn Complete")
        .addFields(
          {
            name: "🔥 Burned Cards",
            value: burnedCards.join("\n\n"),
            inline: false
          },
          {
            name: "🪙 Coins Earned",
            value: `${totalCoins}`,
            inline: true
          },
          {
            name: "✨ Shards Earned",
            value: shardText || "None",
            inline: false
          }
        )
        .setTimestamp();

      await message.reply({
        embeds: [resultEmbed]
      });
    });

    collector.on("end", async collected => {
      if (collected.size === 0) {
        await warningMsg.edit({
          content: "❌ Multi burn cancelled.",
          embeds: []
        }).catch(() => {});
      }
    });
  }
};