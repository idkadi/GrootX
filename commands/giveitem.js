const fs = require("fs");

const {
  EmbedBuilder
} = require("discord.js");

const inventoryPath =
  "./data/inventory.json";

module.exports = {

  name: "giveitem",

  async execute(message, args) {

    // OPTIONAL:
    // OWNER ONLY
    if (
      message.author.id !==
      "859803575995727872"
    ) {

      return message.reply(
        "❌ You cannot use this command."
      );

    }

    // MENTIONED USER
    const user =
      message.mentions.users.first();

    if (!user) {

      return message.reply(
        "❌ Please mention a user."
      );

    }

    // ITEM NAME
    const item =
      args[1]?.toLowerCase();

    if (!item) {

      return message.reply(
        "❌ Please provide an item name."
      );

    }

    // AMOUNT
    const amount =
      parseInt(args[2]);

    if (
      isNaN(amount) ||
      amount <= 0
    ) {

      return message.reply(
        "❌ Invalid amount."
      );

    }

    // LOAD INVENTORY
    const inventory =
      JSON.parse(
        fs.readFileSync(inventoryPath)
      );

    const userId =
      user.id;

    // CREATE USER INVENTORY
    if (!inventory[userId]) {

      inventory[userId] = {};

    }

    // CREATE ITEM
    if (!inventory[userId][item]) {

      inventory[userId][item] = 0;

    }

    // ADD ITEM
    inventory[userId][item] += amount;

    // SAVE FILE
    fs.writeFileSync(

      inventoryPath,

      JSON.stringify(
        inventory,
        null,
        2
      )

    );

    // EMBED
    const embed =
      new EmbedBuilder()

        .setColor(0x8b5cf6)

        .setTitle(
          "🎁 Item Added"
        )

        .setDescription(

          `Added **${item} x${amount}**\n` +
          `to ${user.username}'s inventory.`

        )

        .setTimestamp();

    // SEND
    await message.reply({

      embeds: [embed]

    });

  }

};