const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "balance",
  aliases: ["bal"],

  async execute(message) {

    const db =
      await connectDB();

    const balances =
      db.collection("balances");

    const userId =
      message.author.id;

    let userBalance =
      await balances.findOne({
        userId
      });

    if (!userBalance) {

      await balances.insertOne({

        userId,

        coins: 0,

        ultronChips: 0

      });

      userBalance = {

        userId,

        coins: 0,

        ultronChips: 0

      };

    }

    const coins =
      userBalance.coins || 0;

    const ultronChips =
      userBalance.ultronChips || 0;

    const embed =
      new EmbedBuilder()

        .setColor(0xffd700)

        .setTitle(
          `${message.author.username}'s Balance`
        )

        .setDescription(

          `<:grootcoin:1504742213110861834> Coins: **${coins.toLocaleString()}**\n` +

          `🎫 Ultron Chips: **${ultronChips.toLocaleString()}**`

        )

        .setFooter({

          text:
            "GrootX Economy System"

        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};