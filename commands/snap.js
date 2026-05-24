const path = require("path");

const cards =
  require("../data/cards");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB =
  require("../database");

function randomChoice(array) {

  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];

}

async function generateUniqueCode(
  collectionsCol
) {

  const chars =
    "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {

    let code = "";

    for (let i = 0; i < 6; i++) {

      code += chars.charAt(
        Math.floor(
          Math.random() *
          chars.length
        )
      );

    }

    const exists =
      await collectionsCol.findOne({
        code
      });

    if (!exists)
      return code;

  }

}

module.exports = {

  name: "snap",

  async execute(message) {

    const db =
      await connectDB();

    const inventoryCol =
      db.collection("inventory");

    const collectionsCol =
      db.collection("collections");

    const serialsCol =
      db.collection("serials");

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

    const stones = [

      "space_stone",
      "mind_stone",
      "reality_stone",
      "power_stone",
      "time_stone",
      "soul_stone"

    ];

    if (
      (items.gauntlet || 0) < 1
    ) {

      return message.reply(
        "❌ You need a Gauntlet."
      );

    }

    for (const stone of stones) {

      if (
        (items[stone] || 0) < 1
      ) {

        return message.reply(
          `❌ Missing ${stone}.`
        );

      }

    }

    const removeItems = {
      "items.gauntlet": -1
    };

    for (const stone of stones) {

      removeItems[
        `items.${stone}`
      ] = -1;

    }

    await inventoryCol.updateOne(

      { userId },

      {
        $inc: removeItems
      }

    );

    const legendaryCards =
      cards.filter(
        c =>
          c.tier === "legendary"
      );

    const epicCards =
      cards.filter(
        c =>
          c.tier === "epic"
      );

    const dropCards = [

      randomChoice(
        legendaryCards
      ),

      randomChoice(
        epicCards
      ),

      randomChoice(
        epicCards
      )

    ];

    const embed =
      new EmbedBuilder()

        .setColor(0xff9900)

        .setTitle(
          "🫰 The Snap Has Been Completed"
        )

        .setDescription(

          "Choose ONE reward card.\n\n" +

          `1️⃣ ${dropCards[0].name} (Legendary)\n` +

          `2️⃣ ${dropCards[1].name} (Epic)\n` +

          `3️⃣ ${dropCards[2].name} (Epic)`

        )

        .setImage(
          "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnlydjFueDBoazZoZmtqOTN0MXZpd2o1Mzh6b2tudG9rMjhld3A4biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LOoaJ2lbqmduxOaZpS/giphy.gif"
        )

        .setFooter({
          text:
            "Perfectly balanced... as all things should be."
        })

        .setTimestamp();

    const row =
      new ActionRowBuilder()

        .addComponents(

          new ButtonBuilder()
            .setCustomId("snap_0")
            .setLabel("1️⃣")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("snap_1")
            .setLabel("2️⃣")
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId("snap_2")
            .setLabel("3️⃣")
            .setStyle(ButtonStyle.Primary)

        );

    const msg =
      await message.reply({

        embeds: [embed],

        components: [row]

      });

    const collector =
      msg.createMessageComponentCollector({

        time: 30000

      });

    collector.on(
      "collect",

      async interaction => {

        if (
          interaction.user.id !==
          message.author.id
        ) {

          return interaction.reply({

            content:
              "❌ This is not your snap.",

            ephemeral: true

          });

        }

        collector.stop();

        const index =
          parseInt(

            interaction.customId
              .split("_")[1]

          );

        const selectedCard =
          dropCards[index];

        await serialsCol.updateOne(

          {
            cardId:
              selectedCard.id
          },

          {
            $inc: {
              serial: 1
            }
          },

          {
            upsert: true
          }

        );

        const serialDoc =
          await serialsCol.findOne({

            cardId:
              selectedCard.id

          });

        const serial =
          serialDoc.serial;

        const code =
          await generateUniqueCode(
            collectionsCol
          );

        await collectionsCol.insertOne({

          userId,

          cardId:
            selectedCard.id,

          serial,

          code,

          tag: null,

          favorite: false

        });

        const imageName =
          path.basename(
            selectedCard.image
          );

        const resultEmbed =
          new EmbedBuilder()

            .setColor(0x00ff99)

            .setTitle(
              "🌌 Snap Reward Claimed"
            )

            .setDescription(

              `You claimed:\n\n` +

              `**${selectedCard.name}**\n` +

              `└ ${code} ` +

              `• #${serial}`

            )

            .setImage(
              `attachment://${imageName}`
            )

            .setFooter({
              text:
                "The universe has shifted..."
            })

            .setTimestamp();

        const imagePath =
          path.join(

            __dirname,
            "..",
            "images",
            selectedCard.image

          );

        await interaction.update({

          content:
            "🫰 SNAP COMPLETE",

          embeds: [resultEmbed],

          files: [

            {
              attachment:
                imagePath,

              name:
                imageName
            }

          ],

          components: []

        });

      }

    );

  }

};