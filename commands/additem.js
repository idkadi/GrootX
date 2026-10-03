const {
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

const ALIASES = {
  candy: 'groot_candy',
  candies: 'groot_candy',
  groot_candies: 'groot_candy',

  halloween: 'halloween_pack',
  halloween_26: 'halloween_pack',
  halloween_26_pack: 'halloween_pack',
  halloween_pack_26: 'halloween_pack'
};

const EMOJIS = {
  groot_candy: '<:grootcandy:1555950722816675870>',
  halloween_pack: '<:halloweenpack:1555956375979425963>'
};

function formatName(item) {
  return item
    .split('_')
    .map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');
}

async function execute(source, args = []) {
  const slash =
    typeof source.isChatInputCommand === 'function' &&
    source.isChatInputCommand();

  const userId = (slash ? source.user : source.author).id;

  const reply = payload => {
    if (typeof payload === 'string') {
      payload = { content: payload };
    }

    payload.allowedMentions = {
      parse: [],
      repliedUser: false
    };

    return slash
      ? source.editReply(payload)
      : source.reply(payload);
  };

  if (slash && !source.deferred && !source.replied) {
    await source.deferReply();
  }

  try {
    // Supports spaced names: !additem groot candy 100
    const rawItem = slash
      ? source.options.getString('item', true)
      : args.slice(0, -1).join(' ');

    const rawAmount = slash
      ? String(source.options.getInteger('amount', true))
      : String(args.at(-1) ?? '');

    if (!rawItem || !/^\d+$/.test(rawAmount)) {
      return await reply(
        '❌ Use `!additem <item> <amount>` or ' +
        '`/additem item:candy amount:100`.\n' +
        'Amount must be a whole number; use **0** to remove ' +
        'the item from your offer.'
      );
    }

    const amount = Number(rawAmount);

    if (!Number.isSafeInteger(amount) || amount < 0) {
      return await reply(
        '❌ Enter a valid non-negative whole number.'
      );
    }

    const normalized = String(rawItem)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    const item = Object.hasOwn(ALIASES, normalized)
      ? ALIASES[normalized]
      : normalized;

    if (
      !/^[a-z][a-z0-9_]{0,99}$/.test(item) ||
      ['__proto__', 'prototype', 'constructor'].includes(item)
    ) {
      return await reply('❌ Invalid inventory item name.');
    }

    const db = await connectDB();
    const trades = db.collection('trades');

    const editable = {
      $nin: [
        'processing',
        'completing',
        'completed',
        'cancelled',
        'expired'
      ]
    };

    const trade = await trades.findOne({
      users: userId,
      status: editable
    });

    if (!trade) {
      return await reply(
        '❌ You are not in an editable active trade.'
      );
    }

    if (
      !Array.isArray(trade.users) ||
      trade.users.length !== 2 ||
      new Set(trade.users).size !== 2 ||
      !trade.offers?.[userId]
    ) {
      return await reply(
        '❌ Invalid trade data. Cancel this trade and start again.'
      );
    }

    const offeredItems = trade.offers[userId].items || {};

    if (amount === 0) {
      if (!Object.hasOwn(offeredItems, item)) {
        return await reply(
          'ℹ️ This item is not in your offer.'
        );
      }
    } else {
      const inventory = await db
        .collection('inventory')
        .findOne({ userId });

      const items = inventory?.items || {};

      // Supports every numeric inventory stack, including future items.
      if (!Object.hasOwn(items, item)) {
        return await reply(
          '❌ This item is not in your inventory. ' +
          'Use its inventory name, such as ' +
          '`groot_candy` or `halloween_pack`.'
        );
      }

      const owned = items[item];

      if (
        typeof owned !== 'number' ||
        !Number.isSafeInteger(owned) ||
        owned < 0
      ) {
        return await reply(
          '❌ This inventory entry is not a valid stack ' +
          'of tradeable items.'
        );
      }

      if (owned < amount) {
        return await reply(
          `❌ You only have **${owned} ${formatName(item)}**.`
        );
      }
    }

    const set = {};

    for (const id of trade.users) {
      set[`confirmed.${id}`] = false;
    }

    const itemPath = `offers.${userId}.items.${item}`;

    const update = {
      $set: set,
      $inc: {
        revision: 1
      }
    };

    if (amount === 0) {
      update.$unset = {
        [itemPath]: ''
      };
    } else {
      // Set the total offered quantity rather than adding to it.
      set[itemPath] = amount;
    }

    // Update only this item and confirmations, preserving other offers.
    const result = await trades.updateOne(
      {
        _id: trade._id,
        users: userId,
        status: editable
      },
      update
    );

    if (!result.modifiedCount) {
      return await reply(
        'ℹ️ Your trade changed or closed. Check the current offer.'
      );
    }

    const description = amount === 0
      ? `${EMOJIS[item] || '📦'} **${formatName(item)}**\n` +
        'Removed from your offer.'
      : `${EMOJIS[item] || '📦'} **${formatName(item)}** ` +
        `× **${amount}**\n` +
        'This is your total offered quantity for this item.';

    const embed = new EmbedBuilder()
      .setColor(amount === 0 ? 0xff9900 : 0x57f287)
      .setTitle(
        amount === 0
          ? '🤝 Item Removed from Trade'
          : '🤝 Item Offer Updated'
      )
      .setDescription(description)
      .setFooter({
        text:
          'Both confirmations reset • ' +
          'Items transfer only when the trade completes'
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('[ADDITEM]', error);

    await reply(
      '❌ Could not update your item offer. ' +
      'Check it before trying again.'
    ).catch(() => {});
  }
}

module.exports = {
  name: 'additem',

  data: new SlashCommandBuilder()
    .setName('additem')
    .setDescription(
      'Offer candy, packs, or any stackable inventory item in a trade.'
    )
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription(
          'Inventory item name, e.g. candy, halloween pack, or power_shard'
        )
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription(
          'Total quantity to offer; 0 removes this item'
        )
        .setMinValue(0)
        .setRequired(true)
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};