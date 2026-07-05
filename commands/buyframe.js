const path = require("path");
const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");
const frames = require("../data/frames");

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

function generateFrameCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

async function createUniqueFrameCode(frameInventoryCol) {
  let code;
  let exists = true;

  while (exists) {
    code = generateFrameCode();
    exists = await frameInventoryCol.findOne({ code });
  }

  return code;
}

function getCurrencyEmoji(currency) {
  if (currency === "chips") {
    return "<:chipslogo:1519287944421048320>";
  }

  return "<:grootcoin:1504742213110861834>";
}

module.exports = {
  name: "buyframe",
  aliases: ["framebuy", "framestore", "frames"],

  async execute(message) {
    if (!frames || frames.length === 0) {
      return message.reply("❌ No frames are available right now.");
    }

    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const frameInventoryCol = db.collection("frameInventory");

    const userId = message.author.id;

    let index = 0;

    function getFramePayload() {
      const frame = frames[index];

      const imagePath = path.join(
        __dirname,
        "..",
        frame.image
      );

      const imageName = `frame_${frame.id}.png`;

      const file = new AttachmentBuilder(imagePath, {
        name: imageName
      });

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle(`🖼️ Frame Store`)
        .setDescription(
          `**${frame.name}**\n\n` +
          `Frame ID: **${frame.id}**\n` +
          `Price: ${getCurrencyEmoji(frame.currency)} **${formatNumber(frame.price)} ${frame.currency}**\n\n` +
          `After buying, you will get a unique 6-character frame code.\n` +
          `Use it with:\n` +
          `\`!putframe cardcode framecode\``
        )
        .setImage(`attachment://${imageName}`)
        .setFooter({
          text: `Frame ${index + 1}/${frames.length}`
        })
        .setTimestamp();

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("frame_prev5")
          .setLabel("⏪ -5")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId("frame_prev")
          .setLabel("⬅️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("frame_buy")
          .setLabel("Buy")
          .setEmoji("🛒")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId("frame_next")
          .setLabel("➡️")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("frame_next5")
          .setLabel("+5 ⏩")
          .setStyle(ButtonStyle.Secondary)
      );

      return {
        embeds: [embed],
        files: [file],
        components: [row1]
      };
    }

    const msg = await message.reply(getFramePayload());

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "❌ This frame store is not for you.",
          ephemeral: true
        });
      }

      if (interaction.customId === "frame_prev") {
        index--;
        if (index < 0) index = frames.length - 1;

        return interaction.update(getFramePayload());
      }

      if (interaction.customId === "frame_next") {
        index++;
        if (index >= frames.length) index = 0;

        return interaction.update(getFramePayload());
      }

      if (interaction.customId === "frame_prev5") {
        index -= 5;
        while (index < 0) index += frames.length;

        return interaction.update(getFramePayload());
      }

      if (interaction.customId === "frame_next5") {
        index += 5;
        index = index % frames.length;

        return interaction.update(getFramePayload());
      }

      if (interaction.customId === "frame_buy") {
        const frame = frames[index];

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("frame_confirm")
            .setLabel("Confirm Buy")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("frame_cancel")
            .setLabel("Cancel")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
          content:
            `Buy **${frame.name}** for ` +
            `${getCurrencyEmoji(frame.currency)} **${formatNumber(frame.price)} ${frame.currency}**?`,
          components: [confirmRow],
          ephemeral: true
        });
      }

      if (interaction.customId === "frame_cancel") {
        return interaction.update({
          content: "❌ Purchase cancelled.",
          components: []
        });
      }

      if (interaction.customId === "frame_confirm") {
        const frame = frames[index];

        const balanceDoc =
          await balancesCol.findOne({ userId }) || {};

        const coins = balanceDoc.coins || 0;

        const chips =
          balanceDoc.ultronChips ||
          balanceDoc.ultronchips ||
          balanceDoc.chips ||
          0;

        if (frame.currency === "coins") {
          if (coins < frame.price) {
            return interaction.update({
              content:
                `❌ You need ${getCurrencyEmoji("coins")} **${formatNumber(frame.price)} coins**.\n` +
                `You only have **${formatNumber(coins)}**.`,
              components: []
            });
          }

          await balancesCol.updateOne(
            { userId },
            { $inc: { coins: -frame.price } },
            { upsert: true }
          );
        }

        if (frame.currency === "chips") {
          if (chips < frame.price) {
            return interaction.update({
              content:
                `❌ You need ${getCurrencyEmoji("chips")} **${formatNumber(frame.price)} chips**.\n` +
                `You only have **${formatNumber(chips)}**.`,
              components: []
            });
          }

          await balancesCol.updateOne(
            { userId },
            { $inc: { ultronChips: -frame.price } },
            { upsert: true }
          );
        }

        const uniqueCode =
          await createUniqueFrameCode(frameInventoryCol);

        await frameInventoryCol.insertOne({
          userId,
          code: uniqueCode,
          frameId: frame.id,
          used: false,
          purchasedAt: Date.now()
        });

        return interaction.update({
          content:
            `✅ You bought **${frame.name}**!\n\n` +
            `Your frame code: \`${uniqueCode}\`\n` +
            `Use it with:\n` +
            `\`!putframe cardcode ${uniqueCode}\``,
          components: []
        });
      }
    });

    collector.on("end", async () => {
      await msg.edit({
        components: []
      }).catch(() => {});
    });
  }
};