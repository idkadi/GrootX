const cards = require("../data/season1");

const SEASON = 1;
const HALLOWEEN_EVENT = "halloween2026";
const CANDY_EMOJI = "<:grootcandy:1555950722816675870>";

const HALLOWEEN_START = Date.parse("2026-10-03T00:00:00+05:30");
const HALLOWEEN_END = Date.parse("2026-11-01T00:00:00+05:30");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const createDropImage = require("../utils/createDropImage");
const connectDB = require("../database");

function isHalloweenCard(card) {
  return card.event === HALLOWEEN_EVENT;
}

function isHalloweenActive(now = Date.now()) {
  return now >= HALLOWEEN_START && now < HALLOWEEN_END;
}

function rollCandyReward(random = Math.random, now = Date.now()) {
  if (!isHalloweenActive(now) || random() >= 0.15) return 0;
  return 25 + Math.floor(random() * 76);
}

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

function getCardEmoji(card) {
  return isHalloweenCard(card) ? "🎃" : getTierEmoji(card.tier);
}

function getRandomTier() {
  const chance = Math.random() * 100;

  const halloweenAvailable =
    isHalloweenActive() && cards.some(isHalloweenCard);

  // Common 59.5%, Uncommon 27.5%, Rare 10%,
  // Epic 2.2%, Legendary 0.3%, Halloween 0.5%.
  // Outside the event, Common returns to 60%.
  const common = halloweenAvailable ? 59.5 : 60;

  if (chance < common) return "common";
  if (chance < common + 27.5) return "uncommon";
  if (chance < common + 37.5) return "rare";
  if (chance < common + 39.7) return "epic";
  if (chance < common + 40) return "legendary";

  return "halloween";
}

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(
        Math.floor(Math.random() * chars.length)
      );
    }

    const exists = await collectionsCol.findOne({ code });

    if (!exists) return code;
  }
}

async function getRecentDrops(recentDropsCol) {
  const docs = await recentDropsCol
    .find({ season: SEASON })
    .sort({ createdAt: 1 })
    .toArray();

  return docs.map(doc => Number(doc.cardId));
}

async function saveRecentDrops(recentDropsCol, recentDrops) {
  await recentDropsCol.deleteMany({ season: SEASON });

  if (recentDrops.length > 0) {
    await recentDropsCol.insertMany(
      recentDrops.map((cardId, index) => ({
        cardId: Number(cardId),
        season: SEASON,
        createdAt: Date.now() + index
      }))
    );
  }
}

function getSeriesName(card) {
  return String(card.show || card.appearance || "").trim();
}

function pickWithoutRecent(
  rarity,
  dropCards,
  usedShows,
  recentDrops
) {
  const isSameCard = (a, b) => Number(a.id) === Number(b.id);

  // Event cards never enter ordinary tier pools.
  const regularCards = cards.filter(card => !card.event);

  const pool = rarity === "halloween"
    ? (
        isHalloweenActive()
          ? cards.filter(isHalloweenCard)
          : []
      )
    : regularCards.filter(
        card =>
          String(card.tier || "").toLowerCase() === rarity
      );

  const notInDrop = card =>
    !dropCards.some(dropped => isSameCard(dropped, card));

  const notRecent = card =>
    !recentDrops.includes(Number(card.id));

  let rarityCards = pool.filter(
    card =>
      notRecent(card) &&
      notInDrop(card) &&
      !usedShows.includes(getSeriesName(card))
  );

  if (!rarityCards.length) {
    rarityCards = pool.filter(
      card => notRecent(card) && notInDrop(card)
    );
  }

  if (!rarityCards.length) {
    rarityCards = pool.filter(notInDrop);
  }

  if (!rarityCards.length) {
    rarityCards = regularCards.filter(notInDrop);
  }

  const randomCard =
    rarityCards[Math.floor(Math.random() * rarityCards.length)];

  if (!randomCard) return null;

  recentDrops.push(Number(randomCard.id));

  while (recentDrops.length > 15) {
    recentDrops.shift();
  }

  return randomCard;
}

async function assignDropSerials(serialsCol, dropCards) {
  const serialMap = {};

  for (const card of dropCards) {
    await serialsCol.updateOne(
      {
        cardId: Number(card.id),
        season: SEASON
      },
      {
        $inc: { serial: 1 },
        $setOnInsert: { season: SEASON }
      },
      { upsert: true }
    );

    const serialDoc = await serialsCol.findOne({
      cardId: Number(card.id),
      season: SEASON
    });

    if (!serialDoc) {
      throw new Error(
        `Failed to create serial for S1 card ${card.id}`
      );
    }

    serialMap[card.id] = serialDoc.serial;
  }

  return serialMap;
}

async function getWishlistData(db, dropCards) {
  const wishCol = db.collection("wishlists");
  const droppedIds = dropCards.map(card => Number(card.id));

  const wishUsers = await wishCol
    .find({
      cards: {
        $elemMatch: {
          cardId: { $in: droppedIds },
          season: SEASON
        }
      }
    })
    .toArray();

  const counts = {};
  const pingUsers = new Set();

  for (const card of dropCards) {
    counts[card.id] = 0;
  }

  for (const wish of wishUsers) {
    const wishedKeys = new Set(
      (wish.cards || [])
        .filter(
          entry =>
            entry &&
            typeof entry === "object" &&
            !Array.isArray(entry)
        )
        .map(entry => {
          const cardId = Number(entry.cardId ?? entry.id);
          const season = Number(entry.season ?? 0);

          return `${season}:${cardId}`;
        })
    );

    let matched = false;

    for (const droppedId of droppedIds) {
      const key = `${SEASON}:${Number(droppedId)}`;

      if (wishedKeys.has(key)) {
        counts[droppedId] = (counts[droppedId] || 0) + 1;
        matched = true;
      }
    }

    if (matched) {
      pingUsers.add(wish.userId);
    }
  }

  const pingText = pingUsers.size > 0
    ? `\n\n💫 Wishlist alert: ${
        Array.from(pingUsers)
          .map(id => `<@${id}>`)
          .join(" ")
      }`
    : "";

  return { counts, pingText };
}

module.exports = {
  name: "drop",
  aliases: ["d"],

  data: new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Drop cards for everyone to claim.")
    .setDMPermission(false),

  async executeSlash(interaction) {
    return module.exports.execute(interaction);
  },

  async execute(message) {
    // Acknowledge slash commands before database work and rendering.
    if (
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand()
    ) {
      const interaction = message;

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      message = {
        author: interaction.user,

        reply: async payload => {
          await interaction.editReply(
            typeof payload === "string"
              ? { content: payload }
              : payload
          );

          return interaction.fetchReply();
        }
      };
    }

    console.log("[DROP] ✅ Drop command reached");

    try {
      const db = await connectDB();

      const collectionsCol = db.collection("collections");
      const serialsCol = db.collection("serials");
      const cooldownsCol = db.collection("cooldowns");
      const recentDropsCol = db.collection("recentDrops");
      const inventoryCol = db.collection("inventory");
      const stoneEffectsCol = db.collection("stoneeffects");

      const userId = message.author.id;
      const now = Date.now();

      const stoneEffect = await stoneEffectsCol.findOne({
        userId
      });

      const dropCooldown = await cooldownsCol.findOne({
        type: "drop",
        userId
      });

      let cooldownTime = 12 * 60 * 1000;

      if (
        stoneEffect?.timeUntil &&
        stoneEffect.timeUntil > now
      ) {
        cooldownTime /= 2;
      }

      let usedExtraDrop = false;

      if (
        dropCooldown &&
        now - dropCooldown.timestamp < cooldownTime
      ) {
        const inventoryDoc = await inventoryCol.findOne({
          userId
        });

        const extraDrops =
          inventoryDoc?.items?.extra_drop || 0;

        if (extraDrops <= 0) {
          const remaining =
            cooldownTime - (now - dropCooldown.timestamp);

          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor(
            (remaining % 60000) / 1000
          );

          return message.reply(
            `❌ You can drop again in ${minutes}m ${seconds}s.`
          );
        }

        await inventoryCol.updateOne(
          { userId },
          { $inc: { "items.extra_drop": -1 } }
        );

        usedExtraDrop = true;
      }

      await cooldownsCol.updateOne(
        { type: "drop", userId },
        {
          $set: {
            timestamp: now,
            notified: false
          }
        },
        { upsert: true }
      );

      let cardsToDrop = 3;
      let mindStoneUsed = false;

      if ((stoneEffect?.mindDropsRemaining || 0) > 0) {
        cardsToDrop = 4;
        mindStoneUsed = true;

        await stoneEffectsCol.updateOne(
          { userId },
          { $inc: { mindDropsRemaining: -1 } }
        );
      }

      const recentDrops = await getRecentDrops(recentDropsCol);
      const dropCards = [];
      const usedShows = [];

      const claimedUsers = new Set();
      const claimedCards = Array(cardsToDrop).fill(false);

      const attemptedBy = Array(cardsToDrop)
        .fill(null)
        .map(() => new Set());

      while (dropCards.length < cardsToDrop) {
        const rarity = getRandomTier();

        const randomCard = pickWithoutRecent(
          rarity,
          dropCards,
          usedShows,
          recentDrops
        );

        if (!randomCard) continue;

        dropCards.push(randomCard);

        const seriesName = getSeriesName(randomCard);

        if (seriesName) {
          usedShows.push(seriesName);
        }
      }

      await saveRecentDrops(recentDropsCol, recentDrops);

      const dropSerials = await assignDropSerials(
        serialsCol,
        dropCards
      );

      const wishlistData = await getWishlistData(
        db,
        dropCards
      );

      // Preserve event metadata for the Halloween frame.
      const renderedCards = dropCards.map(card => ({
        ...card,
        season: SEASON,
        serial: dropSerials[card.id]
      }));

      console.log(
        "[DROP] Rendering cards:",
        renderedCards.map(card => ({
          id: card.id,
          name: card.name,
          rawImage: card.rawImage,
          tier: card.tier,
          season: card.season
        }))
      );

      let dropImage;

      try {
        dropImage = await createDropImage(renderedCards);
        console.log("[DROP] ✅ Drop image rendered");
      } catch (error) {
        console.error(
          "[DROP] ❌ createDropImage failed:",
          error
        );

        throw error;
      }

      const powerActive =
        stoneEffect?.powerUntil &&
        stoneEffect.powerUntil > now;

      const timeActive =
        stoneEffect?.timeUntil &&
        stoneEffect.timeUntil > now;

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

      const dropText =
        (
          dropCards.some(isHalloweenCard)
            ? "🎃 **Special Halloween Drop!**\n"
            : "🎴 **A New Drop Has Appeared!**\n"
        ) +
        "\u200B\n" +
        effectText +
        "\n" +
        dropCards
          .map(
            (card, index) =>
              `**${index + 1}.** ` +
              `${getCardEmoji(card)} ` +
              `**${card.name}** ` +
              `#${dropSerials[card.id]}`
          )
          .join("\n") +
        wishlistData.pingText;

      const row = new ActionRowBuilder();

      for (let i = 0; i < cardsToDrop; i++) {
        const card = dropCards[i];
        const wishCount = wishlistData.counts[card.id] || 0;

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_${i}`)
            .setLabel(`💖 ${wishCount}`)
            .setStyle(ButtonStyle.Primary)
        );
      }

      const dropMessage = await message.reply({
        content: dropText,
        files: [
          {
            attachment: dropImage,
            name: "drop.png"
          }
        ],
        components: [row]
      });

      console.log("[DROP] ✅ Drop sent");

      const dropStartedAt = Date.now();

      const collector =
        dropMessage.createMessageComponentCollector({
          time: 60000
        });

      collector.on("collect", async interaction => {
        try {
          const claimerId = interaction.user.id;
          const claimNow = Date.now();

          const index = parseInt(
            interaction.customId.split("_")[1]
          );

          if (
            Number.isNaN(index) ||
            !dropCards[index]
          ) {
            return interaction.reply({
              content: "❌ Invalid card.",
              ephemeral: true
            });
          }

          await interaction.deferUpdate();

          attemptedBy[index].add(claimerId);

          const claimerEffect =
            await stoneEffectsCol.findOne({
              userId: claimerId
            });

          const dropperPowerActive =
            stoneEffect?.powerUntil &&
            stoneEffect.powerUntil > claimNow;

          const claimerPowerActive =
            claimerEffect?.powerUntil &&
            claimerEffect.powerUntil > claimNow;

          const priorityTime =
            dropperPowerActive ? 6 * 1000 : 5 * 1000;

          if (
            claimNow - dropStartedAt < priorityTime &&
            claimerId !== userId &&
            !claimerPowerActive
          ) {
            return;
          }

          const pickupCooldown =
            await cooldownsCol.findOne({
              type: "pickup",
              userId: claimerId
            });

          let pickupTime = 4 * 60 * 1000;

          if (
            claimerEffect?.timeUntil &&
            claimerEffect.timeUntil > claimNow
          ) {
            pickupTime /= 2;
          }

          let usedExtraGrab = false;

          if (
            pickupCooldown &&
            claimNow - pickupCooldown.timestamp < pickupTime
          ) {
            const inventoryDoc =
              await inventoryCol.findOne({
                userId: claimerId
              });

            const extraGrabs =
              inventoryDoc?.items?.extra_grab || 0;

            if (extraGrabs <= 0) {
              const remaining =
                pickupTime -
                (claimNow - pickupCooldown.timestamp);

              const minutes = Math.floor(remaining / 60000);
              const seconds = Math.floor(
                (remaining % 60000) / 1000
              );

              return interaction.followUp({
                content:
                  `❌ You can claim again in ${minutes}m ${seconds}s.`,
                ephemeral: true
              });
            }

            await inventoryCol.updateOne(
              { userId: claimerId },
              { $inc: { "items.extra_grab": -1 } }
            );

            usedExtraGrab = true;
          }

          if (claimedUsers.has(claimerId)) {
            return interaction.followUp({
              content:
                "❌ You already claimed a card from this drop.",
              ephemeral: true
            });
          }

          if (claimedCards[index]) {
            return interaction.followUp({
              content: "❌ This card was already claimed.",
              ephemeral: true
            });
          }

          claimedUsers.add(claimerId);
          claimedCards[index] = true;

          const claimedCard = dropCards[index];
          const cardId = claimedCard.id;
          const serial = dropSerials[cardId];

          const code = await generateUniqueCode(
            collectionsCol
          );

          await collectionsCol.insertOne({
            userId: claimerId,
            cardId: Number(cardId),
            season: SEASON,
            serial,
            ...(
              isHalloweenCard(claimedCard)
                ? { event: HALLOWEEN_EVENT }
                : {}
            ),
            code,
            tag: null,
            favorite: false
          });

          await cooldownsCol.updateOne(
            {
              type: "pickup",
              userId: claimerId
            },
            {
              $set: {
                timestamp: claimNow,
                notified: false
              }
            },
            { upsert: true }
          );

          row.components[index]
            .setDisabled(true)
            .setStyle(ButtonStyle.Secondary);

          await interaction.editReply({
            components: [row]
          });

          const challengers =
            attemptedBy[index].size - 1;

          let claimText;

          if (
            challengers > 0 &&
            claimerId === userId &&
            claimNow - dropStartedAt < priorityTime
          ) {
            claimText =
              `⚔️ ${interaction.user} fought off ` +
              `${challengers} challenger${
                challengers === 1 ? "" : "s"
              } ` +
              `and took 1️⃣ ${getCardEmoji(claimedCard)} ` +
              `**${claimedCard.name}** ` +
              `#${serial} • ${code}!`;
          } else if (
            claimerPowerActive &&
            claimerId !== userId &&
            claimNow - dropStartedAt < priorityTime
          ) {
            claimText =
              `💪 ${interaction.user} used the **Power Stone** ` +
              `and overpowered priority, claiming ` +
              `1️⃣ ${getCardEmoji(claimedCard)} ` +
              `**${claimedCard.name}** ` +
              `#${serial} • ${code}!`;
          } else {
            claimText =
              `🎉 ${interaction.user} claimed ` +
              `1️⃣ ${getCardEmoji(claimedCard)} ` +
              `**${claimedCard.name}** ` +
              `#${serial} • ${code}!`;
          }

          if (usedExtraGrab) {
            claimText += "\n⚡ **Extra Grab Used!**";
          }

          await interaction.followUp({
            content: claimText
          });
        } catch (error) {
          console.error("[DROP] Claim error:", error);
        }
      });

      // One candy roll per successfully posted drop.
      // The dropper receives the reward, including on extra drops.
      const candyReward = rollCandyReward();

      if (candyReward > 0) {
        try {
          await inventoryCol.updateOne(
            { userId },
            {
              $inc: {
                "items.groot_candy": candyReward
              }
            },
            { upsert: true }
          );

          await dropMessage.reply({
            content:
              `${CANDY_EMOJI} <@${userId}> found ` +
              `**${candyReward} Groot Candy** while dropping!`,
            allowedMentions: {
              users: [userId],
              repliedUser: false
            }
          }).catch(error =>
            console.error("[DROP] Candy notice failed:", error)
          );
        } catch (error) {
          console.error("[DROP] Candy reward failed:", error);
        }
      }
    } catch (error) {
      console.error(
        "[DROP] ❌ DROP COMMAND FAILED:",
        error
      );

      console.error(error?.stack);

      return message
        .reply(
          `❌ Drop failed: \`${
            error.message || "Unknown error"
          }\``
        )
        .catch(() => {});
    }
  }
};