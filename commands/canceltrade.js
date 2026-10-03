const {
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

async function execute(source) {
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

  let removed = false;

  try {
    const db = await connectDB();

    // Check membership and status in one atomic deletion.
    // Compatible with the patched transactional confirmtrade.
    const result = await db
      .collection('trades')
      .findOneAndDelete({
        users: userId,

        status: {
          $nin: [
            'processing',
            'completing',
            'completed',
            'cancelled',
            'expired'
          ]
        }
      });

    // Support both MongoDB driver return formats.
    const trade =
      result &&
      Object.prototype.hasOwnProperty.call(result, 'value')
        ? result.value
        : result;

    if (!trade) {
      return await reply(
        'ℹ️ No cancellable trade was found. ' +
        'It may already have completed or been cancelled.'
      );
    }

    removed = true;

    const otherUser = Array.isArray(trade.users)
      ? trade.users.find(id => id !== userId)
      : null;

    const participants =
      otherUser &&
      /^\d{17,20}$/.test(String(otherUser))
        ? `<@${userId}> ↔ <@${otherUser}>\n\n`
        : '';

    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle('❌ Trade Cancelled')
      .setDescription(
        participants +
        'The offers have been cleared. ' +
        'No cards, coins, or items were transferred by this trade.'
      )
      .setFooter({
        text:
          'You can start a new trade with /trade ' +
          'or your normal trade command.'
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error('[CANCELTRADE]', error);

    await reply(
      removed
        ? '✅ Your trade was cancelled, but the confirmation ' +
          'message could not be displayed.'
        : '❌ Could not confirm cancellation. ' +
          'Check your trade status before trying again.'
    ).catch(() => {});
  }
}

module.exports = {
  name: 'canceltrade',

  aliases: ['ct'],

  data: new SlashCommandBuilder()
    .setName('canceltrade')
    .setDescription(
      'Cancel your active trade before it completes.'
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};