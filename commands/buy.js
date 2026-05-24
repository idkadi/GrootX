const {
  EmbedBuilder
} = require("discord.js");

const connectDB = require("../database");

const storeItems = {
  gauntlet: {
    currency: "coins",
    cost: 15000
  },

  trade_voucher: {
    currency: "coins",
    cost: 7000
  },

  extra_drop: {
    currency: "token",
    cost: 1
  },

  shard_booster: {
    currency: "token",
    cost: 3
  },

  coin_booster: {
    currency: "token",
    cost: 3
  },

  album: {
    currency: "coins",
    cost: 5000
  },

  page: {
    currency: "coins",
    cost: 1500
  }
};

function formatItemName(item) {
  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  name: "buy",

  async execute(message, args) {
    if (!args[0]) {
      return message.reply(
        "❌ Please provide an item.\n" +
        "Example: `!buy gauntlet`"
      );
    }

    const item = args[0].toLowerCase();

    if (!storeItems[item]) {
      return message.reply("❌ Invalid store item.");
    }

    const db = await connectDB();

    const balancesCol = db.collection("balances");
    const inventoryCol = db.collection("inventory");
    const tradePassesCol = db.collection("tradePasses");

    const userId = message.author.id;

    const itemData = storeItems[item];
    const currency = itemData.currency;
    const cost = itemData.cost;

    let balanceDoc = await balancesCol.findOne({ userId });

    if (!balanceDoc) {
      await balancesCol.insertOne({
        userId,
        coins: 0
      });

      balanceDoc = {
        userId,
        coins: 0
      };
    }

    let inventoryDoc = await inventoryCol.findOne({ userId });

    if (!inventoryDoc) {
      await inventoryCol.insertOne({
        userId,
        items: {}
      });

      inventoryDoc = {
        userId,
        items: {}
      };
    }

    const items = inventoryDoc.items || {};

    let userAmount;

    if (currency === "coins") {
      userAmount = balanceDoc.coins || 0;
    } else {
      userAmount = items.token || 0;
    }

    if (userAmount < cost) {
      return message.reply(
        `❌ You need ${cost} ${currency} ` +
        `to buy ${formatItemName(item)}.`
      );
    }

    if (currency === "coins") {
      await balancesCol.updateOne(
        { userId },
        {
          $inc: {
            coins: -cost
          }
        }
      );
    } else {
      await inventoryCol.updateOne(
        { userId },
        {
          $inc: {
            "items.token": -cost
          }
        }
      );
    }

    if (item === "trade_voucher") {
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      await tradePassesCol.updateOne(
        { userId },
        {
          $set: {
            expiresAt: now + thirtyDays
          }
        },
        {
          upsert: true
        }
      );
    }

    await inventoryCol.updateOne(
      { userId },
      {
        $inc: {
          [`items.${item}`]: 1
        }
      },
      {
        upsert: true
      }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("🛒 Purchase Successful")
      .setDescription(
        `Purchased **${formatItemName(item)}**`
      )
      .addFields(
        {
          name: "💸 Cost",
          value: `${cost} ${currency}`,
          inline: true
        },
        {
          name: "📦 Added To",
          value: "Inventory",
          inline: true
        }
      )
      .setTimestamp();

    await message.reply({
      embeds: [embed]
    });
  }
};