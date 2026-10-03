const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');
const { createCanvas, loadImage } = require('canvas');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require('discord.js');

const cards = require('../data/season1');
const renderCard = require('../utils/renderCard');
const connectDB = require('../database');

const SEASON = 1;
const SEASON_EMOJI = '<:Season1:1555956879576793130>';
const LEGENDARY = '<:legendary:1504511435974377552>';

const ITEMS = [
  'gauntlet',
  'space_stone',
  'mind_stone',
  'reality_stone',
  'power_stone',
  'time_stone',
  'soul_stone'
];

const active = new Set();

const unwrap = result =>
  result && Object.prototype.hasOwnProperty.call(result, 'value')
    ? result.value
    : result;

const safe = value =>
  String(value || 'Unknown')
    .replace(/[`*_~|]/g, '')
    .slice(0, 120);

async function uniqueCode(collection, session) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  for (let attempt = 0; attempt < 100; attempt++) {
    const code = Array.from(
      { length: 6 },
      () => chars[randomInt(chars.length)]
    ).join('');

    if (!await collection.findOne({ code }, { session })) {
      return code;
    }
  }

  throw new Error('Could not generate a unique card code.');
}

async function preview(selected, serials) {
  const width = 360;
  const height = Math.round(width * 1492 / 1054);

  const canvas = createCanvas(width * 3, height + 50);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sequential rendering reduces peak memory usage.
  for (let i = 0; i < selected.length; i++) {
    const buffer = await renderCard(
      { ...selected[i], season: SEASON },
      serials[i],
      { season: SEASON }
    );

    ctx.drawImage(
      await loadImage(buffer),
      width * i,
      0,
      width,
      height
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px sans-serif';
    ctx.textAlign = 'center';

    ctx.fillText(
      `${i + 1} • #${serials[i]}`,
      width * i + width / 2,
      height + 32
    );
  }

  return canvas.toBuffer('image/png');
}

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

  if (active.has(userId)) {
    return reply('⏳ Finish your current Snap first.');
  }

  active.add(userId);
  let handedOff = false;

  try {
    const db = await connectDB();

    if (!db.client?.startSession) {
      throw new Error(
        'Database wrapper must expose db.client for Snap transactions.'
      );
    }

    const inventory = db.collection('inventory');
    const collection = db.collection('collections');
    const serialsCollection = db.collection('serials');

    const ownedItems =
      (await inventory.findOne({ userId }))?.items || {};

    const missing = ITEMS.filter(
      item => !(Number(ownedItems[item]) >= 1)
    );

    if (missing.length) {
      return await reply(
        '❌ You need one Gauntlet and all six Infinity Stones.\n' +
        'Missing: **' +
        missing
          .map(item => item.replace(/_/g, ' '))
          .join(', ') +
        '**'
      );
    }

    // Regular S1 Legendaries only.
    const distinct = new Map();

    for (const card of cards) {
      if (
        String(card.tier || '').trim().toLowerCase() !== 'legendary' ||
        card.event ||
        !Number.isFinite(Number(card.id)) ||
        typeof card.rawImage !== 'string' ||
        !fs.existsSync(
          path.join(__dirname, '..', 'images', card.rawImage)
        )
      ) {
        continue;
      }

      distinct.set(Number(card.id), card);
    }

    const pool = [...distinct.values()];

    if (pool.length < 3) {
      return await reply(
        '❌ At least three distinct Legendary S1 cards with ' +
        'available raw images are required. Your items were not consumed.'
      );
    }

    const selected = [];

    while (selected.length < 3) {
      selected.push(
        pool.splice(randomInt(pool.length), 1)[0]
      );
    }

    // Reserve displayed serials like a normal drop.
    // Unclaimed choices leave serial gaps.
    const serials = [];

    for (const card of selected) {
      const doc = unwrap(
        await serialsCollection.findOneAndUpdate(
          {
            cardId: Number(card.id),
            season: SEASON
          },
          {
            $inc: { serial: 1 },
            $setOnInsert: { season: SEASON }
          },
          {
            upsert: true,
            returnDocument: 'after'
          }
        )
      );

      if (!Number.isFinite(doc?.serial)) {
        throw new Error('Serial allocation failed.');
      }

      serials.push(doc.serial);
    }

    const buffer = await preview(selected, serials);
    const prefix = `snap:${source.id}:`;

    const embed = new EmbedBuilder()
      .setColor(0xff9900)
      .setTitle('🫰 Snap • Choose your Legendary')
      .setDescription(
        `${SEASON_EMOJI} Choose **ONE** of these three ` +
        'Season 1 Legendaries.\n\n' +
        selected.map((card, i) =>
          `**${i + 1}.** ${LEGENDARY} ` +
          `**${safe(card.name)}** • #${serials[i]}\n` +
          safe(card.appearance || card.show)
        ).join('\n\n')
      )
      .setImage('attachment://snap-choices.png')
      .setFooter({
        text:
          '60 seconds to choose • Items consumed only after a successful claim'
      });

    const row = new ActionRowBuilder().addComponents(
      ...selected.map((_, i) =>
        new ButtonBuilder()
          .setCustomId(prefix + i)
          .setLabel(`Choose ${i + 1}`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const sent = await reply({
      embeds: [embed],
      files: [{
        attachment: buffer,
        name: 'snap-choices.png'
      }],
      components: [row]
    });

    const msg = sent?.createMessageComponentCollector
      ? sent
      : await source.fetchReply();

    const collector = msg.createMessageComponentCollector({
      time: 60000,
      filter: i => i.customId.startsWith(prefix)
    });

    let processing = false;
    let finished = false;

    const release = () => active.delete(userId);

    collector.on('collect', interaction => {
      void (async () => {
        if (interaction.user.id !== userId) {
          await interaction.reply({
            content: '❌ This is not your Snap.',
            ephemeral: true
          });
          return;
        }

        if (processing || finished) {
          await interaction.deferUpdate();
          return;
        }

        const index = Number(
          interaction.customId.slice(prefix.length)
        );

        if (!Number.isInteger(index) || !selected[index]) {
          await interaction.reply({
            content: '❌ Invalid choice.',
            ephemeral: true
          });
          return;
        }

        processing = true;

        let session;
        let reward;

        try {
          // Acknowledge immediately before DB and image work.
          await interaction.deferUpdate();

          const card = selected[index];
          const serial = serials[index];

          const rewardBuffer = await renderCard(
            { ...card, season: SEASON },
            serial,
            { season: SEASON }
          );

          session = db.client.startSession();

          // Item consumption and card creation succeed together.
          await session.withTransaction(async () => {
            reward = null;

            const filter = { userId };
            const decrement = {};

            for (const item of ITEMS) {
              filter[`items.${item}`] = { $gte: 1 };
              decrement[`items.${item}`] = -1;
            }

            const spent = await inventory.updateOne(
              filter,
              { $inc: decrement },
              { session }
            );

            if (!spent.modifiedCount) {
              throw new Error(
                'You no longer have a Gauntlet and all six stones.'
              );
            }

            const code = await uniqueCode(collection, session);

            await collection.insertOne(
              {
                userId,
                cardId: Number(card.id),
                season: SEASON,
                serial,
                code,
                tag: null,
                favorite: false,
                obtainedAt: new Date(),
                source: 'snap'
              },
              { session }
            );

            reward = { code, serial };
          });

          finished = true;
          collector.stop('claimed');

          const name =
            `snap-reward-${card.id}-${serial}.png`;

          const result = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🌌 Snap Reward Claimed')
            .setDescription(
              `${SEASON_EMOJI} ${LEGENDARY} ` +
              `**${safe(card.name)}**\n` +
              `\`${reward.code}\` • **#${serial}**\n` +
              safe(card.appearance || card.show)
            )
            .setImage(`attachment://${name}`)
            .setFooter({
              text:
                'Added to your collection • One Gauntlet and six stones consumed'
            });

          try {
            await interaction.editReply({
              content: '🫰 **SNAP COMPLETE**',
              embeds: [result],
              attachments: [],
              files: [{
                attachment: rewardBuffer,
                name
              }],
              components: [],
              allowedMentions: { parse: [] }
            });
          } catch (error) {
            console.error(
              '[SNAP] Saved reward delivery failed:',
              error
            );

            await interaction.followUp({
              content:
                `✅ Your card was saved: \`${reward.code}\` ` +
                `• #${serial}. Use view with this code to see it.`,
              ephemeral: true
            }).catch(() => {});
          }
        } catch (error) {
          console.error('[SNAP] Claim failed:', error);

          finished = true;
          collector.stop('failed');

          await msg.edit({
            content:
              '❌ Snap could not complete. Your items were not consumed. ' +
              'Please try again.',
            embeds: [],
            components: [],
            attachments: []
          }).catch(() => {});
        } finally {
          if (session) {
            await session.endSession().catch(() => {});
          }

          processing = false;
          release();
        }
      })().catch(error =>
        console.error('[SNAP] Interaction:', error)
      );
    });

    collector.on('end', () => {
      if (processing || finished) return;

      finished = true;
      release();

      void msg.edit({
        content:
          '⌛ Snap expired. Your Gauntlet and stones were not consumed.',
        components: []
      }).catch(() => {});
    });

    handedOff = true;
  } catch (error) {
    console.error('[SNAP]', error);

    await reply(
      '❌ Snap could not load its card images. Your items were not consumed. ' +
      'Check the bot logs and try again.'
    ).catch(() => {});
  } finally {
    if (!handedOff) {
      active.delete(userId);
    }
  }
}

module.exports = {
  name: 'snap',

  data: new SlashCommandBuilder()
    .setName('snap')
    .setDescription(
      'Use a Gauntlet and six stones to choose one of three Legendary S1 cards.'
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};