const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

const COIN_EMOJI = "<:grootcoin:1504742213110861834>";
const CANDY_EMOJI = "<:grootcandy:1555950722816675870>";

const HALLOWEEN_START = Date.parse(
  "2026-10-03T00:00:00+05:30"
);

const HALLOWEEN_END = Date.parse(
  "2026-11-01T00:00:00+05:30"
);

module.exports = {
  name: "daily",
  aliases: ["dai"],

  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily coins and Halloween candy."),

  async execute(message) {
    const isSlash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = isSlash
      ? message.user
      : message.author;

    if (isSlash && !message.deferred && !message.replied) {
      await message.deferReply();
    }

    const reply = payload =>
      isSlash
        ? message.editReply(payload)
        : message.reply(payload);

    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const dailyCol = db.collection("daily");
    const inventoryCol = db.collection("inventory");

    const userId = user.id;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;

    const dailyDoc = await dailyCol.findOne({ userId });
    const lastClaim = dailyDoc?.timestamp || 0;
    const timeLeft = cooldown - (now - lastClaim);

    if (timeLeft > 0) {
      const hours = Math.floor(
        timeLeft / (1000 * 60 * 60)
      );

      const minutes = Math.floor(
        (timeLeft % (1000 * 60 * 60)) /
        (1000 * 60)
      );

      return reply(
        `⏰ You already claimed your daily reward.\n` +
        `Come back in ${hours}h ${minutes}m.`
      );
    }

    const reward = 500;

    const halloweenActive =
      now >= HALLOWEEN_START &&
      now < HALLOWEEN_END;

    const candyReward = halloweenActive ? 250 : 0;

    // Increment coins without overwriting other rewards.
    await balancesCol.updateOne(
      { userId },
      {
        $inc: {
          coins: reward
        }
      },
      { upsert: true }
    );

    // Candy is stored in inventory.
    if (candyReward > 0) {
      await inventoryCol.updateOne(
        { userId },
        {
          $inc: {
            "items.groot_candy": candyReward
          }
        },
        { upsert: true }
      );
    }

    await dailyCol.updateOne(
      { userId },
      {
        $set: {
          timestamp: now
        }
      },
      { upsert: true }
    );

    const balanceDoc = await balancesCol.findOne({
      userId
    });

    const newBalance = balanceDoc.coins;

    const rewardLines = [
      `${COIN_EMOJI} You received **${reward} Coins!**`
    ];

    if (candyReward > 0) {
      rewardLines.push(
        `${CANDY_EMOJI} You received **${candyReward} Groot Candy!**`
      );
    }

    const embed = new EmbedBuilder()
      .setColor(halloweenActive ? 0xff8c00 : 0xffd700)
      .setTitle("🎁 Daily Reward Claimed!")
      .setDescription(rewardLines.join("\n"))
      .addFields({
        name: "💰 New Balance",
        value: `${newBalance} Coins`
      })
      .setFooter({
        text: "Come back tomorrow for more!"
      })
      .setTimestamp();

    await reply({
      embeds: [embed]
    });
  }
};

module.exports.executeSlash = module.exports.execute;