const {
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

const SEASON_EMOJIS = {
  0: '<:Season0:1555956910560256082>',
  1: '<:Season1:1555956879576793130>'
};

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
    const code = String(
      slash
        ? source.options.getString('code', true)
        : args[0] || ''
    ).trim().toLowerCase();

    if (!code || (!slash && args.length > 1)) {
      return await reply(
        '❌ Use `!addcard <code>` or `/addcard code:<code>`. ' +
        'Add one card per command.'
      );
    }

    // Supports older codes as well as current six-character codes.
    if (!/^[a-z0-9]{1,64}$/.test(code)) {
      return await reply('❌ Enter a valid card code.');
    }

    const db = await connectDB();

    const trades = db.collection('trades');
    const collections = db.collection('collections');

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
      !trade.offers?.[userId] ||
      !Array.isArray(trade.offers[userId].cards)
    ) {
      return await reply(
        '❌ This trade has invalid data. ' +
        'Cancel it and start a new trade.'
      );
    }

    // No season, rarity, event, or catalog restrictions.
    const card = await collections.findOne({
      userId,
      code
    });

    if (!card) {
      return await reply('❌ You do not own this card.');
    }

    if (card.favorite) {
      return await reply(
        '⭐ Unfavorite this card before adding it to a trade.'
      );
    }

    const cardPath = `offers.${userId}.cards`;

    if (trade.offers[userId].cards.includes(code)) {
      return await reply(
        'ℹ️ This card is already in your offer.'
      );
    }

    const confirmations = {};

    for (const id of trade.users) {
      confirmations[`confirmed.${id}`] = false;
    }

    // Preserve concurrent changes to other cards, items, and coins.
    const result = await trades.updateOne(
      {
        _id: trade._id,
        users: userId,
        status: editable,
        [cardPath]: { $ne: code }
      },
      {
        $addToSet: {
          [cardPath]: code
        },
        $set: confirmations,
        $inc: {
          revision: 1
        }
      }
    );

    if (!result.modifiedCount) {
      return await reply(
        'ℹ️ The trade changed or this card was already added. ' +
        'Check your current offer.'
      );
    }

    const rawSeason = String(
      card.season ?? card.cardSeason ?? 0
    ).trim();

    const match = rawSeason.match(
      /^(?:s|season\s*)?(\d+)$/i
    );

    const season = match ? Number(match[1]) : null;

    const seasonText = season === null
      ? '🎴 Season unspecified'
      : `${SEASON_EMOJIS[season] || '🎴'} Season ${season}`;

    const event = card.event
      ? String(card.event)
          .replace(/[`*_~|]/g, '')
          .slice(0, 100)
      : '';

    const eventText = event
      ? `\n🎃 **${
          /halloween/i.test(event)
            ? 'Halloween 26'
            : event
        }**`
      : '';

    const serialText = card.serial != null
      ? ` • #${card.serial}`
      : '';

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🤝 Card Added to Trade')
      .setDescription(
        `\`${code}\`${serialText}\n` +
        seasonText +
        eventText
      )
      .setFooter({
        text:
          'Both confirmations reset • ' +
          'Review the updated offers before confirming'
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('[ADDCARD]', error);

    await reply(
      '❌ Could not update your trade offer. ' +
      'Check it before trying again.'
    ).catch(() => {});
  }
}

module.exports = {
  name: 'addcard',

  data: new SlashCommandBuilder()
    .setName('addcard')
    .setDescription(
      'Add an owned card from any season or event to your trade offer.'
    )
    .addStringOption(option =>
      option
        .setName('code')
        .setDescription('Your owned card code')
        .setRequired(true)
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};