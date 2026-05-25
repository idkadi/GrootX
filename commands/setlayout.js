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

const layouts = [

  { id: 1, name: "1 Card Center" },
  { id: 2, name: "2 Cards Side by Side" },
  { id: 3, name: "3 Cards Row" },
  { id: 4, name: "4 Cards Grid" },
  { id: 5, name: "5 Cards Showcase" },
  { id: 6, name: "6 Cards Grid" },
  { id: 7, name: "7 Cards Showcase" },
  { id: 8, name: "8 Cards Full Page" }

];

function makeButtons() {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId("layout_prev")
        .setEmoji("⬅️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("layout_select")
        .setEmoji("✅")
        .setLabel("Select")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId("layout_next")
        .setEmoji("➡️")
        .setStyle(ButtonStyle.Secondary)

    );

}

module.exports = {

  name: "setlayout",
  aliases: ["layout"],

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

        "❌ Use: `!setlayout <album name> <page number>`"

      );

    }

    const db =
      await connectDB();

    const albumsCol =
      db.collection("albums");

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

    let index = 0;

    const currentLayout =
      layouts[index];

    const file =
      new AttachmentBuilder(

        `./images/layouts/layout${currentLayout.id}.png`

      );

    const embed =
      new EmbedBuilder()

        .setColor(0x00aeff)

        .setTitle(
          "📖 Choose Album Layout"
        )

        .setDescription(

          `Album: **${album.name}**\n` +

          `Page: **${pageNumber}**\n\n` +

          `Viewing Layout **${currentLayout.id}/${layouts.length}**\n` +

          `**${currentLayout.name}**\n\n` +

          "Use ⬅️ ➡️ to browse layouts.\n" +

          "Press ✅ to select."

        )

        .setImage(
          `attachment://layout${currentLayout.id}.png`
        );

    const msg =
      await message.reply({

        embeds: [embed],

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
          "layout_prev"
        ) {

          index--;

          if (index < 0) {

            index =
              layouts.length - 1;

          }

        }

        if (
          interaction.customId ===
          "layout_next"
        ) {

          index++;

          if (
            index >= layouts.length
          ) {

            index = 0;

          }

        }

        if (
          interaction.customId ===
          "layout_select"
        ) {

          const selectedLayout =
            layouts[index];

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
            .layout =
              selectedLayout.id;

          freshAlbum
            .pages[pageNumber - 1]
            .slots = [];

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

              `./images/layouts/layout${selectedLayout.id}.png`

            );

          const selectedEmbed =
            new EmbedBuilder()

              .setColor(0x00ff99)

              .setTitle(
                "✅ Layout Selected"
              )

              .setDescription(

                `Album: **${freshAlbum.name}**\n` +

                `Page: **${pageNumber}**\n\n` +

                `Selected Layout: **${selectedLayout.id}**\n` +

                `**${selectedLayout.name}**`

              )

              .setImage(

                `attachment://layout${selectedLayout.id}.png`

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

        const layout =
          layouts[index];

        const newFile =
          new AttachmentBuilder(

            `./images/layouts/layout${layout.id}.png`

          );

        const newEmbed =
          new EmbedBuilder()

            .setColor(0x00aeff)

            .setTitle(
              "📖 Choose Album Layout"
            )

            .setDescription(

              `Album: **${album.name}**\n` +

              `Page: **${pageNumber}**\n\n` +

              `Viewing Layout **${layout.id}/${layouts.length}**\n` +

              `**${layout.name}**\n\n` +

              "Use ⬅️ ➡️ to browse layouts.\n" +

              "Press ✅ to select."

            )

            .setImage(

              `attachment://layout${layout.id}.png`

            );

        await interaction.update({

          embeds: [newEmbed],

          files: [newFile],

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