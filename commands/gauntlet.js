const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

// ITEM EMOJIS
function getItemEmoji(item) {

  switch (item) {

    case "space_stone":
      return "<:space:1504749742683324506>";

    case "mind_stone":
      return "<:mind:1504749347592605716>";

    case "reality_stone":
      return "<:reality:1504749391645376542>";

    case "power_stone":
      return "<:power:1504749435177930857>";

    case "time_stone":
      return "<:time:1504749635829239839>";

    case "soul_stone":
      return "<:soul:1504749686911799296>";

    default:
      return "💎";

  }

}

// FORMAT NAME
function formatItemName(item) {

  return item

    .split("_")

    .map(word =>

      word.charAt(0).toUpperCase() +
      word.slice(1)

    )

    .join(" ");

}

module.exports = {

  name: "gauntlet",
  aliases: ["g"],

  async execute(message) {

    const db =
      await connectDB();

    const inventoryCol =
      db.collection("inventory");

    const userId =
      message.author.id;

    let inventoryDoc =
      await inventoryCol.findOne({
        userId
      });

    if (!inventoryDoc) {

      await inventoryCol.insertOne({

        userId,

        items: {}

      });

      inventoryDoc = {

        userId,

        items: {}

      };

    }

    const userInventory =
      inventoryDoc.items || {};

    // STONES
    const stones = [

      "space_stone",
      "mind_stone",
      "reality_stone",
      "power_stone",
      "time_stone",
      "soul_stone"

    ];

    let progressText = "";

    let ownedStones = 0;

    for (const stone of stones) {

      const owned =
        (userInventory[stone] || 0) > 0;

      if (owned)
        ownedStones++;

      progressText +=

        `${owned ? "✅" : "❌"} ` +

        `${getItemEmoji(stone)} ` +

        `${formatItemName(stone)}\n`;

    }

    const gauntlets =
      userInventory.gauntlet || 0;

    const infinityGauntlets =
      userInventory.infinity_gauntlet || 0;

    const ready =
      ownedStones === 6 &&
      gauntlets >= 1;

    const embed =
      new EmbedBuilder()

        .setColor(0x8b5cf6)

        .setTitle(
          `🧤 ${message.author.username}'s Gauntlet`
        )

        .setDescription(

          ready

            ? "⚡ You are ready to use `!snap`."

            : "Collect all 6 stones and a Gauntlet."

        )

        .addFields(

          {
            name:
              "💎 Infinity Stones",

            value:
              progressText,

            inline: false
          },

          {
            name:
              "<:guantlet:1504854241360085066> Gauntlets",

            value:
              `${gauntlets}`,

            inline: true
          },

          {
            name:
              "🌌 Infinity Gauntlets",

            value:
              `${infinityGauntlets}`,

            inline: true
          }

        )

        .setFooter({

          text:
            "The Infinity Saga continues..."

        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};