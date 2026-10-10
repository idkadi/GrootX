const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const HALLOWEEN_PACK_COST = 3000;

const COIN = "<:grootcoin:1504742213110861834>";
const CHIP = "<:chipslogo:1519287944421048320>";
const VIBRANIUM = "<:vibranium:1558406389284741150>";
const PACK = "<:halloweenpack:1555956375979425963>";
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
      "Buy items with coins, chips or candy. Craft weapons with Vibranium."
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
          `${PACK} **Halloween Card Pack — ` +
          `${HALLOWEEN_PACK_COST.toLocaleString()} ${CANDY}**\n` +
          "Stored in your inventory as a Halloween Card Pack."
      },
      {
        name: `${VIBRANIUM} Weapon Crafting`,
        value:
          "**Each batch: 2,500 Vibranium → 3 units of one weapon.**\n" +
          "Earn Vibranium by burning cards. Use `/craft` or `!craft`.\n\n" +

          "<:webshooter:1558404855071113236> **Web Shooter • 1 energy**\n" +
          "Lock one empty enemy slot until the start of round 6.\n\n" +

          "<:capshield:1558405113050177636> **Captain America's Shield • 1 energy**\n" +
          "Secretly protect one location. Block the next enemy weapon there, then break.\n\n" +

          "<:mjolnir:1558405891722846318> **Mjolnir • 3 energy**\n" +
          "Dismantle one enemy card, removing it and its points from the battle.\n\n" +

          "<:arc:1558405297536634940> **Arc Reactor • 2 energy**\n" +
          "Add +10 points to your side at one location.\n\n" +

          "<:claws:1558407325256261652> **Wolverine's Claws • 2 energy**\n" +
          "Apply −10 points to the enemy side at one location."
      },
      
      {
        name: "💡 Purchase and crafting examples",
        value:
          "`!buy extra drop`\n" +
          "`!buy extra drop 5`\n" +
          "`!buy halloween pack 2`\n" +
          "`!craft shield`\n" +
          "`!craft mjolnir 2`\n" +
          "`/craft weapon:Web Shooter batches:2`\n" 
      }
    )
    .setFooter({
      text: "GrootX Store • Coins / Ultron Chips / Groot Candy / Vibranium"
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
      "Browse items, Halloween packs and Vibranium weapon crafting."
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};