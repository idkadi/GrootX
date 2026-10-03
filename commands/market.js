const cards = require('../data/season1');
const connectDB = require('../database');
const renderCard = require('../utils/renderCard');
const { createCanvas, loadImage } = require('canvas');
const { randomBytes } = require('crypto');

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');

const SEASON = 1;
const S1 = '**S1**';
const COIN = '<:grootcoin:1504742213110861834>';

const REFRESH = 20 * 60 * 60 * 1000;
const IST = 330 * 60 * 1000;
const DAY = 86400000;
const VERSION = 2;

const PRICES = {
  common: 1000,
  uncommon: 2000,
  rare: 5000,
  epic: 10000,
  legendary: 20000
};

const EMOJIS = {
  common: '<:common:1504510702956839033>',
  uncommon: '<:uncommon:1504510929210052698>',
  rare: '<:rare:1504510606718275764>',
  epic: '<:epic:1504510771214680175>',
  legendary: '<:legendary:1504511435974377552>'
};

const imageCache = new Map();

// Sunday follows India time, regardless of the VPS timezone.
function calendar(now) {
  const local = new Date(now + IST);
  const day = local.getUTCDay();

  const midnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate()
  ) - IST;

  return {
    sunday: day === 0,
    nextSunday: midnight + (day === 0 ? 7 : 7 - day) * DAY,
    boundary:
      day === 0
        ? midnight + DAY
        : midnight + (7 - day) * DAY
  };
}

function eligible(card, tier) {
  return (
    !card.event &&
    !/halloween/i.test(
      String(card.appearance || card.series || '')
    ) &&
    String(card.tier || '').toLowerCase() === tier &&
    Number.isFinite(Number(card.id)) &&
    !!card.rawImage
  );
}

async function getMarket(db, now = Date.now()) {
  const col = db.collection('market');

  for (let attempt = 0; attempt < 8; attempt++) {
    const previous = await col.findOne({
      _id: 'daily_market'
    });

    const time = calendar(now);

    if (
      previous &&
      previous.version === VERSION &&
      previous.season === SEASON &&
      previous.sunday === time.sunday &&
      now < previous.expiresAt
    ) {
      return previous;
    }

    const tiers = [
      'common',
      'uncommon',
      'rare',
      'epic',
      time.sunday ? 'legendary' : 'epic'
    ];

    const used = new Set();

    const entries = tiers.map(tier => {
      let pool = cards.filter(
        card =>
          eligible(card, tier) &&
          !used.has(String(card.id))
      );

      if (!pool.length) {
        pool = cards.filter(card => eligible(card, tier));
      }

      if (!pool.length) {
        throw new Error(
          `No ordinary S1 ${tier} cards with rawImage are available.`
        );
      }

      const card =
        pool[Math.floor(Math.random() * pool.length)];

      used.add(String(card.id));

      return {
        cardId: Number(card.id),
        tier,
        season: SEASON,
        price: PRICES[tier],
        type: tier === 'legendary' ? 'weekly' : 'daily'
      };
    });

    const market = {
      version: VERSION,
      season: SEASON,
      sunday: time.sunday,
      revision: randomBytes(12).toString('hex'),
      updatedAt: now,
      expiresAt: Math.min(now + REFRESH, time.boundary),
      cards: entries
    };

    if (!previous) {
      try {
        await col.insertOne({
          _id: 'daily_market',
          ...market
        });
      } catch (error) {
        if (error.code === 11000) continue;
        throw error;
      }
    } else {
      const result = await col.updateOne(
        {
          _id: previous._id,
          updatedAt: previous.updatedAt,
          revision:
            previous.revision ?? { $exists: false }
        },
        {
          $set: market
        }
      );

      if (!result.matchedCount) continue;
    }

    return {
      _id: 'daily_market',
      ...market
    };
  }

  throw new Error(
    'Market is refreshing. Please try again.'
  );
}

async function marketImage(market, resolved) {
  if (imageCache.has(market.revision)) {
    return imageCache.get(market.revision);
  }

  const pending = (async () => {
    const width = 1440;
    const margin = 24;
    const gap = 16;

    const cardWidth =
      (width - margin * 2 - gap * 4) / 5;

    const cardHeight = cardWidth * 1492 / 1054;

    const canvas = createCanvas(
      width,
      Math.ceil(cardHeight + 156)
    );

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#111827';
    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';

    ctx.fillText(
      market.sunday
        ? 'GROOTX MARKET • SUNDAY LEGENDARY'
        : 'GROOTX MARKET • SEASON 1',
      margin,
      44
    );

    // Render sequentially to reduce peak memory usage.
    for (let i = 0; i < resolved.length; i++) {
      const card = resolved[i];

      const rendered = await renderCard(
        {
          ...card,
          season: SEASON
        },
        'MARKET'
      );

      const image = await loadImage(rendered);
      const x = margin + i * (cardWidth + gap);

      ctx.drawImage(
        image,
        x,
        68,
        cardWidth,
        cardHeight
      );

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';

      ctx.fillText(
        `${i + 1}. ${card.tier.toUpperCase()}`,
        x,
        94 + cardHeight,
        cardWidth
      );

      ctx.fillStyle = '#fbbf24';
      ctx.font = '18px sans-serif';

      ctx.fillText(
        `${card.price.toLocaleString()} coins`,
        x,
        122 + cardHeight,
        cardWidth
      );
    }

    return canvas.toBuffer('image/png');
  })();

  imageCache.set(market.revision, pending);

  while (imageCache.size > 2) {
    imageCache.delete(
      imageCache.keys().next().value
    );
  }

  try {
    return await pending;
  } catch (error) {
    imageCache.delete(market.revision);
    throw error;
  }
}

async function purchase(db, market, index, userId) {
  const fresh = await getMarket(db);

  if (fresh.revision !== market.revision) {
    return {
      error:
        'The market refreshed. Open market again before purchasing.'
    };
  }

  const item = fresh.cards[index];

  const card = cards.find(
    card =>
      String(card.id) === String(item?.cardId)
  );

  if (!card || !item) {
    return {
      error:
        'Card data is unavailable. No coins were charged.'
    };
  }

  const balances = db.collection('balances');

  // Conditional debit prevents concurrent purchases
  // from spending more coins than the user owns.
  const debit = await balances.updateOne(
    {
      userId,
      coins: {
        $gte: item.price
      }
    },
    {
      $inc: {
        coins: -item.price
      }
    }
  );

  if (!debit.modifiedCount) {
    return {
      error:
        `Not enough coins. You need ${COIN} ` +
        `**${item.price.toLocaleString()}**.`
    };
  }

  let owned;

  try {
    const result = await db
      .collection('serials')
      .findOneAndUpdate(
        {
          cardId: item.cardId,
          season: SEASON
        },
        {
          $inc: {
            serial: 1
          }
        },
        {
          upsert: true,
          returnDocument: 'after'
        }
      );

    // Supports MongoDB drivers returning either
    // the document directly or { value: document }.
    const serialDoc = result?.value ?? result;

    if (!Number.isFinite(serialDoc?.serial)) {
      throw new Error('Serial allocation failed');
    }

    const collection = db.collection('collections');

    await collection.createIndex(
      { code: 1 },
      { unique: true }
    );

    for (let attempt = 0; attempt < 100; attempt++) {
      // Three random bytes produce exactly six hex characters.
      const candidate = randomBytes(3).toString('hex');

      if (await collection.findOne({ code: candidate })) {
        continue;
      }

      const copy = {
        userId,
        cardId: item.cardId,
        season: SEASON,
        serial: serialDoc.serial,
        code: candidate,
        tag: null,
        favorite: false
      };

      try {
        await collection.insertOne(copy);
        owned = copy;
        break;
      } catch (error) {
        // The unique index also protects concurrent purchases.
        if (
          error.code !== 11000 ||
          !(await collection.findOne({ code: candidate }))
        ) {
          throw error;
        }
      }
    }

    if (!owned) {
      throw new Error('Code allocation failed');
    }
  } catch (error) {
    console.error(
      '[market] Purchase failed:',
      error
    );

    await balances.updateOne(
      { userId },
      {
        $inc: {
          coins: item.price
        }
      }
    );

    return {
      error:
        'Purchase failed. Your coins were refunded.'
    };
  }

  return {
    card,
    item,
    owned
  };
}

async function run(source) {
  const slash =
    typeof source.isChatInputCommand === 'function' &&
    source.isChatInputCommand();

  if (
    slash &&
    !source.deferred &&
    !source.replied
  ) {
    await source.deferReply();
  }

  const send = payload =>
    slash
      ? source.editReply(payload)
      : source.reply(payload);

  try {
    const db = await connectDB();
    const market = await getMarket(db);

    const resolved = market.cards.map(item => {
      const card = cards.find(
        card =>
          String(card.id) === String(item.cardId)
      );

      if (!card) {
        throw new Error(
          `Missing S1 card ${item.cardId}`
        );
      }

      return {
        ...card,
        ...item,
        season: SEASON
      };
    });

    let attachment;

    try {
      attachment = new AttachmentBuilder(
        await marketImage(market, resolved),
        {
          name: 'market-s1.png'
        }
      );
    } catch (error) {
      console.error(
        '[market] Image rendering failed:',
        error
      );
    }

    const row = new ActionRowBuilder()
      .addComponents(
        resolved.map((card, i) =>
          new ButtonBuilder()
            .setCustomId(`market_buy_${i}`)
            .setLabel(
              `${i + 1}. ${card.name || 'Card'}`
                .slice(0, 80)
            )
            .setStyle(
              card.tier === 'legendary'
                ? ButtonStyle.Success
                : ButtonStyle.Primary
            )
        )
      );

    const content =
      `🛒 **GrootX Market • S1**\n` +
      `⏳ Refreshes ` +
      `<t:${Math.floor(market.expiresAt / 1000)}:R>\n` +
      (
        market.sunday
          ? '👑 **Sunday special: one Epic slot is now Legendary!**\n'
          : `👑 Next Sunday special ` +
            `<t:${Math.floor(
              calendar(Date.now()).nextSunday / 1000
            )}:R>\n`
      ) +
      '\n' +
      resolved.map((card, i) =>
        `${i + 1}. ${S1} ${EMOJIS[card.tier]} ` +
        `**${card.name}** — ${COIN} ` +
        `**${card.price.toLocaleString()}**`
      ).join('\n') +
      (
        !attachment
          ? '\n\n⚠️ Image unavailable; purchases still work. Check the raw images and tier frames.'
          : ''
      );

    const sent = await send({
      content,
      files: attachment ? [attachment] : [],
      components: [row],
      allowedMentions: {
        parse: []
      }
    });

    const message =
      sent?.createMessageComponentCollector
        ? sent
        : await source.fetchReply();

    const collector =
      message.createMessageComponentCollector({
        time: 120000
      });

    collector.on('collect', interaction => {
      handleButton(
        interaction,
        db,
        market,
        resolved
      ).catch(async error => {
        console.error(
          '[market] Button error:',
          error
        );

        const payload = {
          content:
            'Could not complete this request. Please try again.',
          components: []
        };

        try {
          if (
            interaction.deferred ||
            interaction.replied
          ) {
            await interaction.editReply(payload);
          } else {
            await interaction.reply({
              ...payload,
              ephemeral: true
            });
          }
        } catch (replyError) {
          console.error(
            '[market] Error reply failed:',
            replyError
          );
        }
      });
    });

    collector.on('end', () => {
      message.edit({
        components: []
      }).catch(() => {});
    });
  } catch (error) {
    console.error(
      '[market] Command error:',
      error
    );

    await send({
      content:
        '❌ The market could not load. Check the bot logs and try again.',
      components: [],
      files: []
    });
  }
}

async function handleButton(
  interaction,
  db,
  market,
  resolved
) {
  if (
    !/^market_buy_\d+$/.test(interaction.customId)
  ) {
    return;
  }

  await interaction.deferReply({
    ephemeral: true
  });

  const index = Number(
    interaction.customId.split('_').pop()
  );

  const selected = resolved[index];

  if (!selected) {
    return interaction.editReply({
      content: 'Market item not found.'
    });
  }

  const token = randomBytes(8).toString('hex');
  const confirmId = `market_confirm_${token}`;
  const cancelId = `market_cancel_${token}`;

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Confirm')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

  const reply = await interaction.editReply({
    content:
      `🛒 Buy ${S1} ${EMOJIS[selected.tier]} ` +
      `**${selected.name}** for ${COIN} ` +
      `**${selected.price.toLocaleString()}**?`,
    components: [row],
    allowedMentions: {
      parse: []
    }
  });

  let confirmation;

  try {
    confirmation =
      await reply.awaitMessageComponent({
        time: 30000,
        filter: component =>
          component.user.id === interaction.user.id &&
          [confirmId, cancelId].includes(
            component.customId
          )
      });
  } catch {
    return interaction.editReply({
      content:
        '⌛ Confirmation expired. No coins were charged.',
      components: []
    });
  }

  await confirmation.deferUpdate();

  await interaction.editReply({
    content:
      confirmation.customId === cancelId
        ? 'Purchase cancelled.'
        : 'Processing purchase…',
    components: []
  });

  if (confirmation.customId === cancelId) {
    return;
  }

  const result = await purchase(
    db,
    market,
    index,
    interaction.user.id
  );

  if (result.error) {
    return interaction.editReply({
      content: `❌ ${result.error}`,
      components: []
    });
  }

  const { card, item, owned } = result;

  // A reply failure after saving the card must
  // never refund an already successful purchase.
  await interaction.editReply({
    content:
      `✅ **Purchase successful!**\n\n` +
      `${S1} ${EMOJIS[item.tier]} ` +
      `**${card.name}** #${owned.serial}\n` +
      `Code: \`${owned.code}\`\n` +
      `Paid: ${COIN} ` +
      `**${item.price.toLocaleString()}**`,
    components: [],
    allowedMentions: {
      parse: []
    }
  });
}

const data = new SlashCommandBuilder()
  .setName('market')
  .setDescription(
    'Browse and buy S1 cards; Legendary Sunday specials.'
  );

module.exports = {
  name: 'market',
  aliases: ['shop'],
  description: 'Browse the card market.',
  data,
  slashData: data,
  execute: run,
  executeSlash: run,
  slashExecute: run
};