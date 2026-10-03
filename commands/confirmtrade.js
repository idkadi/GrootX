const { SlashCommandBuilder } = require('discord.js');
const connectDB = require('../database');

const {
  removeCardFromAlbums
} = require('../utils/albumUtils');

const CLOSED = [
  'processing',
  'completing',
  'completed',
  'cancelled',
  'expired'
];

const validAmount = n =>
  Number.isSafeInteger(n) && n >= 0;

// Make the existing album helper use this transaction too.
function transactionalDB(db, session) {
  const optionIndex = {
    find: 1,
    findOne: 1,
    countDocuments: 1,
    updateOne: 2,
    updateMany: 2,
    replaceOne: 2,
    deleteOne: 1,
    deleteMany: 1,
    insertOne: 1,
    insertMany: 1,
    findOneAndUpdate: 2,
    findOneAndDelete: 1,
    aggregate: 1
  };

  return new Proxy(db, {
    get(target, key) {
      if (key !== 'collection') {
        return Reflect.get(target, key, target);
      }

      return name => {
        const collection = db.collection(name);

        return new Proxy(collection, {
          get(col, method) {
            const value = Reflect.get(col, method, col);

            if (typeof value !== 'function') {
              return value;
            }

            if (!Object.hasOwn(optionIndex, method)) {
              return () => {
                throw new Error(
                  `Unsupported album database method: ${String(method)}`
                );
              };
            }

            return (...args) => {
              const index = optionIndex[method];

              args[index] = {
                ...(args[index] || {}),
                session
              };

              return value.apply(col, args);
            };
          }
        });
      };
    }
  });
}

function validateOffer(offer) {
  if (
    !offer ||
    !Array.isArray(offer.cards) ||
    !validAmount(offer.coins ?? 0) ||
    (
      offer.items != null &&
      (
        typeof offer.items !== 'object' ||
        Array.isArray(offer.items)
      )
    )
  ) {
    throw new Error(
      'Invalid trade offer. Cancel this trade and start again.'
    );
  }

  const codes = offer.cards;

  if (
    new Set(codes).size !== codes.length ||
    codes.some(code =>
      typeof code !== 'string' ||
      !/^[a-z0-9]{1,64}$/.test(code)
    )
  ) {
    throw new Error(
      'Invalid or duplicate card codes in the trade.'
    );
  }

  for (const [item, amount] of Object.entries(offer.items || {})) {
    if (
      !/^[a-z][a-z0-9_]{0,99}$/.test(item) ||
      ['prototype', 'constructor', '__proto__'].includes(item) ||
      !validAmount(amount)
    ) {
      throw new Error(
        'Invalid item or quantity in the trade.'
      );
    }
  }
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

  let session;
  let outcome;

  try {
    const db = await connectDB();

    if (!db.client?.startSession) {
      throw new Error(
        'Database wrapper must expose db.client for safe trade transactions.'
      );
    }

    const trades = db.collection('trades');
    const collections = db.collection('collections');
    const balances = db.collection('balances');
    const inventory = db.collection('inventory');

    session = db.client.startSession();

    await session.withTransaction(async () => {
      // Reset on every automatic transaction retry.
      outcome = null;

      const trade = await trades.findOne(
        {
          users: userId,
          status: { $nin: CLOSED }
        },
        { session }
      );

      if (!trade) {
        outcome = '❌ You are not in an active trade.';
        return;
      }

      if (
        !Array.isArray(trade.users) ||
        trade.users.length !== 2 ||
        new Set(trade.users).size !== 2 ||
        trade.users.some(id =>
          !/^\d{17,20}$/.test(String(id))
        )
      ) {
        throw new Error('Invalid trade participants.');
      }

      const [a, b] = trade.users;
      const users = [a, b];

      const offers = [
        trade.offers?.[a],
        trade.offers?.[b]
      ];

      offers.forEach(validateOffer);

      const allCodes = offers.flatMap(offer => offer.cards);

      if (new Set(allCodes).size !== allCodes.length) {
        throw new Error(
          'The same card is offered on both sides.'
        );
      }

      const snapshots = [];

      // Validate both original offers before crediting either user.
      for (let i = 0; i < 2; i++) {
        const owner = users[i];
        const offer = offers[i];

        // No season, event, rarity, or catalog restriction.
        for (const code of offer.cards) {
          const card = await collections.findOne(
            {
              userId: owner,
              code
            },
            { session }
          );

          if (!card) {
            throw new Error(
              `Card ${code} is no longer owned by its trader.`
            );
          }

          if (card.favorite) {
            throw new Error(
              `Card ${code} is favorited. Unfavorite it before trading.`
            );
          }
        }

        const balance = await balances.findOne(
          { userId: owner },
          { session }
        );

        const inv = await inventory.findOne(
          { userId: owner },
          { session }
        );

        const coins = balance?.coins ?? 0;
        const items = inv?.items || {};

        if (
          !validAmount(coins) ||
          coins < (offer.coins ?? 0)
        ) {
          throw new Error(
            'A trader no longer has enough coins.'
          );
        }

        for (const [item, amount] of Object.entries(offer.items || {})) {
          if (!amount) continue;

          if (
            !validAmount(items[item]) ||
            items[item] < amount
          ) {
            throw new Error(
              `A trader no longer has enough ${item.replace(/_/g, ' ')}.`
            );
          }
        }

        snapshots.push({ coins, items });
      }

      // Check resulting balances for invalid values or overflow.
      for (let i = 0; i < 2; i++) {
        const own = offers[i];
        const incoming = offers[1 - i];

        const resultingCoins =
          snapshots[i].coins -
          (own.coins ?? 0) +
          (incoming.coins ?? 0);

        if (!validAmount(resultingCoins)) {
          throw new Error(
            'Resulting coin balance is invalid.'
          );
        }

        const keys = new Set([
          ...Object.keys(own.items || {}),
          ...Object.keys(incoming.items || {})
        ]);

        for (const key of keys) {
          const resultingQuantity =
            (snapshots[i].items[key] ?? 0) -
            (own.items?.[key] ?? 0) +
            (incoming.items?.[key] ?? 0);

          if (!validAmount(resultingQuantity)) {
            throw new Error(
              'Resulting inventory quantity is invalid.'
            );
          }
        }
      }

      // Concurrent offer edits write this same document,
      // causing a transaction conflict and fresh retry.
      await trades.updateOne(
        { _id: trade._id },
        {
          $set: {
            [`confirmed.${userId}`]: true
          }
        },
        { session }
      );

      const other = userId === a ? b : a;

      if (trade.confirmed?.[other] !== true) {
        outcome =
          '✅ Your current offer is confirmed. ' +
          'Waiting for the other trader. ' +
          'Any offer change resets both confirmations.';
        return;
      }

      await trades.updateOne(
        { _id: trade._id },
        {
          $set: {
            status: 'processing'
          }
        },
        { session }
      );

      const albumDB = transactionalDB(db, session);

      // Transfer cards while retaining their season, event,
      // serial, code, and other card data.
      for (let i = 0; i < 2; i++) {
        const from = users[i];
        const to = users[1 - i];
        const offer = offers[i];

        for (const code of offer.cards) {
          const moved = await collections.updateOne(
            {
              userId: from,
              code,
              favorite: { $ne: true }
            },
            {
              $set: {
                userId: to,
                favorite: false,
                tag: null
              }
            },
            { session }
          );

          if (moved.modifiedCount !== 1) {
            throw new Error(
              `Card ${code} could not be transferred.`
            );
          }

          await removeCardFromAlbums(
            albumDB,
            from,
            code
          );

          await db.collection('cardtags').deleteMany(
            {
              userId: from,
              code
            },
            { session }
          );
        }
      }

      // Debit both offers before applying credits.
      for (let i = 0; i < 2; i++) {
        const owner = users[i];
        const offer = offers[i];

        if (offer.coins > 0) {
          const spent = await balances.updateOne(
            {
              userId: owner,
              coins: { $gte: offer.coins }
            },
            {
              $inc: {
                coins: -offer.coins
              }
            },
            { session }
          );

          if (!spent.modifiedCount) {
            throw new Error('Coin balance changed.');
          }
        }

        const filter = { userId: owner };
        const decrement = {};

        for (const [item, amount] of Object.entries(offer.items || {})) {
          if (!amount) continue;

          filter[`items.${item}`] = { $gte: amount };
          decrement[`items.${item}`] = -amount;
        }

        if (Object.keys(decrement).length) {
          const spent = await inventory.updateOne(
            filter,
            { $inc: decrement },
            { session }
          );

          if (!spent.modifiedCount) {
            throw new Error('Inventory changed.');
          }
        }
      }

      // Credit every offered item, including candy and packs.
      for (let i = 0; i < 2; i++) {
        const recipient = users[1 - i];
        const offer = offers[i];

        if (offer.coins > 0) {
          await balances.updateOne(
            { userId: recipient },
            {
              $inc: {
                coins: offer.coins
              }
            },
            {
              upsert: true,
              session
            }
          );
        }

        const increment = {};

        for (const [item, amount] of Object.entries(offer.items || {})) {
          if (amount) {
            increment[`items.${item}`] = amount;
          }
        }

        if (Object.keys(increment).length) {
          await inventory.updateOne(
            { userId: recipient },
            { $inc: increment },
            {
              upsert: true,
              session
            }
          );
        }
      }

      // Atomic deletion prevents this trade completing twice.
      await trades.deleteOne(
        { _id: trade._id },
        { session }
      );

      outcome =
        '🤝 **Trade completed successfully!**\n' +
        'All offered cards, coins, and items have been transferred.';
    });
  } catch (error) {
    console.error('[CONFIRMTRADE]', error);

    outcome =
      '❌ Trade could not complete. Check both offers and try again.\n' +
      'No partial transfers were committed.';

    // Show validation messages without exposing DB internals.
    if (
      error.message &&
      /^(Invalid |The same card |Card |A trader |Resulting )/.test(error.message)
    ) {
      outcome += `\n${error.message}`;
    }
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }

  // Reply outside the transaction so Discord failures cannot
  // roll back or repeat a completed trade.
  await reply(outcome).catch(error =>
    console.error('[CONFIRMTRADE] Reply failed:', error)
  );
}

module.exports = {
  name: 'confirmtrade',

  data: new SlashCommandBuilder()
    .setName('confirmtrade')
    .setDescription(
      'Confirm your trade and safely exchange all offered cards, coins, and items.'
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};