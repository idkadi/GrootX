const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');

const {
  createCanvas,
  loadImage
} = require('canvas');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const cards = require('../data/season1');
const renderCard = require('../utils/renderCard');
const connectDB = require('../database');

const SEASON = 1;
const HALLOWEEN_EVENT = 'halloween2026';

const START = Date.parse(
  '2026-10-03T00:00:00+05:30'
);

const END = Date.parse(
  '2026-11-01T00:00:00+05:30'
);

const CANDY =
  '<:grootcandy:1555950722816675870>';

const runningClients = new WeakMap();
const claimLocks = new Set();

const activeEvent = (now = Date.now()) =>
  now >= START && now < END;

const tierOf = card =>
  String(card.tier || '').trim().toLowerCase();

const isHalloween = card =>
  card.event === HALLOWEEN_EVENT;

const idOf = card => Number(card.id);

const seriesOf = card =>
  String(card.show || card.appearance || '').trim();

function emoji(card) {
  if (card.event) return '🎃';

  return {
    common: '<:common:1504510702956839033>',
    uncommon: '<:uncommon:1504510929210052698>',
    rare: '<:rare:1504510606718275764>',
    epic: '<:epic:1504510771214680175>',
    legendary: '<:legendary:1504511435974377552>'
  }[tierOf(card)] || '🎴';
}

function usableCards() {
  return cards.filter(card =>
    Number.isFinite(idOf(card)) &&
    typeof card.rawImage === 'string' &&
    fs.existsSync(
      path.join(
        __dirname,
        '..',
        'images',
        card.rawImage
      )
    )
  );
}

function rollTier(halloweenAvailable) {
  const chance = Math.random() * 100;

  // During Halloween:
  // Common 59.5%, Uncommon 27.5%, Rare 10%,
  // Epic 2.2%, Legendary 0.3%, Halloween 0.5%.
  const common = halloweenAvailable ? 59.5 : 60;

  if (chance < common) return 'common';
  if (chance < common + 27.5) return 'uncommon';
  if (chance < common + 37.5) return 'rare';
  if (chance < common + 39.7) return 'epic';
  if (chance < common + 40) return 'legendary';

  return 'halloween';
}

function pickCards(available, recent) {
  const regular = available.filter(
    card => !card.event
  );

  const halloween = activeEvent()
    ? available.filter(isHalloween)
    : [];

  const selected = [];

  for (let index = 0; index < 3; index++) {
    const rarity = rollTier(halloween.length > 0);

    const pool = rarity === 'halloween'
      ? halloween
      : regular.filter(
          card => tierOf(card) === rarity
        );

    const unused = card =>
      !selected.some(
        old => idOf(old) === idOf(card)
      );

    const fresh = card =>
      !recent.includes(idOf(card));

    const newSeries = card =>
      !selected.some(
        old => seriesOf(old) === seriesOf(card)
      );

    let choices = pool.filter(card =>
      unused(card) &&
      fresh(card) &&
      newSeries(card)
    );

    if (!choices.length) {
      choices = pool.filter(card =>
        unused(card) && fresh(card)
      );
    }

    if (!choices.length) {
      choices = pool.filter(unused);
    }

    // Fallbacks exclude all event cards.
    if (!choices.length) {
      choices = regular.filter(card =>
        unused(card) && fresh(card)
      );
    }

    if (!choices.length) {
      choices = regular.filter(unused);
    }

    if (!choices.length) {
      throw new Error(
        'Not enough distinct renderable cards ' +
        'for a three-card drop.'
      );
    }

    const chosen = choices[randomInt(choices.length)];

    selected.push(chosen);
    recent.push(idOf(chosen));

    while (recent.length > 15) {
      recent.shift();
    }
  }

  return selected;
}

function documentFrom(result) {
  return result &&
    Object.prototype.hasOwnProperty.call(result, 'value')
    ? result.value
    : result;
}

async function assignSerials(db, selected) {
  const serials = [];

  for (const card of selected) {
    const document = documentFrom(
      await db.collection('serials').findOneAndUpdate(
        {
          cardId: idOf(card),
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

    if (
      !document ||
      !Number.isFinite(document.serial)
    ) {
      throw new Error('Serial allocation failed.');
    }

    serials.push(document.serial);
  }

  return serials;
}

async function renderDrop(selected, serials) {
  const width = 360;
  const height = Math.round(width * 1492 / 1054);

  const canvas = createCanvas(
    width * selected.length,
    height + 50
  );

  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#10151d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sequential rendering limits memory usage.
  for (let index = 0; index < selected.length; index++) {
    const card = {
      ...selected[index],
      season: SEASON
    };

    const buffer = await renderCard(
      card,
      serials[index],
      {
        season: SEASON,
        event: card.event
      }
    );

    const image = await loadImage(buffer);

    ctx.drawImage(
      image,
      index * width,
      0,
      width,
      height
    );

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 23px sans-serif';

    ctx.fillText(
      `${index + 1} • #${serials[index]}`,
      index * width + width / 2,
      height + 32
    );
  }

  return canvas.toBuffer('image/png');
}

function wishlistSeason(entry) {
  return [
    '1',
    's1',
    'season1',
    'season 1'
  ].includes(
    String(entry.season ?? 0).toLowerCase()
  ) ? 1 : 0;
}

async function wishlistData(db, selected) {
  const ids = selected.map(idOf);

  const documents = await db.collection('wishlists')
    .find({
      $or: [
        {
          'cards.cardId': {
            $in: [...ids, ...ids.map(String)]
          }
        },
        {
          'cards.id': {
            $in: [...ids, ...ids.map(String)]
          }
        }
      ]
    })
    .toArray();

  const wishers = selected.map(() => new Set());

  for (const document of documents) {
    for (let index = 0; index < selected.length; index++) {
      const matched = (document.cards || []).some(
        entry =>
          entry &&
          typeof entry === 'object' &&
          wishlistSeason(entry) === SEASON &&
          Number(entry.cardId ?? entry.id) ===
            idOf(selected[index]) &&
          (
            !entry.event ||
            entry.event === selected[index].event
          )
      );

      if (matched) {
        wishers[index].add(String(document.userId));
      }
    }
  }

  const users = [
    ...new Set(
      wishers.flatMap(set => [...set])
    )
  ];

  const pings = users.slice(0, 100);

  return {
    counts: wishers.map(set => set.size),
    pings,

    text: pings.length
      ? '\n\n💫 Wishlist alert: ' +
        pings.map(id => `<@${id}>`).join(' ')
      : ''
  };
}

async function configuredChannels(db) {
  const ids = new Set();

  try {
    const documents = await db.collection('dropChannels')
      .find({})
      .toArray();

    for (const document of documents) {
      if (document.channelId) {
        ids.add(String(document.channelId));
      }
    }
  } catch (error) {
    console.error('[AutoDrop] Mongo config:', error);
  }

  try {
    const file = path.join(
      __dirname,
      '..',
      'data',
      'dropChannels.json'
    );

    if (fs.existsSync(file)) {
      const config = JSON.parse(
        await fs.promises.readFile(file, 'utf8')
      );

      for (const id of Object.values(config || {})) {
        if (id) ids.add(String(id));
      }
    }
  } catch (error) {
    console.error('[AutoDrop] JSON config:', error);
  }

  return [...ids];
}

async function uniqueCode(collection, session) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

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

  throw new Error('Could not allocate a card code.');
}

async function postDrop(
  client,
  db,
  channelId,
  available
) {
  const channel =
    client.channels.cache.get(channelId) ||
    await client.channels.fetch(channelId);

  if (
    !channel?.isTextBased?.() ||
    typeof channel.send !== 'function'
  ) {
    return;
  }

  const recentCol = db.collection('recentDrops');

  const recent = (
    await recentCol
      .find({ season: SEASON })
      .sort({ createdAt: 1 })
      .toArray()
  )
    .map(document => Number(document.cardId))
    .slice(-15);

  const selected = pickCards(available, recent);
  const serials = await assignSerials(db, selected);
  const buffer = await renderDrop(selected, serials);
  const wish = await wishlistData(db, selected);

  const row = new ActionRowBuilder()
    .addComponents(
      ...selected.map((_, index) =>
        new ButtonBuilder()
          .setCustomId(`autodrop_${index}`)
          .setLabel(
            `${index + 1} • 💖 ${wish.counts[index]}`
          )
          .setStyle(ButtonStyle.Primary)
      )
    );

  const text =
    (
      selected.some(isHalloween)
        ? '🎃 **Halloween 26 Auto Drop!**'
        : '🎴 **A New Season 1 Auto Drop!**'
    ) +
    '\n\n' +
    selected.map((card, index) =>
      `**${index + 1}.** ${emoji(card)} ` +
      `**${card.name}** #${serials[index]}` +
      (
        card.event
          ? ' • Halloween 26'
          : ' • S1'
      )
    ).join('\n');

  const content =
    text +
    (
      text.length + wish.text.length <= 2000
        ? wish.text
        : ''
    );

  const msg = await channel.send({
    content,

    files: [
      new AttachmentBuilder(buffer, {
        name: 'drop.png'
      })
    ],

    components: [row],

    allowedMentions: {
      parse: [],
      users: wish.pings
    }
  });

  try {
    await recentCol.deleteMany({
      season: SEASON
    });

    if (recent.length) {
      await recentCol.insertMany(
        recent.map((cardId, index) => ({
          cardId,
          season: SEASON,
          createdAt: Date.now() + index
        }))
      );
    }
  } catch (error) {
    console.error('[AutoDrop] Recent history:', error);
  }

  const claimed = new Set();
  const pending = new Set();
  const claimedUsers = new Set();

  let ended = false;

  const collector =
    msg.createMessageComponentCollector({
      time: 60000
    });

  collector.on('collect', async interaction => {
    const match = /^autodrop_([0-2])$/.exec(
      interaction.customId
    );

    if (!match) return;

    const index = Number(match[1]);
    const userId = interaction.user.id;

    let locked = false;
    let committed = false;
    let session;

    try {
      await interaction.deferReply({
        ephemeral: true
      });

      const tell = content =>
        interaction.editReply({ content });

      if (
        ended ||
        claimed.has(index) ||
        pending.has(index)
      ) {
        return await tell(
          '❌ This card is already claimed or being claimed.'
        );
      }

      if (claimedUsers.has(userId)) {
        return await tell(
          '❌ You already claimed a card from this drop.'
        );
      }

      if (claimLocks.has(userId)) {
        return await tell(
          '⏳ Your previous claim is still processing.'
        );
      }

      pending.add(index);
      claimLocks.add(userId);
      locked = true;

      if (!db.client?.startSession) {
        throw new Error(
          'Database wrapper must expose db.client ' +
          'for safe claims.'
        );
      }

      session = db.client.startSession();

      let code;
      let extra;
      let candy;

      await session.withTransaction(async () => {
        const now = Date.now();

        const cooldowns = db.collection('cooldowns');
        const inventory = db.collection('inventory');
        const collection = db.collection('collections');

        const effect = await db.collection('stoneeffects')
          .findOne({ userId }, { session });

        const cooldown = await cooldowns.findOne(
          {
            type: 'pickup',
            userId
          },
          { session }
        );

        const duration = effect?.timeUntil > now
          ? 2 * 60 * 1000
          : 4 * 60 * 1000;

        extra = false;

        if (
          cooldown &&
          now - cooldown.timestamp < duration
        ) {
          const spent = await inventory.updateOne(
            {
              userId,
              'items.extra_grab': { $gte: 1 }
            },
            {
              $inc: {
                'items.extra_grab': -1
              }
            },
            { session }
          );

          if (!spent.modifiedCount) {
            const remaining = Math.ceil(
              (
                duration -
                (now - cooldown.timestamp)
              ) / 1000
            );

            throw new Error(
              `You can claim again in ` +
              `${Math.floor(remaining / 60)}m ` +
              `${remaining % 60}s.`
            );
          }

          extra = true;
        }

        code = await uniqueCode(collection, session);

        const card = selected[index];

        await collection.insertOne(
          {
            userId,
            cardId: idOf(card),
            season: SEASON,
            serial: serials[index],
            code,
            tag: null,
            favorite: false,

            ...(card.event
              ? { event: card.event }
              : {})
          },
          { session }
        );

        await cooldowns.updateOne(
          {
            type: 'pickup',
            userId
          },
          {
            $set: {
              timestamp: now,
              notified: false
            }
          },
          {
            upsert: true,
            session
          }
        );

        // No dropper exists for auto drops.
        // Candy goes to successful claimers instead.
        candy =
          activeEvent(now) && Math.random() < 0.15
            ? randomInt(25, 101)
            : 0;

        if (candy) {
          await inventory.updateOne(
            { userId },
            {
              $inc: {
                'items.groot_candy': candy
              }
            },
            {
              upsert: true,
              session
            }
          );
        }
      });

      committed = true;

      claimed.add(index);
      claimedUsers.add(userId);

      row.components[index]
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary);

      await msg.edit({
        components: [row]
      }).catch(error =>
        console.error(
          '[AutoDrop] Button display:',
          error
        )
      );

      const card = selected[index];

      const notice =
        `🎉 <@${userId}> claimed ${emoji(card)} ` +
        `**${card.name}** #${serials[index]} ` +
        `• \`${code}\`` +
        (
          card.event
            ? ' • Halloween 26'
            : ' • S1'
        ) +
        (
          extra
            ? '\n⚡ **Extra Grab Used!**'
            : ''
        ) +
        (
          candy
            ? `\n${CANDY} Found **${candy} Groot Candy!**`
            : ''
        );

      await interaction.editReply({
        content:
          `✅ Claimed **${card.name}** • \`${code}\`` +
          (
            candy
              ? `\n${CANDY} +${candy} Groot Candy`
              : ''
          )
      });

      await channel.send({
        content: notice,
        allowedMentions: {
          parse: [],
          users: [userId]
        }
      });

      if (claimed.size === selected.length) {
        collector.stop('claimed');
      }
    } catch (error) {
      console.error('[AutoDrop] Claim:', error);

      const content = committed
        ? '✅ Your claim was saved, but its announcement ' +
          'could not be completed. Check your collection.'
        : `❌ ${error.message || 'Claim failed; try again.'}`;

      if (interaction.deferred) {
        await interaction.editReply({
          content
        }).catch(() => {});
      }
    } finally {
      if (locked) {
        pending.delete(index);
        claimLocks.delete(userId);
      }

      if (session) {
        await session.endSession().catch(() => {});
      }
    }
  });

  collector.on('end', () => {
    ended = true;

    row.components.forEach(button =>
      button.setDisabled(true)
    );

    msg.edit({
      components: [row]
    }).catch(error =>
      console.error('[AutoDrop] Expiry:', error)
    );
  });
}

module.exports = client => {
  // Prevent duplicate timers on repeated initialization.
  if (runningClients.has(client)) {
    return runningClients.get(client);
  }

  let busy = false;
  let stopped = false;

  const run = async () => {
    if (busy || stopped) return;

    busy = true;

    try {
      const db = await connectDB();
      const available = usableCards();

      console.log(
        `[AutoDrop] Renderable S1 cards: ` +
        `${available.length}/${cards.length}`
      );

      const channels = await configuredChannels(db);

      for (const channelId of channels) {
        if (stopped) break;

        try {
          await postDrop(
            client,
            db,
            channelId,
            available
          );
        } catch (error) {
          console.error(
            `[AutoDrop] Channel ${channelId}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error('[AutoDrop] Cycle:', error);
    } finally {
      busy = false;
    }
  };

  const startup = setTimeout(() => {
    void run();
  }, 5000);

  const interval = setInterval(() => {
    void run();
  }, 30 * 60 * 1000);

  const control = {
    run,

    stop() {
      stopped = true;

      clearTimeout(startup);
      clearInterval(interval);

      runningClients.delete(client);
    }
  };

  runningClients.set(client, control);

  console.log(
    '[AutoDrop] S1/Halloween system started.'
  );

  return control;
};