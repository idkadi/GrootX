const cards =
  require("../data/cards");

const {
  removeCardFromAlbums
} = require("../utils/albumUtils");

const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

function random(min, max) {

  return Math.floor(
    Math.random() *
    (max - min + 1)
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
    Math.floor(
      Math.random() * shards.length
    )
  ];

}

function getShardEmoji(shard) {

  switch (shard) {

    case "space_shard":
      return "<:spaceshards:1504767068480995429>";

    case "mind_shard":
      return "<:mindsshards:1504767348517638195>";

    case "reality_shard":
      return "<:realityshards:1504767197883531386>";

    case "power_shard":
      return "<:powershards:1504767126462926949>";

    case "time_shard":
      return "<:timeshards:1504766994074046525>";

    case "soul_shard":
      return "<:soulshards:1504767256775757845>";

    default:
      return "✨";

  }

}

function formatShardName(shard) {

  return shard

    .replace("_shard", " Shard")

    .split("_")

    .map(word =>

      word.charAt(0).toUpperCase() +
      word.slice(1)

    )

    .join(" ");

}

module.exports = {

  name: "burnall",
  aliases: ["ball"],

  async execute(message) {

    const warningEmbed =
      new EmbedBuilder()

        .setColor(0xff0000)

        .setTitle(
          "⚠️ Confirm Burn All"
        )

        .setDescription(

          "React with 🔥 to burn ALL cards.\n\n" +

          "⭐ Favorited cards are SAFE."

        );

    const warningMsg =
      await message.reply({

        embeds: [warningEmbed]

      });

    await warningMsg.react("🔥");

    const filter =
      (reaction, user) => {

        return (

          reaction.emoji.name === "🔥" &&

          user.id === message.author.id

        );

      };

    const collector =
      warningMsg.createReactionCollector({

        filter,

        max: 1,

        time: 30000

      });

    collector.on(
      "collect",

      async () => {

        const db =
          await connectDB();

        const collectionsCol =
          db.collection("collections");

        const balancesCol =
          db.collection("balances");

        const inventoryCol =
          db.collection("inventory");

        const userId =
          message.author.id;

        const userCollection =
          await collectionsCol.find({
            userId
          }).toArray();

        const burnableCards =
          userCollection.filter(
            c => !c.favorite
          );

        if (
          burnableCards.length === 0
        ) {

          return message.reply(

            "❌ No burnable cards found."

          );

        }

        let totalCoins = 0;

        const totalShards = {};

        for (const entry of burnableCards) {

          const card =
            cards.find(
              c =>
                Number(c.id) ===
                Number(entry.cardId)
            );

          if (!card)
            continue;

          let coinsMin, coinsMax;
          let shardMin, shardMax;

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

          const earnedCoins =
            random(
              coinsMin,
              coinsMax
            );

          const earnedShards =
            random(
              shardMin,
              shardMax
            );

          const shardType =
            getRandomShard();

          totalCoins += earnedCoins;

          if (!totalShards[shardType]) {

            totalShards[shardType] = 0;

          }

          totalShards[shardType] +=
            earnedShards;

        }

        const inventoryUpdate = {};

        for (
          const [shard, amount]
          of Object.entries(totalShards)
        ) {

          inventoryUpdate[
            `items.${shard}`
          ] = amount;

        }

        await inventoryCol.updateOne(

          { userId },

          {
            $inc: inventoryUpdate
          },

          {
            upsert: true
          }

        );

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

        await collectionsCol.deleteMany({

          userId,

          favorite: {
            $ne: true
          }

        });

        for (const entry of burnableCards) {

  await removeCardFromAlbums(
    db,
    userId,
    entry.code
  );

}

        const shardText =
          Object.entries(totalShards)

            .map(([shard, amount]) => {

              return (

                `${getShardEmoji(shard)} ` +

                `${formatShardName(shard)}\n` +

                `└ x${amount}`

              );

            })

            .join("\n\n");

        const resultEmbed =
          new EmbedBuilder()

            .setColor(0xff5500)

            .setTitle(
              "🔥 Burn All Complete"
            )

            .addFields(

              {
                name:
                  "🔥 Burned Cards",

                value:
                  `${burnableCards.length} cards burned.`,

                inline: false
              },

              {
                name:
                  "🪙 Coins Earned",

                value:
                  `${totalCoins}`,

                inline: true
              },

              {
                name:
                  "✨ Shards Earned",

                value:
                  shardText || "None",

                inline: false
              }

            )

            .setTimestamp();

        await message.reply({

          embeds: [resultEmbed]

        });

      }

    );

    collector.on(
      "end",

      async collected => {

        if (
          collected.size === 0
        ) {

          await warningMsg.edit({

            content:
              "❌ Burn all cancelled.",

            embeds: []

          }).catch(() => {});

        }

      }

    );

  }

};