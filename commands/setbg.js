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
    id: 0,
    name: "Simple White",
    file: "whitebg.jpeg",
    free: true
  },

  {
    id: 1,
    name: "Spider-man 1",
    file: "spidermanbg.jpeg",
    free: false
  },

  {
    id: 2,
    name: "Loki",
    file: "lokibg.jpeg",
    free: false
  },

  {
    id: 3,
    name: "Punisher",
    file: "punisherbg.jpeg",
    free: false
  },

  {
    id: 4,
    name: "Fantastic Four",
    file: "fantastic4bg.jpeg",
    free: false
  },

  {
    id: 5,
    name: "Daredevil",
    file: "daredevilbg.jpeg",
    free: false
  },

    {
    id: 6,
    name: "Deadpool",
    file: "deadpoolbg.jpeg",
    free: false
  },

  {
    id: 7,
    name: "Iron Man",
    file: "ironmanbg.jpeg",
    free: false
  },

  {
    id: 8,
    name: "Civil War",
    file: "civilwarbg.jpeg",
    free: false
  },

  {
    id: 9,
    name: "MoonKnight",
    file: "moonknightbg.jpeg",
    free: false
  },

  {
    id: 10,
    name: "The Amazing Spider-man",
    file: "tasmbg.jpeg",
    free: false
  },

   {
    id: 11,
    name: "Venom",
    file: "venombg.jpeg",
    free: false
  },

   {
    id: 12,
    name: "Thor : Love and Thunder",
    file: "loveandthunderbg.jpeg",
    free: false

  },

   {
    id: 13,
    name: "Ms. Marvel",
    file: "msmarvelbg.jpeg",
    free: false
  },

   {
    id: 14,
    name: "She Hulk",
    file: "shehulkbg.jpeg",
     free: false
  },

    {
    id: 15,
    name: "Dr. Strange : Multiverse of Madness",
    file: "multiversebg.jpeg",
     free: false
  },

    {
    id: 16,
    name: "Avengers : Endgame",
    file: "endgamebg.jpeg",
     free: false
  },

   {
    id: 17,
    name: "Venom Last Dance",
    file: "lastdancebg.jpeg",
    free: false
  },

   {
    id: 18,
    name: "Miguel O'Hara",
    file: "2099bg.jpeg",
    free: false
  },

    {
    id: 19,
    name: "Guardians of Galaxy",
    file: "gotgbg.jpeg",
    free: false
  },

   {
    id: 20,
    name: "Spider-Verse",
    file: "spiderversebg.jpeg",
    free: false
  },

   {
    id: 21,
    name: "Thunderbolts",
    file: "thunderboltsbg.jpeg",
    free: false
  },

   {
    id: 22,
    name: "Marvel Pets",
    file: "petsbg.jpeg",
     free: false
  },

   {
    id: 23,
    name: "Captain America",
    file: "captainamericabg.jpeg",
     free: false
  },

    {
    id: 24,
    name: "Homecoming",
    file: "homecomingbg.jpeg",
     free: false
  },

   {
    id: 25,
    name: "Dr. Strange",
    file: "drstrangebg.jpeg",
     free: false
  },



];

function makeButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId("bg_prev")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("bg_select")
        .setEmoji("✅")
        .setLabel("Select")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("bg_next")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary)

    );

}

function makeEmbed(
  bg,
  albumName,
  pageNumber,
  index,
  total
) {

  return new EmbedBuilder()

    .setColor(0x00aeff)

    .setTitle(
      "🖼️ Choose Album Background"
    )

    .setDescription(

      `Album: **${albumName}**\n` +

      `Page: **${pageNumber}**\n\n` +

      `Background **${index + 1}/${total}**\n` +

      `**${bg.name}**\n\n` +

      "Use ⬅️ ➡️ to browse.\n" +

      "Press ✅ to select."

    )

    .setImage(
      `attachment://${bg.file}`
    );

}

module.exports = {

  name: "setbg",
  aliases: ["background", "setbackground"],

  async execute(message, args) {

    const pageNumber =
      parseInt(
        args[args.length - 1]
      );

    const albumName =
      args.slice(0, -1).join(" ");

    if (
      !albumName ||
      isNaN(pageNumber)
    ) {

      return message.reply(

        "❌ Use: `!setbg <album name> <page number>`"

      );

    }

    const db =
      await connectDB();

    const albumsCol =
      db.collection("albums");

    const usersCol =
      db.collection("users");

    const userId =
      message.author.id;

    const album =
      await albumsCol.findOne({

        userId,

        name: {
          $regex:
            `^${albumName}$`,
          $options: "i"
        }

      });

    if (!album) {

      return message.reply(
        "❌ Album not found."
      );

    }

    if (
      !album.pages ||
      !album.pages[pageNumber - 1]
    ) {

      return message.reply(
        "❌ That page does not exist."
      );

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

    const ownedBackgrounds =
      backgrounds.filter(bg =>

        bg.free ||

        userDoc.backgrounds.includes(
          bg.id
        )

      );

    if (
      ownedBackgrounds.length === 0
    ) {

      return message.reply(

        "❌ You don't own any backgrounds."

      );

    }

    let index = 0;

    let bg =
      ownedBackgrounds[index];

    const file =
      new AttachmentBuilder(

        `./images/backgrounds/${bg.file}`

      );

    const msg =
      await message.reply({

        embeds: [

          makeEmbed(

            bg,

            album.name,

            pageNumber,

            index,

            ownedBackgrounds.length

          )

        ],

        files: [file],

        components: [
          makeButtons()
        ]

      });

    const collector =
      msg.createMessageComponentCollector({
        time: 60000
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
              "❌ This menu is not for you.",

            ephemeral: true

          });

        }

        if (
          interaction.customId ===
          "bg_prev"
        ) {

          index--;

          if (index < 0) {

            index =
              ownedBackgrounds.length - 1;

          }

        }

        if (
          interaction.customId ===
          "bg_next"
        ) {

          index++;

          if (
            index >=
            ownedBackgrounds.length
          ) {

            index = 0;

          }

        }

        if (
          interaction.customId ===
          "bg_select"
        ) {

          const selected =
            ownedBackgrounds[index];

          const freshAlbum =
            await albumsCol.findOne({

              userId,

              name: {
                $regex:
                  `^${albumName}$`,
                $options: "i"
              }

            });

          if (!freshAlbum) {

            return interaction.reply({

              content:
                "❌ Album not found.",

              ephemeral: true

            });

          }

          freshAlbum
            .pages[pageNumber - 1]
            .background =
              selected.id;

          freshAlbum
            .pages[pageNumber - 1]
            .backgroundFile =
              selected.file;

          await albumsCol.updateOne(

            {
              _id:
                freshAlbum._id
            },

            {
              $set: {
                pages:
                  freshAlbum.pages
              }
            }

          );

          collector.stop(
            "selected"
          );

          const selectedFile =
            new AttachmentBuilder(

              `./images/backgrounds/${selected.file}`

            );

          const selectedEmbed =
            new EmbedBuilder()

              .setColor(0x00ff99)

              .setTitle(
                "✅ Background Selected"
              )

              .setDescription(

                `Album: **${freshAlbum.name}**\n` +

                `Page: **${pageNumber}**\n\n` +

                `Selected Background:\n` +

                `**${selected.name}**`

              )

              .setImage(
                `attachment://${selected.file}`
              );

          return interaction.update({

            embeds: [
              selectedEmbed
            ],

            files: [
              selectedFile
            ],

            components: []

          });

        }

        bg =
          ownedBackgrounds[index];

        const newFile =
          new AttachmentBuilder(

            `./images/backgrounds/${bg.file}`

          );

        return interaction.update({

          embeds: [

            makeEmbed(

              bg,

              album.name,

              pageNumber,

              index,

              ownedBackgrounds.length

            )

          ],

          files: [
            newFile
          ],

          components: [
            makeButtons()
          ]

        });

      }

    );

    collector.on(
      "end",

      async (_, reason) => {

        if (
          reason === "selected"
        ) return;

        await msg.edit({

          components: []

        }).catch(() => {});

      }

    );

  }

};