const {
  EmbedBuilder
} = require("discord.js");

module.exports = {

  name: "store",
  aliases: ["shop"],

  async execute(message) {

    const embed =
      new EmbedBuilder()

        .setColor(0x00aeff)

        .setTitle(
          "🛒 GrootX Store"
        )

        .setDescription(
          "Purchase items using <:grootcoin:1504742213110861834> Coins or 🎫 Ultron Chips.\n" +
          "Use `!buy <item>` to purchase."
        )

        .addFields(

          {
            name:
              "<:guantlet:1504854241360085066> Gauntlet",

            value:
              "**Cost:** 15,000 Coins\n" +
              "**Use:** Required for the Snap system.",

            inline: false
          },

          {
            name:
              "📜 Trade Voucher",

            value:
              "**Cost:** 7,000 Coins\n" +
              "**Use:** Required to trade with other players.\n" +
              "**Duration:** Expires after 30 days.",

            inline: false
          },

          {
            name:
              "📘 Album",

            value:
              "**Cost:** 5,000 Coins\n" +
              "**Use:** Create a custom card album.",

            inline: false
          },

          {
            name:
              "📄 Page",

            value:
              "**Cost:** 1,500 Coins\n" +
              "**Use:** Add one extra page inside an album.",

            inline: false
          },

          {
            name:
              "🌌 Extra Drop",

            value:
              "**Cost:** 1 🎫 Ultron Chip\n" +
              "**Use:** Instantly gives you one extra drop.",

            inline: false
          },

          {
            name:
              "⚡ Extra Grab",

            value:
              "**Cost:** 1 🎫 Ultron Chip\n" +
              "**Use:** Instantly resets your pickup/grab cooldown once.",

            inline: false
          },

          {
            name:
              "✨ Shard Booster",

            value:
              "**Cost:** 3 🎫 Ultron Chips\n" +
              "**Use:** Gives 2x shards from your next burn.",

            inline: false
          },

          {
            name:
              "💰 Coin Booster",

            value:
              "**Cost:** 3 🎫 Ultron Chips\n" +
              "**Use:** Gives 2x coins from your next burn.",

            inline: false
          }

        )

        .setFooter({
          text:
            "GrootX Store • Use !buy <item>"
        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};