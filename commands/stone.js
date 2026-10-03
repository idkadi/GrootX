const cards = require('../data/cards');
const season1Cards = require('../data/season1');
const renderCard = require('../utils/renderCard');
const connectDB = require('../database');

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const STONES = [
  'power',
  'time',
  'mind',
  'reality',
  'space',
  'soul'
];

const activeUsers = new Set();

const data = new SlashCommandBuilder()
  .setName('stone')
  .setDescription('Activate a stone or transform an owned card.')
  .addStringOption(option =>
    option
      .setName('stone')
      .setDescription('Stone to use')
      .setRequired(true)
      .addChoices(
        ...STONES.map(name => ({
          name,
          value: name
        }))
      )
  )
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription('Owned card code for Reality Stone')
  );

function seasonOf(card) {
  const value = String(card.season ?? 0).toLowerCase();

  if (
    ['1', 's1', 'season1', 'season 1'].includes(value)
  ) {
    return 1;
  }

  if (
    ['0', 's0', 'season0', 'season 0'].includes(value)
  ) {
    return 0;
  }

  throw new Error(
    'Unrecognised card season; no stone was used.'
  );
}

function eventOf(card) {
  return String(card.event || '')
    .trim()
    .toLowerCase();
}

function label(card, season) {
  return eventOf(card)
    ? `🎃 ${card.show || card.appearance || card.event}`
    : `S${season}`;
}

function documentFrom(result) {
  // Supports MongoDB drivers returning either a document
  // or a ModifyResult containing the document.
  return result &&
    Object.prototype.hasOwnProperty.call(result, 'value')
    ? result.value
    : result;
}

async function run(source, args = []) {
  const slash =
    typeof source.isChatInputCommand === 'function' &&
    source.isChatInputCommand();

  const userId = slash
    ? source.user.id
    : source.author.id;

  const reply = payload =>
    slash
      ? source.editReply(payload)
      : source.reply(payload);

  // Acknowledge slash commands before DB/image work.
  if (slash && !source.deferred && !source.replied) {
    await source.deferReply();
  }

  const stone = String(
    slash
      ? source.options.getString('stone')
      : args[0] || ''
  ).toLowerCase();

  const code = String(
    (
      slash
        ? source.options.getString('code')
        : args[1]
    ) || ''
  )
    .trim()
    .toLowerCase();

  if (!STONES.includes(stone)) {
    return reply(
      '❌ Use `stone power`, `stone time`, ' +
      '`stone mind`, or `stone reality <code>`.'
    );
  }

  if (['space', 'soul'].includes(stone)) {
    return reply(
      '🕒 This stone power will be added later.'
    );
  }

  if (stone === 'reality' && !code) {
    return reply(
      '❌ Provide your owned card code: ' +
      '`stone reality <code>`.'
    );
  }

  if (activeUsers.has(userId)) {
    return reply(
      '⏳ Your previous stone command is still processing.'
    );
  }

  activeUsers.add(userId);

  let session;
  let result;

  try {
    const db = await connectDB();

    // Fail safely if the DB wrapper hides its client.
    if (!db.client?.startSession) {
      throw new Error(
        'Database wrapper must expose db.client ' +
        'for safe stone transactions.'
      );
    }

    session = db.client.startSession();

    const inventory = db.collection('inventory');
    const collections = db.collection('collections');
    const effects = db.collection('stoneeffects');
    const serials = db.collection('serials');

    const key = `items.${stone}_stone`;

    await session.withTransaction(async () => {
      result = null;

      // Conditional spend prevents negative balances.
      // Any later failure aborts this transaction.
      const spent = await inventory.updateOne(
        {
          userId,
          [key]: { $gte: 1 }
        },
        {
          $inc: { [key]: -1 }
        },
        { session }
      );

      if (!spent.modifiedCount) {
        throw new Error(
          `You don't have a ${stone} stone.`
        );
      }

      if (stone !== 'reality') {
        const current = await effects.findOne(
          { userId },
          { session }
        );

        const now = Date.now();

        const values =
          stone === 'mind'
            ? {
                mindDropsRemaining:
                  Math.max(
                    0,
                    Number(current?.mindDropsRemaining) || 0
                  ) + 3
              }
            : stone === 'power'
              ? {
                  powerUntil:
                    Math.max(
                      now,
                      Number(current?.powerUntil) || 0
                    ) + 3 * 60 * 60 * 1000
                }
              : {
                  timeUntil:
                    Math.max(
                      now,
                      Number(current?.timeUntil) || 0
                    ) + 30 * 60 * 1000
                };

        await effects.updateOne(
          { userId },
          {
            $set: {
              userId,
              ...values
            }
          },
          {
            upsert: true,
            session
          }
        );

        result =
          stone === 'mind'
            ? '🧠 **Mind Stone activated!** ' +
              'Added **3 drops with 4 cards**.'
            : stone === 'power'
              ? '💪 **Power Stone activated!** ' +
                'Added **3 hours** of drop priority power.'
              : '⏳ **Time Stone activated!** ' +
                'Added **30 minutes** of 2× faster ' +
                'drop and grab cooldowns.';

        return;
      }

      const owned = await collections.findOne(
        { userId, code },
        { session }
      );

      if (!owned) {
        throw new Error("You don't own that card.");
      }

      const season = seasonOf(owned);

      const pool =
        season === 1
          ? season1Cards
          : cards;

      const matches = pool.filter(
        card =>
          String(card.id) === String(owned.cardId)
      );

      const old = owned.event
        ? matches.find(
            card =>
              eventOf(card) === eventOf(owned)
          )
        : matches.length === 1
          ? matches[0]
          : matches.find(card => !eventOf(card));

      if (!old) {
        throw new Error(
          'Card data not found; no stone was used.'
        );
      }

      const event =
        eventOf(old) || eventOf(owned);

      const tier = String(old.tier)
        .trim()
        .toLowerCase();

      // Same season, same tier, same event.
      // Ordinary cards cannot become event cards.
      // Halloween 26 stays Halloween 26.
      const candidates = pool.filter(
        card =>
          String(card.id) !== String(old.id) &&
          eventOf(card) === event &&
          String(card.tier)
            .trim()
            .toLowerCase() === tier
      );

      if (!candidates.length) {
        throw new Error(
          'No other card of the same tier in this ' +
          'season/event; no stone was used.'
        );
      }

      const next =
        candidates[
          Math.floor(
            Math.random() * candidates.length
          )
        ];

      // Match S0 counters including legacy documents
      // that have no season field.
      const query =
        season === 1
          ? {
              cardId: next.id,
              season: 1
            }
          : {
              cardId: next.id,
              season: {
                $nin: [1, '1', 's1', 'S1']
              }
            };

      const counter = documentFrom(
        await serials.findOneAndUpdate(
          query,
          {
            $inc: { serial: 1 },
            $setOnInsert: { season }
          },
          {
            upsert: true,
            returnDocument: 'after',
            session
          }
        )
      );

      if (
        !counter ||
        !Number.isFinite(counter.serial)
      ) {
        throw new Error(
          'Unable to allocate a card serial.'
        );
      }

      const newOwned = {
        ...owned,
        cardId: next.id,
        serial: counter.serial,
        season
      };

      if (event) {
        newOwned.event =
          next.event || old.event || owned.event;
      } else {
        delete newOwned.event;
      }

      // Use the same renderer as view for both cards.
      // This preserves season formatting and uses
      // equipped frames or the event-specific frame.
      // Rendering failures abort the stone spend.
      const oldBuffer = await renderCard(
        {
          ...old,
          season
        },
        owned.serial,
        {
          ...owned,
          season,
          ...(
            event
              ? {
                  event: old.event || owned.event
                }
              : {}
          )
        }
      );

      const newBuffer = await renderCard(
        {
          ...next,
          season
        },
        counter.serial,
        newOwned
      );

      const values = {
        cardId: next.id,
        serial: counter.serial,
        season
      };

      if (event) {
        values.event = newOwned.event;
      }

      const update = {
        $set: values
      };

      if (!event) {
        update.$unset = { event: '' };
      }

      // Preserve the card code, tag, favourite,
      // frame and all unrelated ownership fields.
      const changed = await collections.updateOne(
        {
          _id: owned._id,
          userId
        },
        update,
        { session }
      );

      if (!changed.matchedCount) {
        throw new Error(
          'Card ownership changed; no stone was used.'
        );
      }

      const embed = new EmbedBuilder()
        .setColor(0x8a2be2)
        .setTitle('🌀 Reality Stone Used')
        .setDescription(
          `Reality rewrote card \`${code}\`.\n\n` +
          `**Before:** ${old.name} #${owned.serial}\n` +
          `**After:** ${next.name} #${counter.serial}\n\n` +
          `**${old.tier}** • ${label(next, season)}`
        )
        .setThumbnail('attachment://before.png')
        .setImage('attachment://after.png')
        .setFooter({
          text: 'Thumbnail = before • Main image = after'
        })
        .setTimestamp();

      result = {
        embeds: [embed],
        files: [
          new AttachmentBuilder(oldBuffer, {
            name: 'before.png'
          }),
          new AttachmentBuilder(newBuffer, {
            name: 'after.png'
          })
        ]
      };
    });
  } catch (error) {
    console.error('[STONE]', error);

    return await reply(
      `❌ ${error.message || 'Stone activation failed.'}`
    ).catch(() => {});
  } finally {
    if (session) {
      await session.endSession();
    }

    activeUsers.delete(userId);
  }

  // Sending errors must never repeat a committed
  // transformation or charge another stone.
  return reply(result).catch(error => {
    console.error(
      '[STONE] Result delivery failed after commit:',
      error
    );
  });
}

module.exports = {
  name: 'stone',

  data,
  slashData: data,

  execute: run,

  executeSlash: interaction => run(interaction),
  slashExecute: interaction => run(interaction)
};