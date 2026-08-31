const createDropImage = require("../utils/createDropImage");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const cards = require("../data/season1");
const connectDB = require("../database");

const SEASON = 1;

// ==========================================
// TIER EMOJI
// ==========================================

function getTierEmoji(tier) {
  switch (tier) {
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
      return "🎴";
  }
}

// ==========================================
// RANDOM TIER
// ==========================================

function getRandomTier() {
  const chance = Math.random() * 100;

  if (chance < 65) return "common";
  if (chance < 90) return "uncommon";
  if (chance < 98) return "rare";
  if (chance < 99.7) return "epic";

  return "legendary";
}

// ==========================================
// RECENT DROPS
// ==========================================

async function getRecentDrops(recentDropsCol) {
  const docs = await recentDropsCol
    .find({
      season: SEASON
    })
    .sort({
      createdAt: 1
    })
    .toArray();

  return docs.map(doc =>
    Number(doc.cardId)
  );
}

async function saveRecentDrops(
  recentDropsCol,
  recentDrops
) {
  await recentDropsCol.deleteMany({
    season: SEASON
  });

  if (recentDrops.length > 0) {
    await recentDropsCol.insertMany(
      recentDrops.map(
        (cardId, index) => ({
          cardId: Number(cardId),

          season: SEASON,

          createdAt:
            Date.now() + index
        })
      )
    );
  }
}

// ==========================================
// PICK CARD
// ==========================================

function pickWithoutRecent(
  tier,
  dropCards,
  recentDrops
) {
  const matchesTier = card =>
    String(
      card.tier || ""
    ).toLowerCase() ===
    tier;

  const sameCard = (a, b) =>
    Number(a.id) ===
    Number(b.id);

  let pool = cards.filter(
    card =>
      matchesTier(card) &&

      !recentDrops.includes(
        Number(card.id)
      ) &&

      !dropCards.some(c =>
        sameCard(c, card)
      )
  );

  // Ignore recent list if necessary

  if (pool.length === 0) {
    pool = cards.filter(
      card =>
        matchesTier(card) &&

        !dropCards.some(c =>
          sameCard(c, card)
        )
    );
  }

  // Allow duplicate protection fallback

  if (pool.length === 0) {
    pool = cards.filter(
      matchesTier
    );
  }

  /*
   * Important for early S1:
   *
   * If S1 doesn't yet contain a card
   * from the randomly selected tier,
   * use another available S1 card.
   */

  if (pool.length === 0) {
    pool = cards.filter(
      card =>
        !dropCards.some(c =>
          sameCard(c, card)
        )
    );
  }

  if (pool.length === 0) {
    pool = [...cards];
  }

  const picked =
    pool[
      Math.floor(
        Math.random() *
        pool.length
      )
    ];

  if (!picked) {
    return null;
  }

  recentDrops.push(
    Number(picked.id)
  );

  while (
    recentDrops.length > 15
  ) {
    recentDrops.shift();
  }

  return picked;
}

// ==========================================
// GENERATE CARD
// ==========================================

function generateCard(
  dropCards,
  recentDrops
) {
  const tier =
    getRandomTier();

  return pickWithoutRecent(
    tier,
    dropCards,
    recentDrops
  );
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
      code += chars.charAt(
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
// S1 SERIALS
// ==========================================

async function assignDropSerials(
  serialsCol,
  dropCards
) {
  const serialMap = {};

  for (
    const card of dropCards
  ) {
    await serialsCol.updateOne(
      {
        cardId:
          Number(card.id),

        season:
          SEASON
      },

      {
        $inc: {
          serial: 1
        },

        $setOnInsert: {
          season:
            SEASON
        }
      },

      {
        upsert: true
      }
    );

    const serialDoc =
      await serialsCol.findOne({
        cardId:
          Number(card.id),

        season:
          SEASON
      });

    serialMap[card.id] =
      serialDoc.serial;
  }

  return serialMap;
}

// ==========================================
// S1 WISHLIST
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
    dropCards.map(card =>
      Number(card.id)
    );

  /*
   * New wishlist structure:
   *
   * cards: [
   *   {
   *     cardId: 1,
   *     season: 1
   *   }
   * ]
   */

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
    const card of dropCards
  ) {
    counts[card.id] = 0;
  }

  for (
    const wish of wishUsers
  ) {
    const wishedKeys =
      new Set(
        (
          wish.cards || []
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
            entry =>
              `${
                Number(
                  entry.season ??
                  0
                )
              }:${
                Number(
                  entry.cardId ??
                  entry.id
                )
              }`
          )
      );

    let matched = false;

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
        wishedKeys.has(key)
      ) {
        counts[droppedId] =
          (
            counts[
              droppedId
            ] || 0
          ) + 1;

        matched = true;
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
// AUTO DROP SYSTEM
// ==========================================

module.exports = client => {
  setInterval(
    async () => {
      try {
        const db =
          await connectDB();

        const dropChannelsCol =
          db.collection(
            "dropChannels"
          );

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

        const dropChannels =
          await dropChannelsCol
            .find({})
            .toArray();

        // ==================================
        // EACH DROP CHANNEL
        // ==================================

        for (
          const entry
          of dropChannels
        ) {
          try {
            const channel =
              client.channels.cache.get(
                entry.channelId
              );

            if (!channel) {
              continue;
            }

            // ==============================
            // GENERATE S1 DROP
            // ==============================

            const recentDrops =
              await getRecentDrops(
                recentDropsCol
              );

            const dropCards =
              [];

            while (
              dropCards.length < 3
            ) {
              const card =
                generateCard(
                  dropCards,
                  recentDrops
                );

              if (!card) {
                continue;
              }

              dropCards.push(
                card
              );
            }

            await saveRecentDrops(
              recentDropsCol,
              recentDrops
            );

            // ==============================
            // ASSIGN S1 SERIALS
            // ==============================

            const dropSerials =
              await assignDropSerials(
                serialsCol,
                dropCards
              );

            // ==============================
            // WISHLIST
            // ==============================

            const wishlistData =
              await getWishlistData(
                db,
                dropCards
              );

            const claimed = [
              false,
              false,
              false
            ];

            const claimedUsers =
              new Set();

            // ==============================
            // RENDER S1 CARDS
            // ==============================

            const imageBuffer =
              await createDropImage(
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
                )
              );

            const attachment =
              new AttachmentBuilder(
                imageBuffer,
                {
                  name:
                    "drop.png"
                }
              );

            // ==============================
            // DROP TEXT
            // ==============================

            const dropText =
              "🎴 **A New Season 1 Auto Drop Has Appeared!**\n" +

              "1️⃣ **Season 1**\n" +

              "\u200B\n" +

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
                .join("\n") +

              wishlistData
                .pingText;

            // ==============================
            // BUTTONS
            // ==============================

            const row =
              new ActionRowBuilder();

            for (
              let i = 0;
              i < 3;
              i++
            ) {
              const card =
                dropCards[i];

              const wishCount =
                wishlistData
                  .counts[
                    card.id
                  ] || 0;

              row.addComponents(
                new ButtonBuilder()

                  .setCustomId(
                    `drop_${i}`
                  )

                  .setLabel(
                    `💖 ${wishCount}`
                  )

                  .setStyle(
                    ButtonStyle.Primary
                  )
              );
            }

            // ==============================
            // SEND DROP
            // ==============================

            const msg =
              await channel.send({
                content:
                  dropText,

                files: [
                  attachment
                ],

                components: [
                  row
                ]
              });

            // ==============================
            // COLLECTOR
            // ==============================

            const collector =
              msg.createMessageComponentCollector({
                time:
                  60000
              });

            collector.on(
              "collect",

              async interaction => {
                try {
                  const userId =
                    interaction
                      .user.id;

                  const now =
                    Date.now();

                  // ========================
                  // PICKUP COOLDOWN
                  // ========================

                  const pickupCooldown =
                    await cooldownsCol
                      .findOne({
                        type:
                          "pickup",

                        userId
                      });

                  const cooldownTime =
                    5 *
                    60 *
                    1000;

                  let usedExtraGrab =
                    false;

                  if (
                    pickupCooldown &&
                    now -
                      pickupCooldown
                        .timestamp <
                      cooldownTime
                  ) {
                    const inventoryDoc =
                      await inventoryCol
                        .findOne({
                          userId
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
                        cooldownTime -
                        (
                          now -
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
                          userId
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

                  // ========================
                  // ALREADY CLAIMED
                  // ========================

                  if (
                    claimedUsers.has(
                      userId
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

                  // ========================
                  // CARD INDEX
                  // ========================

                  const index =
                    parseInt(
                      interaction
                        .customId
                        .split("_")[1]
                    );

                  if (
                    claimed[index]
                  ) {
                    return interaction
                      .reply({
                        content:
                          "❌ This card is already claimed.",

                        ephemeral:
                          true
                      });
                  }

                  claimed[index] =
                    true;

                  claimedUsers.add(
                    userId
                  );

                  const selectedCard =
                    dropCards[
                      index
                    ];

                  const serial =
                    dropSerials[
                      selectedCard.id
                    ];

                  const code =
                    await generateUniqueCode(
                      collectionsCol
                    );

                  // ========================
                  // SAVE AS S1
                  // ========================

                  await collectionsCol
                    .insertOne({
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

                  // ========================
                  // PICKUP COOLDOWN
                  // ========================

                  await cooldownsCol
                    .updateOne(
                      {
                        type:
                          "pickup",

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

                  // ========================
                  // DISABLE BUTTON
                  // ========================

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

                  await interaction
                    .update({
                      content:
                        dropText,

                      files: [
                        attachment
                      ],

                      components: [
                        row
                      ]
                    });

                  // ========================
                  // CLAIM MESSAGE
                  // ========================

                  await channel.send(
                    `🎉 ${interaction.user} claimed ` +

                    `1️⃣ ${getTierEmoji(
                      selectedCard.tier
                    )} ` +

                    `**${
                      selectedCard.name
                    }** ` +

                    `#${serial} • ${code}` +

                    (
                      usedExtraGrab

                        ? "\n⚡ **Extra Grab Used!**"

                        : ""
                    )
                  );
                }

                catch (err) {
                  console.error(
                    "Auto Drop Claim Error:",
                    err
                  );
                }
              }
            );

            // ==============================
            // END
            // ==============================

            collector.on(
              "end",

              async () => {
                try {
                  row.components
                    .forEach(
                      button =>
                        button
                          .setDisabled(
                            true
                          )
                    );

                  await msg.edit({
                    content:
                      dropText,

                    files: [
                      attachment
                    ],

                    components: [
                      row
                    ]
                  });
                }

                catch (err) {
                  console.error(
                    "Auto Drop End Error:",
                    err
                  );
                }
              }
            );
          }

          catch (err) {
            console.error(
              "Auto Drop Error:",
              err
            );
          }
        }
      }

      catch (err) {
        console.error(
          "Mongo AutoDrop Error:",
          err
        );
      }
    },

    // 30 MINUTES
    1800000
  );
};