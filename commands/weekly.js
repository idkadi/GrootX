const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

module.exports = {
  name: "weekly",
  aliases: ["week"],

  data: new SlashCommandBuilder()
    .setName("weekly")
    .setDescription("Claim your weekly coins and Halloween rewards."),

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
    const cooldownsCol = db.collection("cooldowns");
    const inventoryCol = db.collection("inventory");

    const userId = user.id;
    const now = Date.now();

    const cooldownTime = 7 * 24 * 60 * 60 * 1000;

    const cooldownDoc = await cooldownsCol.findOne({
      type: "weekly",
      userId
    });

    const lastClaim = cooldownDoc?.timestamp || 0;
    const timeLeft = cooldownTime - (now - lastClaim);

    if (timeLeft > 0) {
      const days = Math.floor(
        timeLeft / (1000 * 60 * 60 * 24)
      );

      const hours = Math.floor(
        (timeLeft % (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
      );

      return reply(
        `⏰ You already claimed your weekly reward.\n` +
        `Come back in ${days}d ${hours}h.`
      );
    }

    const reward = 4000;

    const halloweenActive =
      now >= Date.parse("2026-10-03T00:00:00+05:30") &&
      now < Date.parse("2026-11-01T00:00:00+05:30");

    await balancesCol.updateOne(
      { userId },
      {
        $inc: {
          coins: reward
        }
      },
      { upsert: true }
    );

    if (halloweenActive) {
      await inventoryCol.updateOne(
        { userId },
        {
          $inc: {
            "items.groot_candy": 1000,
            "items.halloween_pack": 1
          }
        },
        { upsert: true }
      );
    }

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
      { upsert: true }
    );

    const balanceDoc = await balancesCol.findOne({
      userId
    });

    const description =
      `<:grootcoin:1504742213110861834> ` +
      `You received **${reward} Coins!**` +
      (
        halloweenActive
          ? "\n<:grootcandy:1555950722816675870> " +
            "You received **1,000 Groot Candy!**" +
            "\n<:halloweenpack:1555956375979425963> " +
            "You received **1 Halloween Pack!**"
          : ""
      );

    const embed = new EmbedBuilder()
      .setColor(halloweenActive ? 0xff8c00 : 0xffd700)
      .setTitle("🎁 Weekly Reward Claimed!")
      .setDescription(description)
      .addFields({
        name: "💰 New Balance",
        value: `${balanceDoc?.coins || reward} Coins`
      })
      .setFooter({
        text: "Come back next week for more!"
      })
      .setTimestamp();

    await reply({
      embeds: [embed]
    });
  }
};

module.exports.executeSlash = module.exports.execute;