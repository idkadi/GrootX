const cards = require("../data/season1");

const SEASON = 1;

const connectDB = require("../database");
const createMarketImage = require("../utils/createMarketImage");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const MARKET_REFRESH =
  20 * 60 * 60 * 1000;

const LEGENDARY_REFRESH =
  7 * 24 * 60 * 60 * 1000;

const COIN =
  "<:grootcoin:1504742213110861834>";

const PRICES = {
  common: 1000,
  uncommon: 2000,
  rare: 5000,
  epic: 10000,
  legendary: 20000
};

const NORMAL_TIERS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "epic"
];

const LEGENDARY_TIERS = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary"
];

// ==========================================
// RANDOM CARD
// ==========================================

function pickRandomCard(tier) {
  const pool =
    cards.filter(
      card =>
        String(
          card.tier || ""
        ).toLowerCase() === tier
    );

  if (!pool.length) {
    return null;
  }

  return pool[
    Math.floor(
      Math.random() *
      pool.length
    )
  ];
}

// ==========================================
// TIER EMOJI
// ==========================================

function getTierEmoji(tier) {
  switch (
    String(
      tier || ""
    ).toLowerCase()
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

// ==========================================
// UNIQUE CODE
// ==========================================

async function generateUniqueCode(
  collectionsCol
) {
  const chars =
    "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (
      let i = 0;
      i < 6;
      i++
    ) {
      code +=
        chars[
          Math.floor(
            Math.random() *
            chars.length
          )
        ];
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

// ==========================================
// WEEKLY LEGENDARY
// ==========================================

async function shouldShowWeeklyLegendary(
  marketCol,
  now
) {
  let weeklyDoc =
    await marketCol.findOne({
      _id: "weekly_legendary"
    });

  if (!weeklyDoc) {
    weeklyDoc = {
      _id:
        "weekly_legendary",

      updatedAt:
        now,

      nextAt:
        now +
        LEGENDARY_REFRESH
    };

    await marketCol.updateOne(
      {
        _id:
          "weekly_legendary"
      },

      {
        $set:
          weeklyDoc
      },

      {
        upsert:
          true
      }
    );

    return false;
  }

  if (
    now >=
    weeklyDoc.nextAt
  ) {
    await marketCol.updateOne(
      {
        _id:
          "weekly_legendary"
      },

      {
        $set: {
          updatedAt:
            now,

          nextAt:
            now +
            LEGENDARY_REFRESH
        }
      },

      {
        upsert:
          true
      }
    );

    return true;
  }

  return false;
}

// ==========================================
// GET / GENERATE MARKET
// ==========================================

async function getMarket(db) {
  const marketCol =
    db.collection("market");

  const now =
    Date.now();

  let market =
    await marketCol.findOne({
      _id:
        "daily_market"
    });

  /*
   * Existing market documents created
   * before the season system count as S0.
   *
   * If we find one, regenerate the market
   * immediately using Season 1.
   */

  const wrongSeason =
    !market ||
    Number(
      market.season ?? 0
    ) !== SEASON;

  if (
    wrongSeason ||
    now -
      market.updatedAt >=
      MARKET_REFRESH
  ) {
    const showLegendary =
      await shouldShowWeeklyLegendary(
        marketCol,
        now
      );

    const tiers =
      showLegendary
        ? LEGENDARY_TIERS
        : NORMAL_TIERS;

    const marketCards =
      tiers
        .map(tier => {
          const card =
            pickRandomCard(
              tier
            );

          /*
           * Safety:
           * If S1 currently doesn't contain
           * a card for this rarity, skip it
           * instead of crashing.
           */

          if (!card) {
            return null;
          }

          return {
            tier,

            cardId:
              Number(
                card.id
              ),

            season:
              SEASON,

            price:
              PRICES[tier],

            type:
              tier ===
              "legendary"
                ? "weekly"
                : "daily"
          };
        })
        .filter(Boolean);

    market = {
      _id:
        "daily_market",

      season:
        SEASON,

      updatedAt:
        now,

      cards:
        marketCards
    };

    await marketCol.updateOne(
      {
        _id:
          "daily_market"
      },

      {
        $set:
          market
      },

      {
        upsert:
          true
      }
    );
  }

  return market;
}

// ==========================================
// COMMAND
// ==========================================

module.exports = {
  name: "market",

  aliases: [
    "shop"
  ],

  async execute(message) {
    const db =
      await connectDB();

    const balancesCol =
      db.collection(
        "balances"
      );

    const collectionsCol =
      db.collection(
        "collections"
      );

    const serialsCol =
      db.collection(
        "serials"
      );

    const marketCol =
      db.collection(
        "market"
      );

    // ========================================
    // MARKET
    // ========================================

    const market =
      await getMarket(
        db
      );

    /*
     * Resolve every market entry against
     * the Season 1 database only.
     */

    const marketCards =
      market.cards
        .map(item => {
          const card =
            cards.find(
              card =>
                String(
                  card.id
                ) ===
                String(
                  item.cardId
                )
            );

          if (!card) {
            return null;
          }

          return {
            ...card,

            season:
              SEASON,

            tier:
              item.tier,

            price:
              item.price,

            type:
              item.type ||
              "daily"
          };
        })
        .filter(Boolean);

    // ========================================
    // REFRESH TIMES
    // ========================================

    const nextUpdate =
      Math.floor(
        (
          market.updatedAt +
          MARKET_REFRESH
        ) / 1000
      );

    const weeklyDoc =
      await marketCol.findOne({
        _id:
          "weekly_legendary"
      });

    let weeklyUpdateText =
      "";

    if (
      weeklyDoc?.nextAt
    ) {
      weeklyUpdateText =
        `👑 Legendary appears ` +
        `<t:${Math.floor(
          weeklyDoc.nextAt /
          1000
        )}:R>\n`;
    }

    // ========================================
    // S1 MARKET IMAGE
    // ========================================

    /*
     * createMarketImage was patched
     * to render every card through:
     *
     * renderCard({
     *   ...card,
     *   season: 1
     * })
     *
     * Therefore the market uses:
     *
     * S1 raw image
     * +
     * default tier frame
     * +
     * S1 name/appearance design
     */

    const image =
      await createMarketImage(
        marketCards
      );

    const attachment =
      new AttachmentBuilder(
        image,
        {
          name:
            "market-s1.png"
        }
      );

    // ========================================
    // BUY BUTTONS
    // ========================================

    const rows = [];

    let row =
      new ActionRowBuilder();

    for (
      let i = 0;
      i <
      marketCards.length;
      i++
    ) {
      if (
        row.components.length ===
        5
      ) {
        rows.push(
          row
        );

        row =
          new ActionRowBuilder();
      }

      row.addComponents(

        new ButtonBuilder()

          .setCustomId(
            `market_buy_${i}`
          )

          .setLabel(
            marketCards[i]
              .name
              .slice(
                0,
                30
              )
          )

          .setStyle(
            marketCards[i]
              .type ===
              "weekly"

              ? ButtonStyle.Success

              : ButtonStyle.Primary
          )
      );
    }

    if (
      row.components.length
    ) {
      rows.push(
        row
      );
    }

    // ========================================
    // MARKET MESSAGE
    // ========================================

    const marketMsg =
      await message.reply({
        content:
          `🛒 **Daily Market • Season 1**\n` +

          `1️⃣ **Season 1 Cards Only**\n` +

          `⏳ Market refreshes ` +
          `<t:${nextUpdate}:R>\n` +

          weeklyUpdateText +

          `\n` +

          marketCards
            .map(card => {
              const weeklyText =
                card.type ===
                "weekly"

                  ? " 👑 Weekly"

                  : "";

              return (
                `1️⃣ ` +

                `${getTierEmoji(
                  card.tier
                )} ` +

                `**${card.name}**` +

                `${weeklyText} — ` +

                `${COIN} ` +

                `${card.price.toLocaleString()}`
              );
            })
            .join("\n"),

        files: [
          attachment
        ],

        components:
          rows
      });

    // ========================================
    // COLLECTOR
    // ========================================

    const collector =
      marketMsg
        .createMessageComponentCollector({
          time:
            120000
        });

    collector.on(
      "collect",

      async interaction => {
        if (
          !interaction
            .customId
            .startsWith(
              "market_buy_"
            )
        ) {
          return;
        }

        const index =
          Number(
            interaction
              .customId
              .replace(
                "market_buy_",
                ""
              )
          );

        const selected =
          marketCards[
            index
          ];

        if (!selected) {
          return interaction.reply({
            content:
              "❌ This market item was not found.",

            ephemeral:
              true
          });
        }

        // ====================================
        // CONFIRMATION
        // ====================================

        const confirmRow =
          new ActionRowBuilder()
            .addComponents(

              new ButtonBuilder()

                .setCustomId(
                  "market_confirm"
                )

                .setLabel(
                  "Confirm"
                )

                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()

                .setCustomId(
                  "market_cancel"
                )

                .setLabel(
                  "Cancel"
                )

                .setStyle(
                  ButtonStyle.Danger
                )
            );

        const confirmMsg =
          await interaction.reply({
            content:
              `🛒 **Confirm Purchase • Season 1**\n\n` +

              `1️⃣ ` +

              `${getTierEmoji(
                selected.tier
              )} ` +

              `**${selected.name}**\n` +

              `Price: ${COIN} ` +

              `**${selected.price.toLocaleString()}**`,

            components: [
              confirmRow
            ],

            ephemeral:
              true,

            fetchReply:
              true
          });

        try {
          const confirmInteraction =
            await confirmMsg
              .awaitMessageComponent({
                time:
                  30000,

                filter:
                  i =>
                    i.user.id ===
                    interaction.user.id
              });

          // ==================================
          // CANCEL
          // ==================================

          if (
            confirmInteraction
              .customId ===
            "market_cancel"
          ) {
            return confirmInteraction.update({
              content:
                "❌ Purchase cancelled.",

              components:
                []
            });
          }

          await confirmInteraction
            .deferUpdate();

          // ==================================
          // RECHECK MARKET
          // ==================================

          /*
           * Don't trust the old selected object.
           *
           * The market may have refreshed while
           * the confirmation menu was open.
           */

          const freshMarket =
            await getMarket(
              db
            );

          const freshItem =
            freshMarket.cards[
              index
            ];

          if (
            !freshItem ||
            Number(
              freshItem.season ??
              SEASON
            ) !== SEASON
          ) {
            return interaction.editReply({
              content:
                "❌ This market item no longer exists.",

              components:
                []
            });
          }

          const cardToBuy =
            cards.find(
              card =>
                String(
                  card.id
                ) ===
                String(
                  freshItem.cardId
                )
            );

          if (!cardToBuy) {
            return interaction.editReply({
              content:
                "❌ Season 1 card data not found.",

              components:
                []
            });
          }

          const price =
            freshItem.price;

          const userId =
            interaction.user.id;

          // ==================================
          // BALANCE
          // ==================================

          const balanceDoc =
            await balancesCol
              .findOne({
                userId
              });

          const coins =
            balanceDoc?.coins ||
            0;

          if (
            coins <
            price
          ) {
            return interaction.editReply({
              content:
                `❌ Not enough coins.\n\n` +

                `Needed: ${COIN} ` +

                `**${price.toLocaleString()}**\n` +

                `You have: ${COIN} ` +

                `**${coins.toLocaleString()}**`,

              components:
                []
            });
          }

          // ==================================
          // REMOVE COINS
          // ==================================

          await balancesCol.updateOne(
            {
              userId
            },

            {
              $inc: {
                coins:
                  -price
              }
            },

            {
              upsert:
                true
            }
          );

          // ==================================
          // S1 SERIAL
          // ==================================

          /*
           * S0 and S1 serials are separate.
           *
           * Example:
           *
           * { cardId: 5, season: 0 }
           * { cardId: 5, season: 1 }
           */

          await serialsCol.updateOne(
            {
              cardId:
                Number(
                  cardToBuy.id
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
            await serialsCol
              .findOne({
                cardId:
                  Number(
                    cardToBuy.id
                  ),

                season:
                  SEASON
              });

          if (!serialDoc) {
            /*
             * This should be extremely rare,
             * but don't create an invalid card
             * if serial retrieval fails.
             */

            await balancesCol.updateOne(
              {
                userId
              },

              {
                $inc: {
                  coins:
                    price
                }
              }
            );

            return interaction.editReply({
              content:
                "❌ Failed to generate card serial. Your coins were refunded.",

              components:
                []
            });
          }

          // ==================================
          // UNIQUE CODE
          // ==================================

          const code =
            await generateUniqueCode(
              collectionsCol
            );

          // ==================================
          // SAVE OWNED S1 CARD
          // ==================================

          await collectionsCol.insertOne({
            userId,

            cardId:
              Number(
                cardToBuy.id
              ),

            season:
              SEASON,

            serial:
              serialDoc.serial,

            code,

            tag:
              null,

            favorite:
              false
          });

          // ==================================
          // SUCCESS
          // ==================================

          return interaction.editReply({
            content:
              `✅ **Purchase Successful!**\n\n` +

              `1️⃣ ` +

              `${getTierEmoji(
                cardToBuy.tier
              )} ` +

              `**${cardToBuy.name}** ` +

              `#${serialDoc.serial}\n` +

              `Code: \`${code}\`\n` +

              `Paid: ${COIN} ` +

              `**${price.toLocaleString()}**`,

            components:
              []
          });

        } catch {
          return interaction.editReply({
            content:
              "⌛ Purchase timed out.",

            components:
              []
          });
        }
      }
    );

    // ========================================
    // COLLECTOR END
    // ========================================

    collector.on(
      "end",

      async () => {
        await marketMsg
          .edit({
            components:
              []
          })
          .catch(
            () => {}
          );
      }
    );
  }
};