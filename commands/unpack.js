const { randomInt } = require('crypto');

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

const season1 = require('../data/season1');
const connectDB = require('../database');
const renderCard = require('../utils/renderCard');

// Add future packs here.
// Owned packs remain openable after their event ends.
const PACKS = {
  halloween26: {
    name: 'Halloween 26',
    inventoryKey: 'halloween_pack',
    season: 1,
    event: 'halloween2026',
    color: 0xff8c00,
    emoji: '<:halloweenpack:1555956375979425963>',

    aliases: [
      'halloween 26',
      'halloween26',
      'halloween 2026',
      'halloween2026',
      'halloween',
      'halloween pack'
    ],

    getCards: () =>
      season1.filter(
        card => card.event === 'halloween2026'
      )
  }
};

const activeUsers = new Set();

const normalize = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

function resolvePack(value) {
  const name = normalize(value);

  return Object.entries(PACKS).find(
    ([key, pack]) =>
      normalize(key) === name ||
      pack.aliases.some(
        alias => normalize(alias) === name
      )
  )?.[1];
}

function documentFrom(result) {
  return result &&
    Object.prototype.hasOwnProperty.call(result, 'value')
    ? result.value
    : result;
}

async function uniqueCode(collection, session) {
  const chars =
    'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from(
      { length: 6 },
      () => chars[randomInt(chars.length)]
    ).join('');

    const exists = await collection.findOne(
      { code },
      { session }
    );

    if (!exists) return code;
  }

  throw new Error('Could not generate a card code.');
}

const data = new SlashCommandBuilder()
  .setName('unpack')
  .setDescription('Open one owned card pack')
  .addStringOption(option =>
    option
      .setName('pack')
      .setDescription('Pack to open')
      .setRequired(true)
      .addChoices(
        ...Object.entries(PACKS).map(
          ([value, pack]) => ({
            name: pack.name,
            value
          })
        )
      )
  );

async function execute(source, args = []) {
  const slash =
    typeof source.isChatInputCommand === 'function' &&
    source.isChatInputCommand();

  const userId = slash
    ? source.user.id
    : source.author.id;

  if (
    slash &&
    !source.deferred &&
    !source.replied
  ) {
    await source.deferReply();
  }

  const reply = payload =>
    slash
      ? source.editReply(payload)
      : source.reply(payload);

  const input = slash
    ? source.options.getString('pack', true)
    : args.join(' ');

  const pack = resolvePack(input);

  if (!pack) {
    return reply({
      content:
        '📦 Use `unpack halloween 26` or ' +
        '`/unpack pack:Halloween 26` to open one pack.'
    });
  }

  if (activeUsers.has(userId)) {
    return reply({
      content: '⏳ Your previous pack is still opening.'
    });
  }

  activeUsers.add(userId);

  let session;
  let awarded = false;
  let result;

  try {
    const pool = pack.getCards();

    if (!pool.length) {
      throw new Error(
        'No cards are configured for this pack.'
      );
    }

    // Select once so transaction retries keep the reward.
    const selected = pool[randomInt(pool.length)];
    const cardId = Number(selected.id);

    if (!Number.isFinite(cardId)) {
      throw new Error(
        'The selected pack card has an invalid ID.'
      );
    }

    const db = await connectDB();

    if (!db.client?.startSession) {
      throw new Error(
        'Database wrapper must expose db.client ' +
        'for safe pack opening.'
      );
    }

    session = db.client.startSession();

    const inventory = db.collection('inventory');
    const collection = db.collection('collections');
    const serials = db.collection('serials');

    const itemPath = `items.${pack.inventoryKey}`;

    // Pack consumption and card delivery commit together.
    await session.withTransaction(async () => {
      const consumed = await inventory.updateOne(
        {
          userId,
          [itemPath]: { $gte: 1 }
        },
        {
          $inc: {
            [itemPath]: -1
          }
        },
        { session }
      );

      if (!consumed.modifiedCount) {
        const error = new Error(
          `You don't have a ${pack.name} pack. ` +
          'Buy one from the store first.'
        );

        error.code = 'NO_PACK';
        throw error;
      }

      const counter = documentFrom(
        await serials.findOneAndUpdate(
          {
            cardId,
            season: pack.season
          },
          {
            $inc: {
              serial: 1
            },
            $setOnInsert: {
              season: pack.season
            }
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
          'Could not allocate a card serial.'
        );
      }

      const code = await uniqueCode(
        collection,
        session
      );

      const owned = {
        userId,
        cardId,
        season: pack.season,
        serial: counter.serial,
        code,
        tag: null,
        favorite: false,

        ...(pack.event
          ? { event: pack.event }
          : {})
      };

      // Use the correct season and event frame.
      // Rendering failure rolls back pack consumption.
      const buffer = await renderCard(
        {
          ...selected,
          season: pack.season,

          ...(pack.event
            ? { event: pack.event }
            : {})
        },
        counter.serial,
        owned
      );

      await collection.insertOne(
        owned,
        { session }
      );

      const remaining = await inventory.findOne(
        { userId },
        { session }
      );

      const embed = new EmbedBuilder()
        .setColor(pack.color)
        .setTitle(
          `${pack.emoji} ${pack.name} Pack Opened!`
        )
        .setDescription(
          `You received **${selected.name}**!\n\n` +
          `**Series:** ${pack.name}\n` +
          `**Serial:** #${counter.serial}\n` +
          `**Code:** \`${code}\``
        )
        .setImage('attachment://unpacked-card.png')
        .setFooter({
          text:
            '1 pack consumed • ' +
            (
              remaining?.items?.[pack.inventoryKey] ?? 0
            ) +
            ' remaining'
        })
        .setTimestamp();

      result = {
        embeds: [embed],

        files: [
          new AttachmentBuilder(buffer, {
            name: 'unpacked-card.png'
          })
        ],

        allowedMentions: {
          parse: []
        }
      };
    });

    awarded = true;

    await reply(result);
  } catch (error) {
    console.error('[UNPACK]', error);

    const content = awarded
      ? '✅ Your pack was opened and the card is ' +
        'in your collection. Its image could not be sent.'
      : error.code === 'NO_PACK'
        ? `❌ ${error.message}`
        : '❌ Could not open the pack. No pack was ' +
          'consumed. Check the bot logs for the cause.';

    await reply({ content }).catch(() => {});
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }

    activeUsers.delete(userId);
  }
}

module.exports = {
  name: 'unpack',
  aliases: ['openpack'],

  data,
  slashData: data,

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};