const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

const storeItems = {
  gauntlet: {
    currency: "coins",
    cost: 15000
  },
  trade_voucher: {
    currency: "coins",
    cost: 3000
  },
  extra_drop: {
    currency: "chips",
    cost: 1
  },
  extra_grab: {
    currency: "chips",
    cost: 1
  },
  album: {
    currency: "coins",
    cost: 5000
  },
  page: {
    currency: "coins",
    cost: 1500
  },
  halloween_pack: {
    currency: "candy",
    cost: 3000
  }
};

const currencies = {
  coins: "<:grootcoin:1504742213110861834> Coins",
  chips: "<:chipslogo:1519287944421048320> Ultron Chips",
  candy: "<:grootcandy:1555950722816675870> Groot Candy"
};

const itemName = item =>
  item === "halloween_pack"
    ? "Halloween Card Pack"
    : item
        .split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join(" ");

const normalizeItem = value =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

function parsePurchase(args = []) {
  const words = [...args];
  let quantity = 1;

  if (
    words.length &&
    /^[+-]?\d+(?:\.\d+)?$/.test(words[words.length - 1])
  ) {
    quantity = Number(words.pop());
  }

  return {
    item: normalizeItem(words.join(" ")),
    quantity
  };
}

async function execute(message, args = []) {
  const slash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user = slash ? message.user : message.author;

  if (slash && !message.deferred && !message.replied) {
    await message.deferReply();
  }

  const reply = payload => {
    if (typeof payload === "string") {
      payload = { content: payload };
    }

    if (!slash) return message.reply(payload);

    return message.deferred
      ? message.editReply(payload)
      : message.followUp(payload);
  };

  try {
    const { item, quantity } = slash
      ? {
          item: normalizeItem(
            message.options.getString("item", true)
          ),
          quantity:
            message.options.getInteger("quantity") ?? 1
        }
      : parsePurchase(args);

    if (!Object.hasOwn(storeItems, item)) {
      return reply(
        "❌ Choose a store item.\n" +
        "Example: `!buy extra drop 5` or " +
        "`!buy halloween pack 2`."
      );
    }

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000
    ) {
      return reply(
        "❌ Quantity must be a whole number from 1 to 1,000."
      );
    }

    const { currency, cost } = storeItems[item];
    const total = cost * quantity;

    const db = await connectDB();
    const balances = db.collection("balances");
    const inventory = db.collection("inventory");
    const passes = db.collection("tradePasses");

    // Atlas transactions keep payment and item delivery together.
    const session = db.client.startSession();

    try {
      await session.withTransaction(async () => {
        let paid;

        if (currency === "candy") {
          // Deduct candy and grant packs in the same document update.
          paid = await inventory.updateOne(
            {
              userId: user.id,
              "items.groot_candy": { $gte: total }
            },
            {
              $inc: {
                "items.groot_candy": -total,
                "items.halloween_pack": quantity
              }
            },
            { session }
          );
        } else {
          const balance = await balances.findOne(
            { userId: user.id },
            { session }
          );

          // Support both old and current chip field names.
          const field =
            currency === "coins"
              ? "coins"
              : balance?.ultronChips != null
                ? "ultronChips"
                : balance?.ultronchips != null
                  ? "ultronchips"
                  : "ultronChips";

          paid = await balances.updateOne(
            {
              userId: user.id,
              [field]: { $gte: total }
            },
            {
              $inc: {
                [field]: -total
              }
            },
            { session }
          );

          if (paid.modifiedCount) {
            await inventory.updateOne(
              { userId: user.id },
              {
                $inc: {
                  [`items.${item}`]: quantity
                }
              },
              {
                upsert: true,
                session
              }
            );
          }
        }

        if (!paid.modifiedCount) {
          const error = new Error("Insufficient funds");
          error.code = "INSUFFICIENT_FUNDS";
          throw error;
        }

        if (item === "trade_voucher") {
          const now = Date.now();
          const duration =
            quantity * 30 * 24 * 60 * 60 * 1000;

          // Each voucher adds 30 days to existing active access.
          await passes.updateOne(
            { userId: user.id },
            [
              {
                $set: {
                  userId: user.id,
                  expiresAt: {
                    $add: [
                      {
                        $max: [
                          {
                            $ifNull: ["$expiresAt", now]
                          },
                          now
                        ]
                      },
                      duration
                    ]
                  }
                }
              }
            ],
            {
              upsert: true,
              session
            }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    const embed = new EmbedBuilder()
      .setColor(
        currency === "candy" ? 0xff8c00 : 0x00ff99
      )
      .setTitle("🛒 Purchase Successful")
      .setDescription(
        `Purchased **${quantity.toLocaleString()} × ` +
        `${itemName(item)}**`
      )
      .addFields(
        {
          name: "💸 Total Cost",
          value:
            `${total.toLocaleString()} ` +
            `${currencies[currency]}`,
          inline: true
        },
        {
          name: "📦 Added To",
          value: "Your inventory",
          inline: true
        }
      )
      .setFooter({ text: "GrootX Store" })
      .setTimestamp();

    return await reply({ embeds: [embed] });
  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      return reply(
        "❌ You don't have enough currency for that quantity. " +
        "Check your balance and the store prices."
      );
    }

    console.error("[BUY]", error);

    return reply(
      "❌ Could not complete your purchase. Please try again."
    );
  }
}

module.exports = {
  name: "buy",

  data: new SlashCommandBuilder()
    .setName("buy")
    .setDescription(
      "Buy store items with coins, chips, or candy."
    )
    .addStringOption(option =>
      option
        .setName("item")
        .setDescription("Item to purchase")
        .setRequired(true)
        .addChoices(
          ...Object.keys(storeItems).map(item => ({
            name: itemName(item),
            value: item
          }))
        )
    )
    .addIntegerOption(option =>
      option
        .setName("quantity")
        .setDescription("How many to buy (default: 1)")
        .setMinValue(1)
        .setMaxValue(1000)
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};