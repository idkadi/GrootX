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
    price: 5000,
    file: "spidermanbg.jpeg"
  },

  {
    id: 2,
    name: "Loki",
    price: 5000,
    file: "lokibg.jpeg"
  },

  {
    id: 3,
    name: "Punisher",
    price: 5000,
    file: "punisherbg.jpeg"
  },

  {
    id: 4,
    name: "Fantastic Four",
    price: 5000,
    file: "fantastic4bg.jpeg"
  },

  {
    id: 5,
    name: "Daredevil",
    price: 5000,
    file: "daredevilbg.jpeg"
  },

   {
    id: 6,
    name: "Deadpool",
    price: 5000,
    file: "deadpoolbg.jpeg"
  },

  {
    id: 7,
    name: "Iron Man",
    price: 5000,
    file: "ironmanbg.jpeg"
  },

  {
    id: 8,
    name: "Civil War",
    price: 5000,
    file: "civilwarbg.jpeg"
  },

  {
    id: 9,
    name: "MoonKnight",
    price: 5000,
    file: "moonknightbg.jpeg"
  },

  {
    id: 10,
    name: "The Amazing Spider-man",
    price: 5000,
    file: "tasmbg.jpeg"
  },

   {
    id: 11,
    name: "Venom",
    price: 5000,
    file: "venombg.jpeg"
  },

    {
    id: 12,
    name: "Thor : Love and Thunder",
    price: 5000,
    file: "loveandthunderbg.jpeg"
  },

   {
    id: 13,
    name: "Ms. Marvel",
    price: 3000,
    file: "msmarvelbg.jpeg"
  },

   {
    id: 14,
    name: "She Hulk",
    price: 3000,
    file: "shehulkbg.jpeg"
  },

    {
    id: 15,
    name: "Dr. Strange : Multiverse of Madness",
    price: 5000,
    file: "multiversebg.jpeg"
  },

    {
    id: 16,
    name: "Avengers : Endgame",
    price: 8000,
    file: "endgamebg.jpeg"
  },

   {
    id: 17,
    name: "Venom Last Dance",
     price: 5000,
    file: "lastdancebg.jpeg"
  },

   {
    id: 18,
    name: "Miguel O'Hara",
     price: 5000,
    file: "2099bg.jpeg"
  },

    {
    id: 19,
    name: "Guardians of Galaxy",
     price: 5000,
    file: "gotgbg.jpeg"
  },

   {
    id: 20,
    name: "Spider-Verse",
     price: 5000,
    file: "spiderversebg.jpeg"
  },

   {
    id: 21,
    name: "Thunderbolts",
     price: 5000,
    file: "thunderboltsbg.jpeg"
  },

   {
    id: 22,
    name: "Marvel Pets",
     price: 2500,
    file: "petsbg.jpeg"
  },
  

  


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