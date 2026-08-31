const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const cards = require("../data/season1");
const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const SEASON = 1;

const rewards = {
  common: 200,
  uncommon: 300,
  rare: 500,
  epic: 700,
  legendary: 1500
};

function clean(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

function getTierEmoji(tier) {
  switch (
    String(tier || "")
      .toLowerCase()
  ) {
    case "common":
      return "<:common:1504510702956839033>";

    case "uncommon":
      return "<:uncommon:1504510929210052698>";

    case "rare":
      return "<:rare:1504510606718275764>";

    case "epic":
      return "<:epic:1504510771214680175>";

    case "legendary":
      return "<:legendary:1504511435974377552>";

    default:
      return "❓";
  }
}

module.exports = {
  name: "series",

  async execute(message, args) {
    // ==========================================
    // SERIES SEARCH
    // ==========================================

    if (!args.length) {
      return message.reply(
        "❌ Use: `!series <series name>`\n" +
        "Example: `!series Iron Man`"
      );
    }

    const query =
      clean(
        args.join(" ")
      );

    /*
     * SERIES NOW USES SEASON 1 ONLY.
     *
     * All cards come from:
     * data/season1.js
     */

    const seriesCards =
      cards
        .filter(card =>
          clean(
            card.appearance ||
            card.show
          ) === query
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        );

    if (
      seriesCards.length === 0
    ) {
      return message.reply(
        "❌ Series not found in 1️⃣ **Season 1**. " +
        "Use the exact series name."
      );
    }

    const seriesName =
      seriesCards[0].appearance ||
      seriesCards[0].show ||
      "Unknown";

    // ==========================================
    // DATABASE
    // ==========================================

    const db =
      await connectDB();

    const collectionsCol =
      db.collection("collections");

    const balancesCol =
      db.collection("balances");

    const rewardsCol =
      db.collection("seriesRewards");

    const userId =
      message.author.id;

    // ==========================================
    // OWNED S1 CARDS
    // ==========================================

    async function getOwnedIds() {
      /*
       * IMPORTANT:
       *
       * Only Season 1 owned cards count.
       *
       * Old cards without season are S0,
       * therefore they DO NOT count here.
       */

      const userCards =
        await collectionsCol
          .find({
            userId,
            season: SEASON
          })
          .toArray();

      return new Set(
        userCards.map(card =>
          Number(card.cardId)
        )
      );
    }

    let ownedIds =
      await getOwnedIds();

    // ==========================================
    // COMPLETION
    // ==========================================

    function getCompleted() {
      return seriesCards.every(
        card =>
          ownedIds.has(
            Number(card.id)
          )
      );
    }

    let completed =
      getCompleted();

    // ==========================================
    // REWARD CLAIM
    // ==========================================

    /*
     * Reward is season-aware.
     *
     * This prevents an old S0 series reward
     * with the same name from blocking S1.
     */

    let alreadyClaimed =
      await rewardsCol.findOne({
        userId,
        series: seriesName,
        season: SEASON
      });

    // ==========================================
    // REWARD VALUE
    // ==========================================

    const totalReward =
      seriesCards.reduce(
        (total, card) => {
          const tier =
            String(
              card.tier || ""
            ).toLowerCase();

          return (
            total +
            (
              rewards[tier] ||
              0
            )
          );
        },
        0
      );

    // ==========================================
    // VIEW STATE
    // ==========================================

    const perPage = 15;

    let page = 0;
    let imageIndex = 0;

    let viewMode =
      "list";

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          seriesCards.length /
          perPage
        )
      );

    // ==========================================
    // OWNED COUNT
    // ==========================================

    function ownedCount() {
      return seriesCards.filter(
        card =>
          ownedIds.has(
            Number(card.id)
          )
      ).length;
    }

    // ==========================================
    // LIST VIEW
    // ==========================================

    function generateListEmbed() {
      const start =
        page * perPage;

      const currentCards =
        seriesCards.slice(
          start,
          start + perPage
        );

      const list =
        currentCards
          .map(
            (card, index) => {
              const owned =
                ownedIds.has(
                  Number(card.id)
                );

              return (
                `${owned ? "✅" : "☐"} ` +
                `**${start + index + 1}. ${card.name}** ` +
                `${getTierEmoji(card.tier)}`
              );
            }
          )
          .join("\n");

      return new EmbedBuilder()
        .setColor(
          completed
            ? 0x00ff99
            : 0x00aeff
        )

        .setTitle(
          `📘 1️⃣ ${seriesName}`
        )

        .setDescription(
          list ||
          "No cards found."
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
              "🎁 Completion Reward",

            value:
              `<:grootcoin:1504742213110861834> ` +
              `**${totalReward} Coins**`,

            inline:
              true
          },

          {
            name:
              "📊 Progress",

            value:
              `**${ownedCount()}/${seriesCards.length}**`,

            inline:
              true
          }
        )

        .setFooter({
          text:
            `1️⃣ Season 1 • ` +
            `List View • ` +
            `Page ${page + 1}/${totalPages} • ` +
            (
              alreadyClaimed
                ? "Reward already claimed."
                : completed
                  ? "Completed. Claim your reward!"
                  : "Collect all S1 cards to claim reward."
            )
        })

        .setTimestamp();
    }

    // ==========================================
    // IMAGE VIEW
    // ==========================================

    async function generateImagePayload() {
      const card =
        seriesCards[
          imageIndex
        ];

      const owned =
        ownedIds.has(
          Number(card.id)
        );

      /*
       * Series isn't viewing a specific owned
       * copy, so no serial/frameId is passed.
       *
       * renderCard receives season: 1,
       * therefore it renders the normal S1 card.
       */

      const buffer =
        await renderCard(
          {
            ...card,
            season: SEASON
          },
          "?",
          {
            season: SEASON
          }
        );

      const imageName =
        `series-${card.id}-s1.png`;

      const attachment =
        new AttachmentBuilder(
          buffer,
          {
            name:
              imageName
          }
        );

      const embed =
        new EmbedBuilder()

          .setColor(
            owned
              ? 0x00ff99
              : 0xff5555
          )

          .setTitle(
            `${owned ? "✅" : "☐"} ` +
            `1️⃣ ${card.name}`
          )

          .setDescription(
            `${getTierEmoji(card.tier)} ` +
            `**${card.tier}**\n\n` +

            `Season: **1️⃣ Season 1**\n` +

            `Series: **${seriesName}**\n` +

            `Card: **${imageIndex + 1}/${seriesCards.length}**\n` +

            `Status: **${owned ? "Owned" : "Missing"}**`
          )

          .addFields(
            {
              name:
                "🎁 Completion Reward",

              value:
                `<:grootcoin:1504742213110861834> ` +
                `**${totalReward} Coins**`,

              inline:
                true
            },

            {
              name:
                "📊 Progress",

              value:
                `**${ownedCount()}/${seriesCards.length}**`,

              inline:
                true
            }
          )

          .setImage(
            `attachment://${imageName}`
          )

          .setFooter({
            text:
              `1️⃣ Season 1 • ` +
              (
                alreadyClaimed
                  ? "Reward already claimed."
                  : completed
                    ? "Completed. Claim your reward!"
                    : "Collect all S1 cards to claim reward."
              )
          })

          .setTimestamp();

      return {
        embeds: [
          embed
        ],

        files: [
          attachment
        ],

        components: [
          makeNavRow(),
          makeClaimRow()
        ]
      };
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    function makeNavRow() {
      return new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "series_prev"
            )

            .setLabel(
              "⬅️"
            )

            .setStyle(
              ButtonStyle.Primary
            )

            .setDisabled(
              viewMode === "list"
                ? totalPages <= 1
                : seriesCards.length <= 1
            ),

          new ButtonBuilder()
            .setCustomId(
              "series_view"
            )

            .setLabel(
              viewMode === "list"
                ? "Image View"
                : "List View"
            )

            .setEmoji(
              "🖼️"
            )

            .setStyle(
              ButtonStyle.Secondary
            ),

          new ButtonBuilder()
            .setCustomId(
              "series_next"
            )

            .setLabel(
              "➡️"
            )

            .setStyle(
              ButtonStyle.Primary
            )

            .setDisabled(
              viewMode === "list"
                ? totalPages <= 1
                : seriesCards.length <= 1
            )
        );
    }

    // ==========================================
    // CLAIM BUTTON
    // ==========================================

    function makeClaimRow() {
      return new ActionRowBuilder()
        .addComponents(

          new ButtonBuilder()
            .setCustomId(
              "series_claim"
            )

            .setLabel(
              alreadyClaimed
                ? "Claimed"
                : "Claim Reward"
            )

            .setEmoji(
              alreadyClaimed
                ? "✅"
                : "🎁"
            )

            .setStyle(
              alreadyClaimed
                ? ButtonStyle.Secondary
                : ButtonStyle.Success
            )

            .setDisabled(
              !completed ||
              !!alreadyClaimed
            )
        );
    }

    // ==========================================
    // PAYLOAD
    // ==========================================

    async function getPayload() {
      if (
        viewMode === "image"
      ) {
        return generateImagePayload();
      }

      return {
        embeds: [
          generateListEmbed()
        ],

        files: [],

        components: [
          makeNavRow(),
          makeClaimRow()
        ]
      };
    }

    // ==========================================
    // SEND
    // ==========================================

    const msg =
      await message.reply(
        await getPayload()
      );

    const collector =
      msg.createMessageComponentCollector({
        time: 120000
      });

    // ==========================================
    // INTERACTIONS
    // ==========================================

    collector.on(
      "collect",

      async interaction => {
        collector.resetTimer();

        if (
          interaction.user.id !==
          userId
        ) {
          return interaction.reply({
            content:
              "❌ This series menu is not for you.",

            ephemeral:
              true
          });
        }

        // ======================================
        // VIEW
        // ======================================

        if (
          interaction.customId ===
          "series_view"
        ) {
          viewMode =
            viewMode === "list"
              ? "image"
              : "list";

          page = 0;
          imageIndex = 0;

          return interaction.update(
            await getPayload()
          );
        }

        // ======================================
        // NEXT
        // ======================================

        if (
          interaction.customId ===
          "series_next"
        ) {
          if (
            viewMode === "list"
          ) {
            page++;

            if (
              page >=
              totalPages
            ) {
              page = 0;
            }
          } else {
            imageIndex++;

            if (
              imageIndex >=
              seriesCards.length
            ) {
              imageIndex = 0;
            }
          }

          return interaction.update(
            await getPayload()
          );
        }

        // ======================================
        // PREVIOUS
        // ======================================

        if (
          interaction.customId ===
          "series_prev"
        ) {
          if (
            viewMode === "list"
          ) {
            page--;

            if (
              page < 0
            ) {
              page =
                totalPages - 1;
            }
          } else {
            imageIndex--;

            if (
              imageIndex < 0
            ) {
              imageIndex =
                seriesCards.length - 1;
            }
          }

          return interaction.update(
            await getPayload()
          );
        }

        // ======================================
        // CLAIM REWARD
        // ======================================

        if (
          interaction.customId ===
          "series_claim"
        ) {
          /*
           * Check Season 1 reward specifically.
           */

          alreadyClaimed =
            await rewardsCol.findOne({
              userId,
              series:
                seriesName,
              season:
                SEASON
            });

          if (
            alreadyClaimed
          ) {
            return interaction.reply({
              content:
                "❌ You already claimed the Season 1 reward for this series.",

              ephemeral:
                true
            });
          }

          /*
           * Re-check the user's collection
           * before giving the reward.
           */

          ownedIds =
            await getOwnedIds();

          completed =
            getCompleted();

          if (
            !completed
          ) {
            return interaction.reply({
              content:
                "❌ You do not complete this Season 1 series anymore.",

              ephemeral:
                true
            });
          }

          // ====================================
          // GIVE COINS
          // ====================================

          await balancesCol.updateOne(
            {
              userId
            },

            {
              $inc: {
                coins:
                  totalReward
              }
            },

            {
              upsert:
                true
            }
          );

          // ====================================
          // SAVE S1 CLAIM
          // ====================================

          await rewardsCol.insertOne({
            userId,

            series:
              seriesName,

            season:
              SEASON,

            reward:
              totalReward,

            claimedAt:
              Date.now()
          });

          alreadyClaimed =
            true;

          return interaction.update({
            content:
              `🎉 You claimed **${totalReward} Coins** ` +
              `for completing 1️⃣ **${seriesName} — Season 1**!`,

            ...(
              await getPayload()
            )
          });
        }
      }
    );

    // ==========================================
    // COLLECTOR END
    // ==========================================

    collector.on(
      "end",

      async () => {
        await msg
          .edit({
            components: []
          })
          .catch(() => {});
      }
    );
  }
};