const cards = require("../data/cards");

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");

const OWNER_ID = "859803575995727872"; // put your Discord user ID here

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

module.exports = {
  name: "gdrop",
  aliases: ["giveawaydrop"],

  async execute(message, args) {
    if (message.author.id !== OWNER_ID) {
      return message.reply("❌ Owner only command.");
    }

    const cardId = args[0];

    if (!cardId) {
      return message.reply("Usage: `!gdrop <cardId>`");
    }

    const card = cards.find(c => String(c.id) === String(cardId));

    if (!card) {
      return message.reply("❌ Card ID not found.");
    }

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`gdrop_claim_${card.id}`)
        .setLabel("🎁 Claim")
        .setStyle(ButtonStyle.Success)
    );

    const giveawayMessage = await message.channel.send({
      content:
        `🎁 **Giveaway Drop!**\n\n` +
        `${getTierEmoji(card.tier)} **${card.name}**\n\n` +
        `Click below to claim it!`,
      components: [row]
    });

    const collector = giveawayMessage.createMessageComponentCollector({
      time: 60000,
      max: 1
    });

    collector.on("collect", async interaction => {
      await serialsCol.updateOne(
        { cardId: card.id },
        { $inc: { serial: 1 } },
        { upsert: true }
      );

      const serialDoc = await serialsCol.findOne({
        cardId: card.id
      });

      const serial = serialDoc.serial;

      const code = await generateUniqueCode(collectionsCol);

      await collectionsCol.insertOne({
        userId: interaction.user.id,
        cardId: card.id,
        serial,
        code,
        tag: null,
        favorite: false
      });

      row.components[0]
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary);

      await interaction.update({
        content:
          `🎉 ${interaction.user} claimed ` +
          `${getTierEmoji(card.tier)} **${card.name}** ` +
          `#${serial} • ${code}`,
        components: [row]
      });
    });

    collector.on("end", async collected => {
      if (collected.size === 0) {
        row.components[0]
          .setDisabled(true)
          .setStyle(ButtonStyle.Secondary);

        await giveawayMessage.edit({
          content:
            `❌ Giveaway expired.\n\n` +
            `${getTierEmoji(card.tier)} **${card.name}**`,
          components: [row]
        }).catch(() => {});
      }
    });
  }
};