const cards =
  require("../data/season1");

const renderCard =
  require("../utils/renderCard");

const SEASON = 1;

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

    if (!exists) {
      return code;
    }
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
      {
        userId
      },
      {
        $inc: removeItems
      }
    );

    // ==========================================
    // SEASON 1 REWARD POOL
    // ==========================================

    const legendaryCards =
      cards.filter(
        card =>
          String(
            card.tier || ""
          ).toLowerCase() ===
          "legendary"
      );

    const epicCards =
      cards.filter(
        card =>
          String(
            card.tier || ""
          ).toLowerCase() ===
          "epic"
      );

    if (
      legendaryCards.length === 0
    ) {
      return message.reply(
        "❌ No Legendary cards are currently available in Season 1."
      );
    }

    if (
      epicCards.length === 0
    ) {
      return message.reply(
        "❌ No Epic cards are currently available in Season 1."
      );
    }

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

    // ==========================================
    // SNAP SELECTION
    // ==========================================

    const embed =
      new EmbedBuilder()

        .setColor(
          0xff9900
        )

        .setTitle(
          "🫰 The Snap Has Been Completed • S1"
        )

        .setDescription(
          "Choose ONE **Season 1** reward card.\n\n" +

          `1️⃣ ${dropCards[0].name} (Legendary)\n` +

          `2️⃣ ${dropCards[1].name} (Epic)\n` +

          `3️⃣ ${dropCards[2].name} (Epic)`
        )

        .setImage(
          "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnlydjFueDBoazZoZmtqOTN0MXZpd2o1Mzh6b2tudG9rMjhld3A4biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LOoaJ2lbqmduxOaZpS/giphy.gif"
        )

        .setFooter({
          text:
            "1️⃣ Season 1 • Perfectly balanced... as all things should be."
        })

        .setTimestamp();

    const row =
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              "snap_0"
            )
            .setLabel(
              "1️⃣"
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "snap_1"
            )
            .setLabel(
              "2️⃣"
            )
            .setStyle(
              ButtonStyle.Primary
            ),

          new ButtonBuilder()
            .setCustomId(
              "snap_2"
            )
            .setLabel(
              "3️⃣"
            )
            .setStyle(
              ButtonStyle.Primary
            )
        );

    const msg =
      await message.reply({
        embeds: [
          embed
        ],

        components: [
          row
        ]
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

            ephemeral:
              true
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

        if (!selectedCard) {
          return interaction.reply({
            content:
              "❌ Invalid Snap reward.",

            ephemeral:
              true
          });
        }

        // ======================================
        // SEASON 1 SERIAL
        // ======================================

        await serialsCol.updateOne(
          {
            cardId:
              Number(
                selectedCard.id
              ),

            season:
              SEASON
          },

          {
            $inc: {
              serial:
                1
            },

            $setOnInsert: {
              season:
                SEASON
            }
          },

          {
            upsert:
              true
          }
        );

        const serialDoc =
          await serialsCol.findOne({
            cardId:
              Number(
                selectedCard.id
              ),

            season:
              SEASON
          });

        if (!serialDoc) {
          return interaction.reply({
            content:
              "❌ Failed to generate card serial.",

            ephemeral:
              true
          });
        }

        const serial =
          serialDoc.serial;

        // ======================================
        // UNIQUE OWNED CARD CODE
        // ======================================

        const code =
          await generateUniqueCode(
            collectionsCol
          );

        // ======================================
        // SAVE AS SEASON 1 OWNED CARD
        // ======================================

        await collectionsCol.insertOne({
          userId,

          cardId:
            Number(
              selectedCard.id
            ),

          season:
            SEASON,

          serial,

          code,

          tag:
            null,

          favorite:
            false
        });

        // ======================================
        // RENDER S1 DESIGN
        // ======================================

        /*
         * This goes through renderCard().
         *
         * Since season = 1:
         *
         * rawImage
         *   ↓
         * default S1 tier frame
         *   ↓
         * character name
         *   ↓
         * appearance / movie
         *
         * No custom frame is supplied here,
         * because this is a newly-created card.
         */

        let buffer;

        try {
          buffer =
            await renderCard(
              {
                ...selectedCard,

                season:
                  SEASON
              },

              serial,

              {
                season:
                  SEASON
              }
            );
        } catch (error) {
          console.error(
            "Snap reward render failed:",
            error
          );

          return interaction.reply({
            content:
              "❌ Failed to render the Snap reward.",

            ephemeral:
              true
          });
        }

        const imageName =
          `snap-${selectedCard.id}-s1-${serial}.png`;

        // ======================================
        // RESULT
        // ======================================

        const resultEmbed =
          new EmbedBuilder()

            .setColor(
              0x00ff99
            )

            .setTitle(
              "🌌 Snap Reward Claimed"
            )

            .setDescription(
              `You claimed:\n\n` +

              `1️⃣ **${selectedCard.name}**\n` +

              `└ \`${code}\` ` +

              `• **#${serial}**`
            )

            .addFields(
              {
                name:
                  "🗓️ Season",

                value:
                  "1️⃣ **Season 1**",

                inline:
                  true
              },

              {
                name:
                  "🎴 Tier",

                value:
                  `**${selectedCard.tier}**`,

                inline:
                  true
              },

              {
                name:
                  "🎬 Appearance",

                value:
                  selectedCard.appearance ||
                  selectedCard.show ||
                  "Unknown"
              }
            )

            .setImage(
              `attachment://${imageName}`
            )

            .setFooter({
              text:
                "1️⃣ Season 1 • The universe has shifted..."
            })

            .setTimestamp();

        await interaction.update({
          content:
            "🫰 **SNAP COMPLETE**",

          embeds: [
            resultEmbed
          ],

          files: [
            {
              attachment:
                buffer,

              name:
                imageName
            }
          ],

          components:
            []
        });
      }
    );

    // ==========================================
    // TIMEOUT
    // ==========================================

    collector.on(
      "end",

      async (
        collected
      ) => {
        if (
          collected.size > 0
        ) {
          return;
        }

        await msg
          .edit({
            components:
              []
          })
          .catch(() => {});
      }
    );
  }
};