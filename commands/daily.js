const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "daily",
  aliases: ["dai"],

  async execute(message) {

    const db =
      await connectDB();

    const balancesCol =
      db.collection("balances");

    const dailyCol =
      db.collection("daily");

    const userId =
      message.author.id;

    let balanceDoc =
      await balancesCol.findOne({
        userId
      });

    if (!balanceDoc) {

      await balancesCol.insertOne({
        userId,
        coins: 0
      });

      balanceDoc = {
        userId,
        coins: 0
      };

    }

    const now =
      Date.now();

    const cooldown =
      24 * 60 * 60 * 1000;

    const dailyDoc =
      await dailyCol.findOne({
        userId
      });

    const lastClaim =
      dailyDoc?.timestamp || 0;

    const timeLeft =
      cooldown - (now - lastClaim);

    if (timeLeft > 0) {

      const hours =
        Math.floor(
          timeLeft /
          (1000 * 60 * 60)
        );

      const minutes =
        Math.floor(
          (
            timeLeft %
            (1000 * 60 * 60)
          ) /
          (1000 * 60)
        );

      return message.reply(

        `⏰ You already claimed your daily reward.\n` +
        `Come back in ${hours}h ${minutes}m.`

      );

    }

    const reward = 500;

    const newBalance =
      balanceDoc.coins + reward;

    await balancesCol.updateOne(

      { userId },

      {
        $set: {
          coins: newBalance
        }
      }

    );

    await dailyCol.updateOne(

      { userId },

      {
        $set: {
          timestamp: now
        }
      },

      {
        upsert: true
      }

    );

    const embed =
      new EmbedBuilder()

        .setColor(0xffd700)

        .setTitle(
          "🎁 Daily Reward Claimed!"
        )

        .setDescription(

          `<:grootcoin:1504742213110861834> ` +
          `You received **${reward} Coins!**`

        )

        .addFields({

          name: "💰 New Balance",

          value:
            `${newBalance} Coins`

        })

        .setFooter({
          text:
            "Come back tomorrow for more!"
        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};