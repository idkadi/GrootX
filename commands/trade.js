const {
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

// Prevent overlapping trade starts within this bot process.
const starting = new Set();

function passIsActive(pass) {
  if (!pass) return false;

  let expiry;

  if (pass.expiresAt instanceof Date) {
    expiry = pass.expiresAt.getTime();
  } else if (typeof pass.expiresAt === 'number') {
    expiry = pass.expiresAt;
  } else if (/^\d+$/.test(String(pass.expiresAt || ''))) {
    expiry = Number(pass.expiresAt);
  } else {
    expiry = Date.parse(pass.expiresAt);
  }

  return Number.isFinite(expiry) && expiry > Date.now();
}

async function execute(source, args = []) {
  const slash =
    typeof source.isChatInputCommand === 'function' &&
    source.isChatInputCommand();

  const author = slash ? source.user : source.author;

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

  let locked = false;
  let target;

  try {
    if (slash) {
      target = source.options.getUser('user', true);
    } else {
      // Avoid selecting GrootX itself from a command mention.
      const requested = String(args[0] || '')
        .replace(/^<@!?|>$/g, '');

      if (/^\d{17,20}$/.test(requested)) {
        target =
          source.mentions.users.get(requested) ||
          await source.client.users
            .fetch(requested)
            .catch(() => null);
      } else {
        target = source.mentions.users.find(
          user => user.id !== source.client.user.id
        );
      }
    }

    if (!target) {
      return await reply(
        '❌ Use `!trade @user`, mention GrootX with ' +
        '`trade @user`, or `/trade user:@user`.'
      );
    }

    if (target.id === author.id) {
      return await reply(
        '❌ You cannot trade with yourself.'
      );
    }

    if (target.bot) {
      return await reply(
        '❌ You cannot trade with a bot.'
      );
    }

    if (
      starting.has(author.id) ||
      starting.has(target.id)
    ) {
      return await reply(
        '⏳ A trade is already being started for one of you.'
      );
    }

    starting.add(author.id);
    starting.add(target.id);
    locked = true;

    const db = await connectDB();

    const trades = db.collection('trades');
    const passes = db.collection('tradePasses');

    const [authorPass, targetPass] = await Promise.all([
      passes.findOne({ userId: author.id }),
      passes.findOne({ userId: target.id })
    ]);

    if (!passIsActive(authorPass)) {
      return await reply(
        '❌ You need an active Trade Voucher.'
      );
    }

    if (!passIsActive(targetPass)) {
      return await reply(
        '❌ That user needs an active Trade Voucher.'
      );
    }

    const existingTrade = await trades.findOne({
      users: {
        $in: [author.id, target.id]
      }
    });

    if (existingTrade) {
      return await reply(
        '❌ One of you is already in a trade. ' +
        'Finish or cancel it first.'
      );
    }

    const tradeId = `${author.id}_${target.id}`;

    // Preserve the format used by the existing offer commands.
    await trades.insertOne({
      tradeId,

      users: [
        author.id,
        target.id
      ],

      offers: {
        [author.id]: {
          cards: [],
          coins: 0,
          items: {}
        },

        [target.id]: {
          cards: [],
          coins: 0,
          items: {}
        }
      },

      confirmed: {
        [author.id]: false,
        [target.id]: false
      },

      createdAt: new Date()
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🤝 Trade Started')
      .setDescription(
        `<@${author.id}> ↔ <@${target.id}>\n\n` +
        'Build your offers, review them, then both confirm.'
      )
      .addFields({
        name: 'Trade commands',
        value:
          '`!addcard <code>`\n' +
          '`!addcoins <amount>`\n' +
          '`!additem <item> <amount>`\n' +
          '`!confirmtrade`\n' +
          '`!canceltrade`'
      })
      .setFooter({
        text:
          'Offers are handled by your addcard, addcoins, ' +
          'additem, and confirmtrade commands.'
      });

    try {
      return await reply({
        embeds: [embed]
      });
    } catch (error) {
      // Keep the saved trade intact if Discord delivery fails.
      console.error(
        '[TRADE] Started but reply failed:',
        error
      );
    }
  } catch (error) {
    console.error('[TRADE]', error);

    await reply(
      '❌ Could not start the trade. Please try again.'
    ).catch(() => {});
  } finally {
    if (locked) {
      starting.delete(author.id);
      starting.delete(target.id);
    }
  }
}

module.exports = {
  name: 'trade',

  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Start a trade with another user.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Who to trade with')
        .setRequired(true)
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};