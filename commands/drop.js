const cards = require("../data/cards");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const createDropImage = require("../utils/createDropImage");
const connectDB = require("../database");

function getTierEmoji(tier) {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "❓";
  }
}

function getRandomTier() {
  const chance = Math.random() * 100;

  if (chance < 60) return "common";
  if (chance < 87.5) return "uncommon";
  if (chance < 97.5) return "rare";
  if (chance < 99.5) return "epic";

  return "legendary";
}

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const exists = await collectionsCol.findOne({ code });

    if (!exists) return code;
  }
}

async function getRecentDrops(recentDropsCol) {
  const docs = await recentDropsCol
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

function pickWithoutRecent(rarity, dropCards, usedShows, recentDrops) {
  let rarityCards = cards.filter(
    c =>
      c.tier === rarity &&
      !recentDrops.includes(c.id) &&
      !dropCards.some(d => d.id === c.id) &&
      !usedShows.includes(c.show)
  );

  if (rarityCards.length === 0) {
    rarityCards = cards.filter(
      c =>
        c.tier === rarity &&
        !recentDrops.includes(c.id) &&
        !dropCards.some(d => d.id === c.id)
    );
  }

  if (rarityCards.length === 0) {
    rarityCards = cards.filter(
      c =>
        c.tier === rarity &&
        !dropCards.some(d => d.id === c.id)
    );
  }

  if (rarityCards.length === 0) {
    rarityCards = cards.filter(c => c.tier === rarity);
  }

  const randomCard =
    rarityCards[Math.floor(Math.random() * rarityCards.length)];

  recentDrops.push(randomCard.id);

  while (recentDrops.length > 15) {
    recentDrops.shift();
  }

  return randomCard;
}

module.exports = {
  name: "drop",
  aliases: ["d"],

  async execute(message) {
    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");
    const cooldownsCol = db.collection("cooldowns");
    const recentDropsCol = db.collection("recentDrops");
    const inventoryCol = db.collection("inventory");
    const stoneEffectsCol = db.collection("stoneeffects");

    const userId = message.author.id;
    const now = Date.now();

    const stoneEffect = await stoneEffectsCol.findOne({ userId });

    const dropCooldown = await cooldownsCol.findOne({
      type: "drop",
      userId
    });

    let cooldownTime = 8 * 60 * 1000;

    if (stoneEffect?.timeUntil && stoneEffect.timeUntil > now) {
      cooldownTime = cooldownTime / 2;
    }

    let usedExtraDrop = false;

    if (
      dropCooldown &&
      now - dropCooldown.timestamp < cooldownTime
    ) {
      const inventoryDoc = await inventoryCol.findOne({ userId });
      const extraDrops = inventoryDoc?.items?.extra_drop || 0;

      if (extraDrops <= 0) {
        const remaining = cooldownTime - (now - dropCooldown.timestamp);
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        return message.reply(
          `❌ You can drop again in ${minutes}m ${seconds}s.`
        );
      }

      await inventoryCol.updateOne(
        { userId },
        {
          $inc: {
            "items.extra_drop": -1
          }
        }
      );

      usedExtraDrop = true;
    }

    await cooldownsCol.updateOne(
      {
        type: "drop",
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

    let cardsToDrop = 3;
    let mindStoneUsed = false;

    if ((stoneEffect?.mindDropsRemaining || 0) > 0) {
      cardsToDrop = 4;
      mindStoneUsed = true;

      await stoneEffectsCol.updateOne(
        { userId },
        {
          $inc: {
            mindDropsRemaining: -1
          }
        }
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

      dropCards.push(randomCard);

      if (randomCard.show) {
        usedShows.push(randomCard.show);
      }
    }

    await saveRecentDrops(recentDropsCol, recentDrops);

    const dropImage = await createDropImage(dropCards);

    const powerActive =
      stoneEffect?.powerUntil && stoneEffect.powerUntil > now;

    const timeActive =
      stoneEffect?.timeUntil && stoneEffect.timeUntil > now;

    const effectText =
      (usedExtraDrop ? "🌌 **Extra Drop Used!**\n" : "") +
      (mindStoneUsed ? "🧠 **Mind Stone Active! (4 Cards)**\n" : "") +
      (powerActive ? "💪 **Power Stone Active!**\n" : "") +
      (timeActive ? "⏳ **Time Stone Active!**\n" : "");

    const dropText =
      "🎴 **A New Drop Has Appeared!**\n" +
      "\u200B\n" +
      effectText +
      "\n" +
      dropCards.map((card, index) =>
        `**${index + 1}.** ${getTierEmoji(card.tier)} **${card.name}**`
      ).join("\n");

    const row = new ActionRowBuilder();

    for (let i = 0; i < cardsToDrop; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_${i}`)
          .setLabel(`${i + 1}`)
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

    const dropStartedAt = Date.now();

    const collector = dropMessage.createMessageComponentCollector({
      time: 60000
    });

    collector.on("collect", async interaction => {
      const claimerId = interaction.user.id;
      const claimNow = Date.now();

      const index = parseInt(interaction.customId.split("_")[1]);

      attemptedBy[index].add(claimerId);

      const claimerEffect = await stoneEffectsCol.findOne({
        userId: claimerId
      });

      const dropperPowerActive =
        stoneEffect?.powerUntil && stoneEffect.powerUntil > claimNow;

      const claimerPowerActive =
        claimerEffect?.powerUntil && claimerEffect.powerUntil > claimNow;

      const priorityTime = dropperPowerActive
        ? 6 * 1000
        : 5 * 1000;

      if (
        claimNow - dropStartedAt < priorityTime &&
        claimerId !== userId &&
        !claimerPowerActive
      ) {
        return interaction.deferUpdate().catch(() => {});
      }

      const pickupCooldown = await cooldownsCol.findOne({
        type: "pickup",
        userId: claimerId
      });

      let pickupTime = 4 * 60 * 1000;

      if (claimerEffect?.timeUntil && claimerEffect.timeUntil > claimNow) {
        pickupTime = pickupTime / 2;
      }

      let usedExtraGrab = false;

      if (
        pickupCooldown &&
        claimNow - pickupCooldown.timestamp < pickupTime
      ) {
        const inventoryDoc = await inventoryCol.findOne({
          userId: claimerId
        });

        const extraGrabs = inventoryDoc?.items?.extra_grab || 0;

        if (extraGrabs <= 0) {
          const remaining = pickupTime - (claimNow - pickupCooldown.timestamp);
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);

          return interaction.reply({
            content: `❌ You can claim again in ${minutes}m ${seconds}s.`,
            ephemeral: true
          });
        }

        await inventoryCol.updateOne(
          {
            userId: claimerId
          },
          {
            $inc: {
              "items.extra_grab": -1
            }
          }
        );

        usedExtraGrab = true;
      }

      if (claimedUsers.has(claimerId)) {
        return interaction.reply({
          content: "❌ You already claimed a card from this drop.",
          ephemeral: true
        });
      }

      if (claimedCards[index]) {
        return interaction.reply({
          content: "❌ This card was already claimed.",
          ephemeral: true
        });
      }

      claimedUsers.add(claimerId);
      claimedCards[index] = true;

      const claimedCard = dropCards[index];
      const cardId = claimedCard.id;

      await serialsCol.updateOne(
        {
          cardId
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

      const serialDoc = await serialsCol.findOne({
        cardId
      });

      const serial = serialDoc.serial;
      const code = await generateUniqueCode(collectionsCol);

      await collectionsCol.insertOne({
        userId: claimerId,
        cardId,
        serial,
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
        {
          upsert: true
        }
      );

      row.components[index]
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary);

      await interaction.update({
        components: [row]
      });

      const challengers = attemptedBy[index].size - 1;

      let claimText;

      if (
        challengers > 0 &&
        claimerId === userId &&
        claimNow - dropStartedAt < priorityTime
      ) {
        claimText =
          `⚔️ ${interaction.user} fought off ` +
          `${challengers} challenger${challengers === 1 ? "" : "s"} ` +
          `and took ${getTierEmoji(claimedCard.tier)} ` +
          `**${claimedCard.name}** #${serial} • ${code}!`;
      } else if (
        claimerPowerActive &&
        claimerId !== userId &&
        claimNow - dropStartedAt < priorityTime
      ) {
        claimText =
          `💪 ${interaction.user} used the **Power Stone** and overpowered priority, claiming ` +
          `${getTierEmoji(claimedCard.tier)} ` +
          `**${claimedCard.name}** #${serial} • ${code}!`;
      } else {
        claimText =
          `🎉 ${interaction.user} claimed ` +
          `${getTierEmoji(claimedCard.tier)} ` +
          `**${claimedCard.name}** #${serial} • ${code}!`;
      }

      if (usedExtraGrab) {
        claimText += "\n⚡ **Extra Grab Used!**";
      }

      await interaction.followUp({
        content: claimText
      });
    });
  }
};