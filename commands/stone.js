const cards = require("../data/cards");
const path = require("path");

const {
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");

const connectDB = require("../database");

function getStoneKey(stone) {
  return `items.${stone}_stone`;
}

function getRandomSameTierCard(oldCard) {
  const sameTierCards = cards.filter(c =>
    c.tier === oldCard.tier &&
    Number(c.id) !== Number(oldCard.id)
  );

  if (!sameTierCards.length) return null;

  return sameTierCards[
    Math.floor(Math.random() * sameTierCards.length)
  ];
}

module.exports = {
  name: "stone",

  async execute(message, args) {
    const stone = args[0]?.toLowerCase();
    const code = args[1]?.toLowerCase();

    if (!stone) {
      return message.reply(
        "❌ Use: `!stone power`, `!stone time`, `!stone mind`, or `!stone reality <code>`"
      );
    }

    const allowed = [
      "power",
      "time",
      "mind",
      "reality",
      "space",
      "soul"
    ];

    if (!allowed.includes(stone)) {
      return message.reply("❌ Invalid stone.");
    }

    if (["space", "soul"].includes(stone)) {
      return message.reply("🕒 This stone power will be added later.");
    }

    const db = await connectDB();

    const inventoryCol = db.collection("inventory");
    const collectionsCol = db.collection("collections");
    const stoneEffectsCol = db.collection("stoneeffects");
    const serialsCol = db.collection("serials");

    const userId = message.author.id;
    const stoneKey = getStoneKey(stone);

    const inventory = await inventoryCol.findOne({ userId });
    const stoneAmount =
      inventory?.items?.[`${stone}_stone`] || 0;

    if (stoneAmount <= 0) {
      return message.reply(
        `❌ You don't have a ${stone} stone.`
      );
    }

    if (stone === "power") {
      await inventoryCol.updateOne(
        { userId },
        { $inc: { [stoneKey]: -1 } }
      );

      await stoneEffectsCol.updateOne(
        { userId },
        {
          $set: {
            userId,
            powerUntil:
              Date.now() + 3 * 60 * 60 * 1000
          }
        },
        { upsert: true }
      );

      return message.reply(
        "💪 **Power Stone activated!**\n" +
        "You can overpower drop priority for **3 hours**."
      );
    }

    if (stone === "time") {
      await inventoryCol.updateOne(
        { userId },
        { $inc: { [stoneKey]: -1 } }
      );

      await stoneEffectsCol.updateOne(
        { userId },
        {
          $set: {
            userId,
            timeUntil:
              Date.now() + 30 * 60 * 1000
          }
        },
        { upsert: true }
      );

      return message.reply(
        "⏳ **Time Stone activated!**\n" +
        "Drop and grab cooldowns are **2x faster for 30 minutes**."
      );
    }

    if (stone === "mind") {
      await inventoryCol.updateOne(
        { userId },
        { $inc: { [stoneKey]: -1 } }
      );

      await stoneEffectsCol.updateOne(
        { userId },
        {
          $set: {
            userId,
            mindDropsRemaining: 3
          }
        },
        { upsert: true }
      );

      return message.reply(
        "🧠 **Mind Stone activated!**\n" +
        "Your next **3 drops** will drop **4 cards**."
      );
    }

    if (stone === "reality") {
      if (!code) {
        return message.reply(
          "❌ Use: `!stone reality <cardcode>`"
        );
      }

      const ownedCard = await collectionsCol.findOne({
        userId,
        code
      });

      if (!ownedCard) {
        return message.reply(
          "❌ You don't own that card."
        );
      }

      const oldCard = cards.find(
        c => Number(c.id) === Number(ownedCard.cardId)
      );

      if (!oldCard) {
        return message.reply("❌ Card data not found.");
      }

      const newCard = getRandomSameTierCard(oldCard);

      if (!newCard) {
        return message.reply(
          "❌ No same-tier card available."
        );
      }

      await serialsCol.updateOne(
        { cardId: newCard.id },
        { $inc: { serial: 1 } },
        { upsert: true }
      );

      const serialDoc = await serialsCol.findOne({
        cardId: newCard.id
      });

      const newSerial = serialDoc.serial;

      await inventoryCol.updateOne(
        { userId },
        { $inc: { [stoneKey]: -1 } }
      );

      await collectionsCol.updateOne(
        { userId, code },
        {
          $set: {
            cardId: newCard.id,
            serial: newSerial
          }
        }
      );

      const oldImageName =
        `old_${oldCard.image.split("/").pop()}`;

      const newImageName =
        `new_${newCard.image.split("/").pop()}`;

      const oldImagePath = path.join(
        __dirname,
        "..",
        "images",
        oldCard.image
      );

      const newImagePath = path.join(
        __dirname,
        "..",
        "images",
        newCard.image
      );

      const oldAttachment =
        new AttachmentBuilder(oldImagePath, {
          name: oldImageName
        });

      const newAttachment =
        new AttachmentBuilder(newImagePath, {
          name: newImageName
        });

      const embed = new EmbedBuilder()
        .setColor(0x8a2be2)
        .setTitle("🌀 Reality Stone Used")
        .setDescription(
          `Reality has rewritten card \`${code}\`.\n\n` +
          `**Before:** ${oldCard.name} #${ownedCard.serial}\n` +
          `**After:** ${newCard.name} #${newSerial}\n\n` +
          `Tier stayed: **${oldCard.tier}**`
        )
        .setThumbnail(`attachment://${oldImageName}`)
        .setImage(`attachment://${newImageName}`)
        .setFooter({
          text:
            "Thumbnail = old card • Main image = new card"
        })
        .setTimestamp();

      return message.reply({
        embeds: [embed],
        files: [
          oldAttachment,
          newAttachment
        ]
      });
    }
  }
};