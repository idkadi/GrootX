const {
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");

module.exports = {
  name: "weekly",
  aliases: ["week"],

  async execute(message) {
    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const cooldownsCol = db.collection("cooldowns");

    const userId = message.author.id;
    const now = Date.now();

    const cooldownTime = 7 * 24 * 60 * 60 * 1000;

    const cooldownDoc = await cooldownsCol.findOne({
      type: "weekly",
      userId
    });

    const lastClaim = cooldownDoc?.timestamp || 0;
    const timeLeft = cooldownTime - (now - lastClaim);

    if (timeLeft > 0) {
      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (timeLeft % (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
      );

      return message.reply(
        `⏰ You already claimed your weekly reward.\n` +
        `Come back in ${days}d ${hours}h.`
      );
    }

    const reward = 4000;

    await balancesCol.updateOne(
      { userId },
      {
        $inc: {
          coins: reward
        }
      },
      {
        upsert: true
      }
    );

    await cooldownsCol.updateOne(
      {
        type: "weekly",
        userId
      },
      {
        $set: {
          timestamp: now
        }
      },
      {
        upsert: true
      }
    );

    const balanceDoc = await balancesCol.findOne({
      userId
    });

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🎁 Weekly Reward Claimed!")
      .setDescription(
        `<:grootcoin:1504742213110861834> ` +
        `You received **${reward} Coins!**`
      )
      .addFields({
        name: "💰 New Balance",
        value: `${balanceDoc?.coins || reward} Coins`
      })
      .setFooter({
        text: "Come back next week for more!"
      })
      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });
  }
};