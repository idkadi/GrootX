const cards = require("../data/season1");

const SEASON = 1;

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const createDropImage = require("../utils/createDropImage");
const connectDB = require("../database");

function getTierEmoji(tier) {
  switch (String(tier || "").toLowerCase()) {
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

function getRandomTier() {
  const chance = Math.random() * 100;

  if (chance < 60) return "common";
  if (chance < 87.5) return "uncommon";
  if (chance < 97.5) return "rare";
  if (chance < 99.7) return "epic";

  return "legendary";
}

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
        chars.charAt(
          Math.floor(
            Math.random() *
            chars.length
          )
        );
    }

    const exists =
      await collectionsCol
        .findOne({
          code
        });

    if (!exists) {
      return code;
    }
  }
}

// ==========================================
// RECENT S1 DROPS
// ==========================================

async function getRecentDrops(
  recentDropsCol
) {
  const docs =
    await recentDropsCol
      .find({
        season: SEASON
      })
      .sort({
        createdAt: 1
      })
      .toArray();

  return docs.map(
    doc =>
      Number(
        doc.cardId
      )
  );
}

async function saveRecentDrops(
  recentDropsCol,
  recentDrops
) {
  await recentDropsCol.deleteMany({
    season: SEASON
  });

  if (
    recentDrops.length >
    0
  ) {
    await recentDropsCol.insertMany(
      recentDrops.map(
        (
          cardId,
          index
        ) => ({
          cardId:
            Number(cardId),

          season:
            SEASON,

          createdAt:
            Date.now() +
            index
        })
      )
    );
  }
}

// ==========================================
// SERIES NAME
// ==========================================

function getSeriesName(card) {
  return String(
    card.show ||
    card.appearance ||
    ""
  ).trim();
}

// ==========================================
// PICK S1 CARD
// ==========================================

function pickWithoutRecent(
  rarity,
  dropCards,
  usedShows,
  recentDrops
) {
  const isSameCard =
    (a, b) =>
      Number(a.id) ===
      Number(b.id);

  let rarityCards =
    cards.filter(
      card =>
        String(
          card.tier ||
          ""
        ).toLowerCase() ===
          rarity &&

        !recentDrops.includes(
          Number(
            card.id
          )
        ) &&

        !dropCards.some(
          dropped =>
            isSameCard(
              dropped,
              card
            )
        ) &&

        !usedShows.includes(
          getSeriesName(
            card
          )
        )
    );

  // ========================================
  // FALLBACK 1
  // ========================================

  if (
    rarityCards.length ===
    0
  ) {
    rarityCards =
      cards.filter(
        card =>
          String(
            card.tier ||
            ""
          ).toLowerCase() ===
            rarity &&

          !recentDrops.includes(
            Number(
              card.id
            )
          ) &&

          !dropCards.some(
            dropped =>
              isSameCard(
                dropped,
                card
              )
          )
      );
  }

  // ========================================
  // FALLBACK 2
  // ========================================

  if (
    rarityCards.length ===
    0
  ) {
    rarityCards =
      cards.filter(
        card =>
          String(
            card.tier ||
            ""
          ).toLowerCase() ===
            rarity &&

          !dropCards.some(
            dropped =>
              isSameCard(
                dropped,
                card
              )
          )
      );
  }

  // ========================================
  // FALLBACK 3
  // ========================================

  if (
    rarityCards.length ===
    0
  ) {
    rarityCards =
      cards.filter(
        card =>
          String(
            card.tier ||
            ""
          ).toLowerCase() ===
          rarity
      );
  }

  /*
   * If your current S1 database
   * doesn't contain the selected rarity,
   * use another available S1 card.
   */

  if (
    rarityCards.length ===
    0
  ) {
    rarityCards =
      cards.filter(
        card =>
          !dropCards.some(
            dropped =>
              isSameCard(
                dropped,
                card
              )
          )
      );
  }

  if (
    rarityCards.length ===
    0
  ) {
    rarityCards = [
      ...cards
    ];
  }

  const randomCard =
    rarityCards[
      Math.floor(
        Math.random() *
        rarityCards.length
      )
    ];

  if (!randomCard) {
    return null;
  }

  recentDrops.push(
    Number(
      randomCard.id
    )
  );

  while (
    recentDrops.length >
    15
  ) {
    recentDrops.shift();
  }

  return randomCard;
}

// ==========================================
// S1 SERIALS
// ==========================================

async function assignDropSerials(
  serialsCol,
  dropCards
) {
  const serialMap = {};

  for (
    const card
    of dropCards
  ) {
    await serialsCol.updateOne(
      {
        cardId:
          Number(
            card.id
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
              card.id
            ),

          season:
            SEASON
        });

    if (!serialDoc) {
      throw new Error(
        `Failed to create serial for S1 card ${card.id}`
      );
    }

    serialMap[
      card.id
    ] =
      serialDoc.serial;
  }

  return serialMap;
}

// ==========================================
// S1 WISHLIST DATA
// ==========================================

async function getWishlistData(
  db,
  dropCards
) {
  const wishCol =
    db.collection(
      "wishlists"
    );

  const droppedIds =
    dropCards.map(
      card =>
        Number(
          card.id
        )
    );

  const wishUsers =
    await wishCol
      .find({
        cards: {
          $elemMatch: {
            cardId: {
              $in:
                droppedIds
            },

            season:
              SEASON
          }
        }
      })
      .toArray();

  const counts = {};

  const pingUsers =
    new Set();

  for (
    const card
    of dropCards
  ) {
    counts[
      card.id
    ] = 0;
  }

  for (
    const wish
    of wishUsers
  ) {
    const wishedKeys =
      new Set(
        (
          wish.cards ||
          []
        )
          .filter(
            entry =>
              entry &&
              typeof entry ===
                "object" &&
              !Array.isArray(
                entry
              )
          )

          .map(
            entry => {
              const cardId =
                Number(
                  entry.cardId ??
                  entry.id
                );

              const season =
                Number(
                  entry.season ??
                  0
                );

              return (
                `${season}:` +
                `${cardId}`
              );
            }
          )
      );

    let matched =
      false;

    for (
      const droppedId
      of droppedIds
    ) {
      const key =
        `${SEASON}:${
          Number(
            droppedId
          )
        }`;

      if (
        wishedKeys.has(
          key
        )
      ) {
        counts[
          droppedId
        ] =
          (
            counts[
              droppedId
            ] ||
            0
          ) + 1;

        matched =
          true;
      }
    }

    if (matched) {
      pingUsers.add(
        wish.userId
      );
    }
  }

  const pingText =
    pingUsers.size > 0

      ? `\n\n💫 Wishlist alert: ${
          Array
            .from(
              pingUsers
            )
            .map(
              id =>
                `<@${id}>`
            )
            .join(" ")
        }`

      : "";

  return {
    counts,
    pingText
  };
}

// ==========================================
// COMMAND
// ==========================================

module.exports = {
  name:
    "drop",

  aliases: [
    "d"
  ],

  async execute(message) {
    console.log(
      "[DROP] ✅ Drop command reached"
    );

    try {
      const db =
        await connectDB();

      const collectionsCol =
        db.collection(
          "collections"
        );

      const serialsCol =
        db.collection(
          "serials"
        );

      const cooldownsCol =
        db.collection(
          "cooldowns"
        );

      const recentDropsCol =
        db.collection(
          "recentDrops"
        );

      const inventoryCol =
        db.collection(
          "inventory"
        );

      const stoneEffectsCol =
        db.collection(
          "stoneeffects"
        );

      const userId =
        message.author.id;

      const now =
        Date.now();

      // ========================================
      // STONE EFFECT
      // ========================================

      const stoneEffect =
        await stoneEffectsCol
          .findOne({
            userId
          });

      // ========================================
      // DROP COOLDOWN
      // ========================================

      const dropCooldown =
        await cooldownsCol
          .findOne({
            type:
              "drop",

            userId
          });

      let cooldownTime =
        8 *
        60 *
        1000;

      if (
        stoneEffect
          ?.timeUntil &&
        stoneEffect.timeUntil >
          now
      ) {
        cooldownTime =
          cooldownTime /
          2;
      }

      let usedExtraDrop =
        false;

      if (
        dropCooldown &&
        now -
          dropCooldown
            .timestamp <
          cooldownTime
      ) {
        const inventoryDoc =
          await inventoryCol
            .findOne({
              userId
            });

        const extraDrops =
          inventoryDoc
            ?.items
            ?.extra_drop ||
          0;

        if (
          extraDrops <=
          0
        ) {
          const remaining =
            cooldownTime -
            (
              now -
              dropCooldown
                .timestamp
            );

          const minutes =
            Math.floor(
              remaining /
              60000
            );

          const seconds =
            Math.floor(
              (
                remaining %
                60000
              ) /
              1000
            );

          return message.reply(
            `❌ You can drop again in ${minutes}m ${seconds}s.`
          );
        }

        await inventoryCol
          .updateOne(
            {
              userId
            },

            {
              $inc: {
                "items.extra_drop":
                  -1
              }
            }
          );

        usedExtraDrop =
          true;
      }

      // ========================================
      // SET DROP COOLDOWN
      // ========================================

      await cooldownsCol
        .updateOne(
          {
            type:
              "drop",

            userId
          },

          {
            $set: {
              timestamp:
                now,

              notified:
                false
            }
          },

          {
            upsert:
              true
          }
        );

      // ========================================
      // CARD COUNT
      // ========================================

      let cardsToDrop =
        3;

      let mindStoneUsed =
        false;

      if (
        (
          stoneEffect
            ?.mindDropsRemaining ||
          0
        ) > 0
      ) {
        cardsToDrop =
          4;

        mindStoneUsed =
          true;

        await stoneEffectsCol
          .updateOne(
            {
              userId
            },

            {
              $inc: {
                mindDropsRemaining:
                  -1
              }
            }
          );
      }

      // ========================================
      // GENERATE S1 CARDS
      // ========================================

      const recentDrops =
        await getRecentDrops(
          recentDropsCol
        );

      const dropCards =
        [];

      const usedShows =
        [];

      const claimedUsers =
        new Set();

      const claimedCards =
        Array(
          cardsToDrop
        ).fill(
          false
        );

      const attemptedBy =
        Array(
          cardsToDrop
        )
          .fill(
            null
          )
          .map(
            () =>
              new Set()
          );

      while (
        dropCards.length <
        cardsToDrop
      ) {
        const rarity =
          getRandomTier();

        const randomCard =
          pickWithoutRecent(
            rarity,
            dropCards,
            usedShows,
            recentDrops
          );

        if (!randomCard) {
          continue;
        }

        dropCards.push(
          randomCard
        );

        const seriesName =
          getSeriesName(
            randomCard
          );

        if (
          seriesName
        ) {
          usedShows.push(
            seriesName
          );
        }
      }

      await saveRecentDrops(
        recentDropsCol,
        recentDrops
      );

      // ========================================
      // SERIALS
      // ========================================

      const dropSerials =
        await assignDropSerials(
          serialsCol,
          dropCards
        );

      // ========================================
      // WISHLIST
      // ========================================

      const wishlistData =
        await getWishlistData(
          db,
          dropCards
        );

      // ========================================
      // RENDER DROP IMAGE
      // ========================================

      const renderedCards =
        dropCards.map(
          card => ({
            ...card,

            season:
              SEASON,

            serial:
              dropSerials[
                card.id
              ]
          })
        );

      console.log(
        "[DROP] Rendering cards:",
        renderedCards.map(
          card => ({
            id:
              card.id,

            name:
              card.name,

            rawImage:
              card.rawImage,

            tier:
              card.tier,

            season:
              card.season
          })
        )
      );

      let dropImage;

      try {
        dropImage =
          await createDropImage(
            renderedCards
          );

        console.log(
          "[DROP] ✅ Drop image rendered"
        );
      }

      catch (error) {
        console.error(
          "[DROP] ❌ createDropImage failed:",
          error
        );

        throw error;
      }

      // ========================================
      // EFFECT TEXT
      // ========================================

      const powerActive =
        stoneEffect
          ?.powerUntil &&
        stoneEffect.powerUntil >
          now;

      const timeActive =
        stoneEffect
          ?.timeUntil &&
        stoneEffect.timeUntil >
          now;

      const effectText =
        (
          usedExtraDrop
            ? "🌌 **Extra Drop Used!**\n"
            : ""
        ) +

        (
          mindStoneUsed
            ? "🧠 **Mind Stone Active! (4 Cards)**\n"
            : ""
        ) +

        (
          powerActive
            ? "💪 **Power Stone Active!**\n"
            : ""
        ) +

        (
          timeActive
            ? "⏳ **Time Stone Active!**\n"
            : ""
        );

      // ========================================
      // DROP TEXT
      // ========================================

      const dropText =
        "🎴 **A New Season 1 Drop Has Appeared!**\n" +

        "1️⃣ **Season 1**\n" +

        "\u200B\n" +

        effectText +

        "\n" +

        dropCards
          .map(
            (
              card,
              index
            ) =>
              `**${
                index + 1
              }.** ` +

              `${getTierEmoji(
                card.tier
              )} ` +

              `**${
                card.name
              }** ` +

              `#${
                dropSerials[
                  card.id
                ]
              }`
          )
          .join(
            "\n"
          ) +

        wishlistData
          .pingText;

      // ========================================
      // CLAIM BUTTONS
      // ========================================

      const row =
        new ActionRowBuilder();

      for (
        let i = 0;
        i <
        cardsToDrop;
        i++
      ) {
        const card =
          dropCards[
            i
          ];

        const wishCount =
          wishlistData
            .counts[
              card.id
            ] ||
          0;

        row.addComponents(
          new ButtonBuilder()

            .setCustomId(
              `claim_${i}`
            )

            .setLabel(
              `💖 ${wishCount}`
            )

            .setStyle(
              ButtonStyle.Primary
            )
        );
      }

      // ========================================
      // SEND DROP
      // ========================================

      const dropMessage =
        await message.reply({
          content:
            dropText,

          files: [
            {
              attachment:
                dropImage,

              name:
                "drop.png"
            }
          ],

          components: [
            row
          ]
        });

      console.log(
        "[DROP] ✅ Drop sent"
      );

      const dropStartedAt =
        Date.now();

      // ========================================
      // COLLECTOR
      // ========================================

      const collector =
        dropMessage
          .createMessageComponentCollector({
            time:
              60000
          });

      collector.on(
        "collect",

        async interaction => {
          try {
            const claimerId =
              interaction
                .user
                .id;

            const claimNow =
              Date.now();

            const index =
              parseInt(
                interaction
                  .customId
                  .split(
                    "_"
                  )[1]
              );

            if (
              Number.isNaN(
                index
              ) ||
              !dropCards[
                index
              ]
            ) {
              return interaction.reply({
                content:
                  "❌ Invalid card.",

                ephemeral:
                  true
              });
            }

            attemptedBy[
              index
            ].add(
              claimerId
            );

            const claimerEffect =
              await stoneEffectsCol
                .findOne({
                  userId:
                    claimerId
                });

            const dropperPowerActive =
              stoneEffect
                ?.powerUntil &&
              stoneEffect.powerUntil >
                claimNow;

            const claimerPowerActive =
              claimerEffect
                ?.powerUntil &&
              claimerEffect.powerUntil >
                claimNow;

            const priorityTime =
              dropperPowerActive

                ? 6 *
                  1000

                : 5 *
                  1000;

            // ====================================
            // DROPPER PRIORITY
            // ====================================

            if (
              claimNow -
                dropStartedAt <
                priorityTime &&

              claimerId !==
                userId &&

              !claimerPowerActive
            ) {
              return interaction
                .deferUpdate()
                .catch(
                  () => {}
                );
            }

            // ====================================
            // PICKUP COOLDOWN
            // ====================================

            const pickupCooldown =
              await cooldownsCol
                .findOne({
                  type:
                    "pickup",

                  userId:
                    claimerId
                });

            let pickupTime =
              4 *
              60 *
              1000;

            if (
              claimerEffect
                ?.timeUntil &&
              claimerEffect
                .timeUntil >
                claimNow
            ) {
              pickupTime =
                pickupTime /
                2;
            }

            let usedExtraGrab =
              false;

            if (
              pickupCooldown &&
              claimNow -
                pickupCooldown
                  .timestamp <
                pickupTime
            ) {
              const inventoryDoc =
                await inventoryCol
                  .findOne({
                    userId:
                      claimerId
                  });

              const extraGrabs =
                inventoryDoc
                  ?.items
                  ?.extra_grab ||
                0;

              if (
                extraGrabs <=
                0
              ) {
                const remaining =
                  pickupTime -
                  (
                    claimNow -
                    pickupCooldown
                      .timestamp
                  );

                const minutes =
                  Math.floor(
                    remaining /
                    60000
                  );

                const seconds =
                  Math.floor(
                    (
                      remaining %
                      60000
                    ) /
                    1000
                  );

                return interaction
                  .reply({
                    content:
                      `❌ You can claim again in ${minutes}m ${seconds}s.`,

                    ephemeral:
                      true
                  });
              }

              await inventoryCol
                .updateOne(
                  {
                    userId:
                      claimerId
                  },

                  {
                    $inc: {
                      "items.extra_grab":
                        -1
                    }
                  }
                );

              usedExtraGrab =
                true;
            }

            // ====================================
            // ALREADY CLAIMED
            // ====================================

            if (
              claimedUsers.has(
                claimerId
              )
            ) {
              return interaction
                .reply({
                  content:
                    "❌ You already claimed a card from this drop.",

                  ephemeral:
                    true
                });
            }

            if (
              claimedCards[
                index
              ]
            ) {
              return interaction
                .reply({
                  content:
                    "❌ This card was already claimed.",

                  ephemeral:
                    true
                });
            }

            claimedUsers.add(
              claimerId
            );

            claimedCards[
              index
            ] =
              true;

            const claimedCard =
              dropCards[
                index
              ];

            const cardId =
              claimedCard.id;

            const serial =
              dropSerials[
                cardId
              ];

            const code =
              await generateUniqueCode(
                collectionsCol
              );

            // ====================================
            // SAVE S1 CARD
            // ====================================

            await collectionsCol
              .insertOne({
                userId:
                  claimerId,

                cardId:
                  Number(
                    cardId
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

            // ====================================
            // PICKUP COOLDOWN
            // ====================================

            await cooldownsCol
              .updateOne(
                {
                  type:
                    "pickup",

                  userId:
                    claimerId
                },

                {
                  $set: {
                    timestamp:
                      claimNow,

                    notified:
                      false
                  }
                },

                {
                  upsert:
                    true
                }
              );

            row
              .components[
                index
              ]
              .setDisabled(
                true
              )
              .setStyle(
                ButtonStyle.Secondary
              );

            await interaction.update({
              components: [
                row
              ]
            });

            // ====================================
            // CLAIM MESSAGE
            // ====================================

            const challengers =
              attemptedBy[
                index
              ].size -
              1;

            let claimText;

            if (
              challengers >
                0 &&

              claimerId ===
                userId &&

              claimNow -
                dropStartedAt <
                priorityTime
            ) {
              claimText =
                `⚔️ ${interaction.user} fought off ` +

                `${challengers} challenger${
                  challengers ===
                  1
                    ? ""
                    : "s"
                } ` +

                `and took 1️⃣ ${getTierEmoji(
                  claimedCard.tier
                )} ` +

                `**${claimedCard.name}** ` +

                `#${serial} • ${code}!`;
            }

            else if (
              claimerPowerActive &&

              claimerId !==
                userId &&

              claimNow -
                dropStartedAt <
                priorityTime
            ) {
              claimText =
                `💪 ${interaction.user} used the **Power Stone** ` +

                `and overpowered priority, claiming ` +

                `1️⃣ ${getTierEmoji(
                  claimedCard.tier
                )} ` +

                `**${claimedCard.name}** ` +

                `#${serial} • ${code}!`;
            }

            else {
              claimText =
                `🎉 ${interaction.user} claimed ` +

                `1️⃣ ${getTierEmoji(
                  claimedCard.tier
                )} ` +

                `**${claimedCard.name}** ` +

                `#${serial} • ${code}!`;
            }

            if (
              usedExtraGrab
            ) {
              claimText +=
                "\n⚡ **Extra Grab Used!**";
            }

            await interaction.followUp({
              content:
                claimText
            });
          }

          catch (error) {
            console.error(
              "[DROP] Claim error:",
              error
            );
          }
        }
      );
    }

    catch (error) {
      console.error(
        "[DROP] ❌ DROP COMMAND FAILED:",
        error
      );

      console.error(
        error?.stack
      );

      return message
        .reply(
          `❌ Drop failed: \`${
            error.message ||
            "Unknown error"
          }\``
        )
        .catch(
          () => {}
        );
    }
  }
};