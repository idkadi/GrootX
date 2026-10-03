const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require('discord.js');

const cards = require('../data/cards');
const season1 = require('../data/season1');
const connectDB = require('../database');
const renderCard = require('../utils/renderCard');

const {
  removeCardFromAlbums
} = require('../utils/albumUtils');

const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Give an owned card to another user')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('Recipient')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription('Owned card code')
      .setRequired(true)
  );

function resolveCard(owned) {
  const value = String(owned.season ?? 0)
    .trim()
    .toLowerCase();

  const season = [
    '1',
    's1',
    'season1',
    'season 1'
  ].includes(value)
    ? 1
    : [
        '0',
        's0',
        'season0',
        'season 0'
      ].includes(value)
      ? 0
      : null;

  if (season === null) {
    throw new Error('Unrecognised card season.');
  }

  const pool = season === 1 ? season1 : cards;

  const matches = pool.filter(
    card =>
      String(card.id) === String(owned.cardId)
  );

  const event = String(owned.event || '')
    .trim()
    .toLowerCase();

  const info = event
    ? matches.find(
        card =>
          String(card.event || '')
            .trim()
            .toLowerCase() === event
      )
    : matches.length === 1
      ? matches[0]
      : matches.find(card => !card.event);

  if (!info) {
    throw new Error(
      'Card data not found for this season/event.'
    );
  }

  const eventId = info.event || owned.event;

  return {
    season,

    info: {
      ...info,
      season,
      ...(eventId ? { event: eventId } : {})
    },

    owned: {
      ...owned,
      season,
      ...(eventId ? { event: eventId } : {})
    },

    label: eventId
      ? `🎃 ${info.show || info.appearance || eventId}`
      : `Season ${season}`
  };
}

// Transfer only the exact card shown in the preview.
// Ownership, favorite state and card details are checked
// atomically when the giver confirms.
function transferFilter(card, giverId) {
  const filter = {
    _id: card._id,
    userId: giverId,
    favorite: { $ne: true }
  };

  for (const field of [
    'code',
    'cardId',
    'season',
    'event',
    'serial',
    'frameId'
  ]) {
    filter[field] =
      Object.prototype.hasOwnProperty.call(card, field)
        ? {
            $eq: card[field],
            $exists: true
          }
        : {
            $exists: false
          };
  }

  return filter;
}

async function runGive({
  message,
  interaction,
  target,
  code
}) {
  const slash = !!interaction;

  const author = slash
    ? interaction.user
    : message.author;

  const reply = payload =>
    slash
      ? interaction.editReply(payload)
      : message.reply(payload);

  // Acknowledge before database or rendering work.
  if (
    slash &&
    !interaction.deferred &&
    !interaction.replied
  ) {
    await interaction.deferReply();
  }

  code = String(code || '')
    .trim()
    .toLowerCase();

  if (!target) {
    return reply({
      content:
        '❌ Choose a recipient: `give @user <code>`.'
    });
  }

  if (!code) {
    return reply({
      content: '❌ Provide an owned card code.'
    });
  }

  if (target.id === author.id) {
    return reply({
      content: '❌ You cannot give cards to yourself.'
    });
  }

  if (target.bot) {
    return reply({
      content: '❌ You cannot give cards to bots.'
    });
  }

  try {
    const db = await connectDB();

    const collection = db.collection('collections');

    const card = await collection.findOne({
      userId: author.id,
      code
    });

    if (!card) {
      return reply({
        content: '❌ You do not own this card.'
      });
    }

    if (card.favorite) {
      return reply({
        content:
          '⭐ Unfavorite this card before giving it.'
      });
    }

    const resolved = resolveCard(card);

    // Canonical season/event and equipped frame are
    // passed to the existing shared renderer.
    const buffer = await renderCard(
      resolved.info,
      card.serial,
      resolved.owned
    );

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle('🎁 Confirm Gift')
      .setDescription(
        `**${resolved.info.name}**\n` +
        `\`${code}\` • #${card.serial}\n` +
        `${resolved.label}\n\n` +
        `Recipient: <@${target.id}>`
      )
      .setImage('attachment://givecard.png')
      .setFooter({
        text: 'Confirm within 30 seconds.'
      })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('give_confirm')
          .setLabel('Confirm')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId('give_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const payload = {
      embeds: [embed],

      files: [
        new AttachmentBuilder(buffer, {
          name: 'givecard.png'
        })
      ],

      components: [row],

      allowedMentions: {
        parse: []
      }
    };

    const sent = await reply(payload);

    const confirmation = slash
      ? await interaction.fetchReply()
      : sent;

    const collector =
      confirmation.createMessageComponentCollector({
        time: 30000
      });

    let handling = false;
    let transferred = false;

    const clear = content =>
      confirmation.edit({
        content,
        embeds: [],
        attachments: [],
        components: [],
        allowedMentions: {
          parse: []
        }
      });

    collector.on('collect', async button => {
      try {
        if (
          ![
            'give_confirm',
            'give_cancel'
          ].includes(button.customId)
        ) {
          return;
        }

        if (button.user.id !== author.id) {
          return await button.reply({
            content:
              '❌ Only the giver can confirm this gift.',
            ephemeral: true
          });
        }

        if (handling) {
          return await button.deferUpdate();
        }

        handling = true;

        // Acknowledge before database operations.
        await button.deferUpdate();

        collector.stop(
          button.customId === 'give_cancel'
            ? 'cancelled'
            : 'confirmed'
        );

        if (button.customId === 'give_cancel') {
          return await clear('❌ Gift cancelled.');
        }

        const changed = await collection.updateOne(
          transferFilter(card, author.id),
          {
            $set: {
              userId: target.id,
              favorite: false
            },

            // Tags belong to the giver.
            $unset: {
              tag: ''
            }
          }
        );

        if (changed.modifiedCount !== 1) {
          return await clear(
            '❌ The card changed, was favorited, ' +
            'or is no longer yours. Run give again.'
          );
        }

        transferred = true;

        let albumNotice = '';

        try {
          await removeCardFromAlbums(
            db,
            author.id,
            code
          );
        } catch (error) {
          console.error(
            '[GIVE] Album cleanup failed:',
            error
          );

          albumNotice =
            '\n⚠️ Gift completed, but removal ' +
            'from your albums needs retrying.';
        }

        // Reuse the verified preview. The atomic check
        // ensures its card, serial and frame match the
        // card that was transferred.
        const success = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('✅ Card Given')
          .setDescription(
            `<@${author.id}> gave ` +
            `**${resolved.info.name}** ` +
            `to <@${target.id}>\n\n` +
            `\`${code}\` • #${card.serial}\n` +
            `${resolved.label}${albumNotice}`
          )
          .setImage('attachment://given-card.png')
          .setTimestamp();

        await confirmation.edit({
          content: '',
          embeds: [success],
          components: [],
          attachments: [],

          files: [
            new AttachmentBuilder(buffer, {
              name: 'given-card.png'
            })
          ],

          allowedMentions: {
            parse: []
          }
        });
      } catch (error) {
        console.error(
          '[GIVE] Confirmation failed:',
          error
        );

        // A display failure must not be reported as
        // a failed transfer after ownership changed.
        if (transferred) {
          await clear(
            `✅ Card \`${code}\` was given ` +
            `to <@${target.id}>. ` +
            'The confirmation display could not ' +
            'be completed.'
          ).catch(() => {});
        } else {
          await clear(
            '❌ Gift could not be completed. ' +
            'Check your collection before retrying.'
          ).catch(() => {});
        }

        collector.stop('error');
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time' && !handling) {
        clear(
          '⌛ Gift confirmation expired.'
        ).catch(() => {});
      }
    });
  } catch (error) {
    console.error('[GIVE]', error);

    return reply({
      content:
        '❌ Could not prepare the gift: ' +
        (error.message || 'Unknown error')
    }).catch(() => {});
  }
}

async function executeSlash(interaction) {
  return runGive({
    interaction,
    target: interaction.options.getUser('user'),
    code: interaction.options.getString('code')
  });
}

module.exports = {
  name: 'give',
  aliases: ['gift'],

  data,
  slashData: data,

  async execute(source, args = []) {
    if (
      typeof source.isChatInputCommand === 'function' &&
      source.isChatInputCommand()
    ) {
      return executeSlash(source);
    }

    // Ignore GrootX's mention for:
    // @GrootX give @user <code>
    const mention = args.find(
      arg =>
        /^<@!?\d+>$/.test(arg) &&
        arg.replace(/\D/g, '') !== source.client.user.id
    );

    const target = mention
      ? source.mentions.users.get(
          mention.replace(/\D/g, '')
        )
      : null;

    return runGive({
      message: source,
      target,
      code: args.find(
        arg => !arg.startsWith('<@')
      )
    });
  },

  executeSlash,
  slashExecute: executeSlash
};