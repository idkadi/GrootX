const path = require("path");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const connectDB =
  require("../database");

const backgrounds = [

  {
    id: 1,
    name: "Spider-man",
    price: 2500,
    file: "spidermanbg.jpeg"
  },

  {
    id: 2,
    name: "Loki",
    price: 2500,
    file: "lokibg.jpeg"
  },

  {
    id: 3,
    name: "Punisher",
    price: 2500,
    file: "punisherbg.jpeg"
  },

  {
    id: 4,
    name: "Fantastic Four",
    price: 2500,
    file: "fantastic4bg.jpeg"
  },

  {
    id: 5,
    name: "Daredevil",
    price: 2500,
    file: "Daredevilbg.jpeg"
  }

];

function makeButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId("shopbg_back5")
        .setLabel("⏪")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("shopbg_prev")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("shopbg_buy")
        .setEmoji("🛒")
        .setLabel("Buy")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("shopbg_next")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("shopbg_skip5")
        .setLabel("⏩")
        .setStyle(ButtonStyle.Secondary)

    );

}

function makeEmbed(bg, index) {

  return new EmbedBuilder()

    .setColor(0x00aeff)

    .setTitle("🖼️ Background Shop")

    .setDescription(

      `Background **${index + 1}/${backgrounds.length}**\n\n` +

      `**${bg.name}**\n` +

      `Price: **${bg.price.toLocaleString()} <:grootcoin:1504742213110861834>**\n\n` +

      "⬅️ ➡️ = Navigate\n" +

      "⏪ ⏩ = Fast Skip\n" +

      "🛒 = Buy"

    )

    .setImage(
      `attachment://${bg.file}`
    );

}

function makeFile(bg) {

  return new AttachmentBuilder(

    path.join(
      __dirname,
      `../images/backgrounds/${bg.file}`
    )

  );

}

module.exports = {

  name: "shopbg",
  aliases: ["bgshop"],

  async execute(message) {

    const db =
      await connectDB();

    const balancesCol =
      db.collection("balances");

    const usersCol =
      db.collection("users");

    let index = 0;

    let bg =
      backgrounds[index];

    const msg =
      await message.reply({

        embeds: [
          makeEmbed(bg, index)
        ],

        files: [
          makeFile(bg)
        ],

        components: [
          makeButtons()
        ]

      });

    const collector =
      msg.createMessageComponentCollector({

        time: 300000

      });

    collector.on(
      "collect",

      async interaction => {

        collector.resetTimer();

        if (
          interaction.user.id !==
          message.author.id
        ) {

          return interaction.reply({

            content:
              "❌ This background shop is not for you.",

            ephemeral: true

          });

        }

        if (
          interaction.customId ===
          "shopbg_prev"
        ) {

          index--;

          if (index < 0)
            index =
              backgrounds.length - 1;

        }

        if (
          interaction.customId ===
          "shopbg_next"
        ) {

          index++;

          if (
            index >=
            backgrounds.length
          ) {

            index = 0;

          }

        }

        if (
          interaction.customId ===
          "shopbg_skip5"
        ) {

          index += 5;

          while (
            index >=
            backgrounds.length
          ) {

            index -=
              backgrounds.length;

          }

        }

        if (
          interaction.customId ===
          "shopbg_back5"
        ) {

          index -= 5;

          while (
            index < 0
          ) {

            index +=
              backgrounds.length;

          }

        }

        if (
          interaction.customId ===
          "shopbg_buy"
        ) {

          const selected =
            backgrounds[index];

          const userId =
            interaction.user.id;

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

          let userDoc =
            await usersCol.findOne({
              userId
            });

          if (!userDoc) {

            await usersCol.insertOne({
              userId,
              backgrounds: []
            });

            userDoc = {
              userId,
              backgrounds: []
            };

          }

          if (
            !Array.isArray(
              userDoc.backgrounds
            )
          ) {

            userDoc.backgrounds = [];

          }

          if (
            userDoc.backgrounds.includes(
              selected.id
            )
          ) {

            return interaction.reply({

              content:
                "❌ You already own this background.",

              ephemeral: true

            });

          }

          const coins =
            balanceDoc.coins || 0;

          if (
            coins <
            selected.price
          ) {

            return interaction.reply({

              content:

                `❌ You need **${selected.price.toLocaleString()} <:grootcoin:1504742213110861834>**.\n` +

                `You currently have **${coins.toLocaleString()} <:grootcoin:1504742213110861834>**.`,

              ephemeral: true

            });

          }

          const newBalance =
            coins - selected.price;

          await balancesCol.updateOne(

            { userId },

            {
              $set: {
                coins: newBalance
              }
            }

          );

          await usersCol.updateOne(

            { userId },

            {
              $push: {
                backgrounds: selected.id
              }
            }

          );

          return interaction.reply({

            content:

              `✅ You bought **${selected.name}** for **${selected.price.toLocaleString()} <:grootcoin:1504742213110861834>**.\n` +

              `Remaining <:grootcoin:1504742213110861834>: **${newBalance.toLocaleString()}**`,

            ephemeral: true

          });

        }

        bg =
          backgrounds[index];

        return interaction.update({

          embeds: [
            makeEmbed(bg, index)
          ],

          files: [
            makeFile(bg)
          ],

          components: [
            makeButtons()
          ]

        });

      }

    );

    collector.on(
      "end",

      async () => {

        await msg.edit({

          components: []

        }).catch(() => {});

      }

    );

  }

};