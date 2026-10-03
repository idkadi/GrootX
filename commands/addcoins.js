const {
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

const COIN = '<:grootcoin:1504742213110861834>';

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
    const rawAmount = slash
      ? String(source.options.getInteger('amount', true))
      : String(args[0] ?? '');

    const amount = Number(rawAmount);

    if (
      !/^\d+$/.test(rawAmount) ||
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      (!slash && args.length !== 1)
    ) {
      return await reply(
        '❌ Use `!addcoins <amount>` or `/addcoins amount:500`.\n' +
        'Enter a whole number; use **0** to clear your coin offer.'
      );
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
      trade.users.some(id =>
        !/^\d{17,20}$/.test(String(id))
      ) ||
      !trade.offers?.[userId]
    ) {
      return await reply(
        '❌ Invalid trade data. Cancel this trade and start again.'
      );
    }

    if (amount > 0) {
      const balanceDoc = await db
        .collection('balances')
        .findOne({ userId });

      const balance = balanceDoc?.coins ?? 0;

      if (
        !Number.isSafeInteger(balance) ||
        balance < 0
      ) {
        return await reply(
          '❌ Your coin balance is invalid. ' +
          'Please report this to the bot owner.'
        );
      }

      if (balance < amount) {
        return await reply(
          `❌ You only have ${COIN} ` +
          `**${balance.toLocaleString('en-US')} coins**.`
        );
      }
    }

    const set = {
      [`offers.${userId}.coins`]: amount
    };

    for (const id of trade.users) {
      set[`confirmed.${id}`] = false;
    }

    // Update only coins and confirmations.
    // Other card and item offers remain intact.
    const result = await trades.updateOne(
      {
        _id: trade._id,
        users: userId,
        status: editable
      },
      {
        $set: set,
        $inc: {
          revision: 1
        }
      }
    );

    if (!result.modifiedCount) {
      return await reply(
        'ℹ️ The trade changed or closed. Check your current offer.'
      );
    }

    const embed = new EmbedBuilder()
      .setColor(amount === 0 ? 0xff9900 : 0x57f287)
      .setTitle(
        amount === 0
          ? '🤝 Coin Offer Cleared'
          : '🤝 Coin Offer Updated'
      )
      .setDescription(
        `${COIN} **${amount.toLocaleString('en-US')} coins**\n` +
        'This is your total coin offer.'
      )
      .setFooter({
        text:
          'Both confirmations reset • ' +
          'Coins transfer only when the trade completes'
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('[ADDCOINS]', error);

    await reply(
      '❌ Could not update your coin offer. ' +
      'Check it before trying again.'
    ).catch(() => {});
  }
}

module.exports = {
  name: 'addcoins',

  data: new SlashCommandBuilder()
    .setName('addcoins')
    .setDescription(
      'Set the total coins offered in your active trade.'
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription(
          'Total coins to offer; 0 clears your coin offer'
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