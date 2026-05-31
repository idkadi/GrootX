const path = require("path");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");

const {
  createCanvas,
  loadImage
} = require("canvas");

const cards = require("../data/cards");
const connectDB = require("../database");

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

function getRandomTier() {
  const chance = Math.random() * 100;

  if (chance < 65) return "common";
  if (chance < 90) return "uncommon";
  if (chance < 98) return "rare";
  if (chance < 99.7) return "epic";

  return "legendary";
}

async function getRecentDrops(recentDropsCol) {
  const docs =
    await recentDropsCol
      .find({})
      .sort({ createdAt: 1 })
      .toArray();

  return docs.map(doc => doc.cardId);
}

async function saveRecentDrops(recentDropsCol, recentDrops) {
  await recentDropsCol.deleteMany({});

  if (recentDrops.length > 0) {
    await recentDropsCol.insertMany(
      recentDrops.map((cardId, index) => ({
        cardId,
        createdAt: Date.now() + index
      }))
    );
  }
}

function pickWithoutRecent(tier, dropCards, recentDrops) {
  let pool =
    cards.filter(card =>
      card.tier === tier &&
      !recentDrops.includes(card.id) &&
      !dropCards.some(c => c.id === card.id)
    );

  if (pool.length === 0) {
    pool =
      cards.filter(card =>
        card.tier === tier &&
        !dropCards.some(c => c.id === card.id)
      );
  }

  if (pool.length === 0) {
    pool =
      cards.filter(card =>
        card.tier === tier
      );
  }

  const picked =
    pool[
      Math.floor(
        Math.random() * pool.length
      )
    ];

  recentDrops.push(picked.id);

  while (recentDrops.length > 15) {
    recentDrops.shift();
  }

  return picked;
}

function generateCard(dropCards, recentDrops) {
  const tier =
    getRandomTier();

  return pickWithoutRecent(
    tier,
    dropCards,
    recentDrops
  );
}

async function generateUniqueCode(collectionsCol) {
  const chars =
    "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(
        Math.floor(
          Math.random() * chars.length
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

module.exports = client => {
  setInterval(
    async () => {
      try {
        const db =
          await connectDB();

        const dropChannelsCol =
          db.collection("dropChannels");

        const collectionsCol =
          db.collection("collections");

        const serialsCol =
          db.collection("serials");

        const cooldownsCol =
          db.collection("cooldowns");

        const recentDropsCol =
          db.collection("recentDrops");

        const inventoryCol =
          db.collection("inventory");

        const dropChannels =
          await dropChannelsCol
            .find({})
            .toArray();

        for (const entry of dropChannels) {
          try {
            const channel =
              client.channels.cache.get(
                entry.channelId
              );

            if (!channel)
              continue;

            const recentDrops =
              await getRecentDrops(
                recentDropsCol
              );

            const dropCards = [];

            while (dropCards.length < 3) {
              const card =
                generateCard(
                  dropCards,
                  recentDrops
                );

              dropCards.push(card);
            }

            await saveRecentDrops(
              recentDropsCol,
              recentDrops
            );

            const claimed =
              [false, false, false];

            const claimedUsers =
              new Set();

            const cardWidth = 250;
            const cardHeight = 360;
            const spacing = 20;

            const canvas =
              createCanvas(
                (cardWidth * 3) + (spacing * 4),
                cardHeight + 40
              );

            const ctx =
              canvas.getContext("2d");

            ctx.fillStyle =
              "#1e1f22";

            ctx.fillRect(
              0,
              0,
              canvas.width,
              canvas.height
            );

            const images =
              await Promise.all(
                dropCards.map(card =>
                  loadImage(
                    path.join(
                      __dirname,
                      "..",
                      "images",
                      card.image
                    )
                  )
                )
              );

            images.forEach((img, i) => {
              ctx.drawImage(
                img,
                spacing + (i * (cardWidth + spacing)),
                20,
                cardWidth,
                cardHeight
              );
            });

            const attachment =
              new AttachmentBuilder(
                canvas.toBuffer(),
                {
                  name: "drop.png"
                }
              );

            const dropText =
              "🎴 **A New Drop Has Appeared!**\n" +
              "\u200B\n" +
              dropCards.map((card, index) =>
                `**${index + 1}.** ${getTierEmoji(card.tier)} **${card.name}**`
              ).join("\n");

            const row =
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId("drop_0")
                    .setLabel("1")
                    .setStyle(ButtonStyle.Primary),

                  new ButtonBuilder()
                    .setCustomId("drop_1")
                    .setLabel("2")
                    .setStyle(ButtonStyle.Primary),

                  new ButtonBuilder()
                    .setCustomId("drop_2")
                    .setLabel("3")
                    .setStyle(ButtonStyle.Primary)
                );

            const msg =
              await channel.send({
                content: dropText,
                files: [attachment],
                components: [row]
              });

            const collector =
              msg.createMessageComponentCollector({
                time: 60000
              });

            collector.on(
              "collect",

              async interaction => {
                try {
                  const userId =
                    interaction.user.id;

                  const now =
                    Date.now();

                  const pickupCooldown =
                    await cooldownsCol.findOne({
                      type: "pickup",
                      userId
                    });

                  const cooldownTime =
                    5 * 60 * 1000;

                  let usedExtraGrab = false;

                  if (
                    pickupCooldown &&
                    now - pickupCooldown.timestamp < cooldownTime
                  ) {
                    const inventoryDoc =
                      await inventoryCol.findOne({
                        userId
                      });

                    const extraGrabs =
                      inventoryDoc?.items?.extra_grab || 0;

                    if (extraGrabs <= 0) {
                      const remaining =
                        cooldownTime -
                        (now - pickupCooldown.timestamp);

                      const minutes =
                        Math.floor(
                          remaining / 60000
                        );

                      const seconds =
                        Math.floor(
                          (remaining % 60000) / 1000
                        );

                      return interaction.reply({
                        content:
                          `❌ You can claim again in ` +
                          `${minutes}m ${seconds}s.`,
                        ephemeral: true
                      });
                    }

                    await inventoryCol.updateOne(
                      {
                        userId
                      },
                      {
                        $inc: {
                          "items.extra_grab": -1
                        }
                      }
                    );

                    usedExtraGrab = true;
                  }

                  if (claimedUsers.has(userId)) {
                    return interaction.reply({
                      content:
                        "❌ You already claimed a card from this drop.",
                      ephemeral: true
                    });
                  }

                  const index =
                    parseInt(
                      interaction.customId
                        .split("_")[1]
                    );

                  if (claimed[index]) {
                    return interaction.reply({
                      content:
                        "❌ This card is already claimed.",
                      ephemeral: true
                    });
                  }

                  claimed[index] = true;
                  claimedUsers.add(userId);

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

                  await cooldownsCol.updateOne(
                    {
                      type: "pickup",
                      userId
                    },
                    {
                      $set: {
                        timestamp: now,
                        notified: false
                      }
                    },
                    {
                      upsert: true
                    }
                  );

                  row.components[index]
                    .setDisabled(true)
                    .setLabel("✅");

                  await interaction.update({
                    content: dropText,
                    files: [attachment],
                    components: [row]
                  });

                  await channel.send(
                    `🎉 ${interaction.user} claimed ` +
                    `${getTierEmoji(selectedCard.tier)} ` +
                    `**${selectedCard.name}**\n` +
                    `└ ${code} • #${serial}` +
                    (
                      usedExtraGrab
                        ? "\n⚡ **Extra Grab Used!**"
                        : ""
                    )
                  );
                }

                catch (err) {
                  console.error(err);
                }
              }
            );

            collector.on(
              "end",

              async () => {
                try {
                  row.components.forEach(
                    button =>
                      button.setDisabled(true)
                  );

                  await msg.edit({
                    content: dropText,
                    files: [attachment],
                    components: [row]
                  });
                }

                catch (err) {
                  console.error(err);
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

    1800000
  );
};