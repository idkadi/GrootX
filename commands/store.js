const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const HALLOWEEN_PACK_COST = 3000;

const COIN = "<:grootcoin:1504742213110861834>";
const CHIP = "<:chipslogo:1519287944421048320>";
const CANDY = "<:grootcandy:1555950722816675870>";

async function execute(message) {
  const isSlash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  if (isSlash && !message.deferred && !message.replied) {
    await message.deferReply();
  }

  const embed = new EmbedBuilder()
    .setColor(0xff8c00)
    .setTitle("🛒 GrootX Store")
    .setDescription(
      "Browse items below. Halloween packs use Groot Candy."
    )
    .addFields(
      {
        name: `${COIN} Coin Shop`,
        value:
          "<:guantlet:1504854241360085066> **Gauntlet — 15,000 Coins**\n" +
          "Required for the Snap system.\n\n" +
          "📜 **Trade Voucher — 3,000 Coins**\n" +
          "Trade access for 30 days.\n\n" +
          "📘 **Album — 5,000 Coins**\n" +
          "Create a custom card album.\n\n" +
          "📄 **Page — 1,500 Coins**\n" +
          "Add an extra album page."
      },
      {
        name: `${CHIP} Ultron Chip Shop`,
        value:
          "🌌 **Extra Drop — 1 Chip**\n" +
          "One extra drop.\n\n" +
          "⚡ **Extra Grab — 1 Chip**\n" +
          "Reset your grab cooldown once."
      },
      {
        name: "🎃 Halloween Shop",
        value:
          `🎃 **Halloween Card Pack — ${HALLOWEEN_PACK_COST.toLocaleString()} ${CANDY}**\n` +
          "Stored in your inventory as a Halloween Card Pack."
      },
      {
        name: "💡 Purchase examples",
        value:
          "`!buy extra drop`\n" +
          "`!buy extra drop 5`\n" +
          "`!buy halloween pack 2`\n" +
          "Quantity purchases require the updated buy command."
      }
    )
    .setFooter({
      text: "GrootX Store • Coins / Ultron Chips / Groot Candy"
    })
    .setTimestamp();

  if (!isSlash) {
    return message.reply({ embeds: [embed] });
  }

  if (message.deferred) {
    return message.editReply({ embeds: [embed] });
  }

  return message.followUp({ embeds: [embed] });
}

module.exports = {
  name: "store",
  aliases: ["shop"],

  data: new SlashCommandBuilder()
    .setName("store")
    .setDescription(
      "Browse the coin, Ultron Chip, and Halloween candy shops."
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};