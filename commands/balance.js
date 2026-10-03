const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

async function execute(message) {
  const isSlash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user = isSlash ? message.user : message.author;

  if (isSlash && !message.deferred && !message.replied) {
    await message.deferReply();
  }

  const reply = payload => {
    if (!isSlash) return message.reply(payload);
    if (message.deferred) return message.editReply(payload);
    return message.followUp(payload);
  };

  try {
    const db = await connectDB();

    const [balance, inventory] = await Promise.all([
      db.collection("balances").findOne({ userId: user.id }),
      db.collection("inventory").findOne({ userId: user.id })
    ]);

    const coins = balance?.coins ?? 0;
    const ultronChips = balance?.ultronChips ?? 0;
    const candies = inventory?.items?.groot_candy ?? 0;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${user.username}'s Balance`)
      .setDescription(
        `<:grootcoin:1504742213110861834> Coins: **${coins.toLocaleString()}**\n` +
        `<:chipslogo:1519287944421048320> Ultron Chips: **${ultronChips.toLocaleString()}**\n` +
        `<:grootcandy:1555950722816675870> Groot Candy: **${candies.toLocaleString()}**`
      )
      .setFooter({ text: "GrootX Economy System" })
      .setTimestamp();

    return await reply({ embeds: [embed] });
  } catch (error) {
    console.error("[BALANCE]", error);

    return reply({
      content: "❌ Could not load your balance. Please try again."
    });
  }
}

module.exports = {
  name: "balance",
  aliases: ["bal"],

  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View your coins, Ultron Chips, and Groot Candy."),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};