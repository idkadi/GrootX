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
          "Purchase items using Coins or Tokens."
        )

        .addFields(

          {
            name:
              "<:guantlet:1504854241360085066> Gauntlet",

            value:
              "Cost: 15,000 Coins\n" +
              "Used for the Snap system.",

            inline: false
          },

          {
            name:
              "📜 Trade Voucher",

            value:
              "Cost: 7,000 Coins\n" +
              "Required to trade with other players.\n" +
              "Expires after 30 days.",

            inline: false
          },

          {
            name:
              "📘 Album",

            value:
              "Cost: 5,000 Coins\n" +
              "Used to create a custom card album.",

            inline: false
          },

          {
            name:
              "📄 Page",

            value:
              "Cost: 1,500 Coins\n" +
              "Used to add a page inside an album.",

            inline: false
          },

          {
            name:
              "🌌 Extra Drop",

            value:
              "Cost: 1 Token\n" +
              "Instantly grants an extra drop.",

            inline: false
          },

          {
            name:
              "✨ Shard Booster",

            value:
              "Cost: 3 Tokens\n" +
              "2x shards from next burn.",

            inline: false
          },

          {
            name:
              "💰 Coin Booster",

            value:
              "Cost: 3 Tokens\n" +
              "2x coins from next burn.",

            inline: false
          }

        )

        .setFooter({
          text:
            "Use !buy <item> to purchase."
        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};