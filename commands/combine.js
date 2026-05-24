const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

function formatItemName(item) {

  return item

    .split("_")

    .map(word =>

      word.charAt(0).toUpperCase() +
      word.slice(1)

    )

    .join(" ");

}

function getItemEmoji(item) {

  switch (item) {

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
      return "✨";

  }

}

module.exports = {

  name: "combine",

  async execute(message, args) {

    if (!args[0]) {

      return message.reply(

        "❌ Please provide a shard type.\n" +

        "Example: `!combine power_shard`"

      );

    }

    const shard =
      args[0].toLowerCase();

    const validShards = [

      "space_shard",
      "mind_shard",
      "reality_shard",
      "power_shard",
      "time_shard",
      "soul_shard"

    ];

    if (
      !validShards.includes(shard)
    ) {

      return message.reply(
        "❌ Invalid shard type."
      );

    }

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

    const items =
      inventoryDoc.items || {};

    const shardAmount =
      items[shard] || 0;

    if (shardAmount < 100) {

      return message.reply(

        `❌ You need 100 ` +

        `${formatItemName(shard)} ` +

        `to combine into a stone.`

      );

    }

    const stone =
      shard.replace(
        "_shard",
        "_stone"
      );

    await inventoryCol.updateOne(

      { userId },

      {
        $inc: {

          [`items.${shard}`]: -100,

          [`items.${stone}`]: 1

        }
      }

    );

    const embed =
      new EmbedBuilder()

        .setColor(0x8b5cf6)

        .setTitle(
          "✨ Shards Combined"
        )

        .setDescription(

          `${getItemEmoji(shard)} ` +

          `100 ${formatItemName(shard)}\n\n` +

          `combined into\n\n` +

          `${getItemEmoji(stone)} ` +

          `**${formatItemName(stone)}**`

        )

        .setFooter({

          text:
            "The Infinity Stone has been forged."

        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};