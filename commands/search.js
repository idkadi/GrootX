const season0 = require('../data/cards');
const season1 = require('../data/season1');

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require('discord.js');

const connectDB = require('../database');

const rarityEmojis = {
  common: '<:common:1504510702956839033>',
  uncommon: '<:uncommon:1504510929210052698>',
  rare: '<:rare:1504510606718275764>',
  epic: '<:epic:1504510771214680175>',
  legendary: '<:legendary:1504511435974377552>'
};

const CARDS_PER_PAGE = 10;

const normalize = value =>
  String(value ?? '').trim().toLowerCase();

const compact = value =>
  normalize(value).replace(/\s+/g, '');

const safe = value =>
  String(value ?? '')
    .replace(/[`*_~|\\]/g, '')
    .slice(0, 100);

function seasonOf(value) {
  if (value == null || value === '') return 0;

  const match = normalize(value).match(
    /^(?:s|season\s*)?(\d+)$/
  );

  return match ? Number(match[1]) : null;
}

function eventName(value) {
  if (compact(value) === 'halloween2026') {
    return 'Halloween 26';
  }

  return String(value || '');
}

const catalogs = new Map([
  [0, season0],
  [1, season1]
]);

function resolveCard(entry) {
  const season = seasonOf(entry.season);
  const pool = catalogs.get(season) || [];

  const matches = pool.filter(
    card => Number(card.id) === Number(entry.cardId)
  );

  const card = entry.event
    ? matches.find(
        card =>
          normalize(card.event) === normalize(entry.event)
      )
    : matches.find(card => !card.event) || matches[0];

  // Keep owned cards visible when their catalog data is missing.
  return {
    entry,
    season,
    card: card || {
      name:
        entry.name ||
        entry.cardName ||
        `Unknown card ${entry.cardId}`,
      tier: entry.tier,
      show: entry.show || entry.appearance,
      event: entry.event
    },
    missing: !card
  };
}

const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search your cards across seasons and events.')
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Search by name, series, or tag.')
      .setRequired(true)
      .addChoices(
        { name: 'Name', value: 'name' },
        { name: 'Series / Event', value: 'show' },
        { name: 'Tag', value: 'tag' }
      )
  )
  .addStringOption(option =>
    option
      .setName('query')
      .setDescription(
        'Search text; use untag for untagged cards.'
      )
      .setRequired(true)
      .setMaxLength(100)
  )
  .addIntegerOption(option =>
    option
      .setName('season')
      .setDescription('Optional season filter: 0, 1, etc.')
      .setMinValue(0)
  );

async function run(
  context,
  searchType,
  searchValue,
  filterSeason = null
) {
  const isSlash =
    typeof context.isChatInputCommand === 'function' &&
    context.isChatInputCommand();

  if (isSlash && !context.deferred && !context.replied) {
    await context.deferReply();
  }

  const userId = (
    isSlash ? context.user : context.author
  ).id;

  const reply = async payload => {
    if (!isSlash) return context.reply(payload);

    await context.editReply(
      typeof payload === 'string'
        ? { content: payload }
        : payload
    );

    return context.fetchReply();
  };

  try {
    searchValue = normalize(searchValue);

    if (!searchValue) {
      return reply('❌ Enter a search value.');
    }

    const db = await connectDB();

    const [owned, tags] = await Promise.all([
      db.collection('collections')
        .find({ userId })
        .toArray(),

      db.collection('cardtags')
        .find({ userId })
        .toArray()
    ]);

    const tagMap = new Map(
      tags.map(tag => [normalize(tag.code), tag])
    );

    const tagFor = entry =>
      tagMap.get(normalize(entry.code)) || {
        tagName:
          typeof entry.tag === 'string'
            ? entry.tag
            : entry.tag?.tagName,
        emoji: entry.tag?.emoji
      };

    const results = owned
      .map(resolveCard)
      .filter(item => {
        if (
          filterSeason !== null &&
          item.season !== filterSeason
        ) {
          return false;
        }

        const { card, entry } = item;

        if (searchType === 'name') {
          return normalize(card.name).includes(searchValue);
        }

        if (searchType === 'show') {
          const event = entry.event || card.event;

          // Event cards use the event itself as their series.
          const series = event
            ? eventName(event)
            : card.show || card.appearance || '';

          return (
            compact(series).includes(compact(searchValue)) ||
            (
              event &&
              compact(event).includes(compact(searchValue))
            )
          );
        }

        const tag = normalize(tagFor(entry).tagName);

        return searchValue === 'untag'
          ? !tag
          : tag === searchValue;
      });

    if (!results.length) {
      return reply(
        '❌ No matching cards found in your collection.'
      );
    }

    let page = 0;

    const totalPages = Math.ceil(
      results.length / CARDS_PER_PAGE
    );

    const createEmbed = () => {
      const lines = results
        .slice(
          page * CARDS_PER_PAGE,
          (page + 1) * CARDS_PER_PAGE
        )
        .map(({ entry, card, season, missing }) => {
          const event = entry.event || card.event;

          const series = event
            ? eventName(event)
            : card.show || card.appearance || 'Unknown series';

          const tier = event
            ? '🎃'
            : rarityEmojis[normalize(card.tier)] || '🎴';

          const tag = tagFor(entry);

          return (
            `${tag.emoji ? `${safe(tag.emoji)} ` : ''}` +
            `\`${safe(entry.code)}\` • ${tier} ` +
            `#${safe(entry.serial ?? '?')} ` +
            `**${safe(card.name)}**\n` +
            `↳ **${
              season === null ? 'Unknown season' : `S${season}`
            }** • ${safe(series)}` +
            `${missing ? ' • Catalog unavailable' : ''}`
          );
        });

      return new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle('🔎 Search Results')
        .setDescription(
          `Search: \`${safe(searchValue)}\` • ` +
          `${
            filterSeason === null
              ? 'All seasons'
              : `S${filterSeason}`
          }\n\n` +
          lines.join('\n\n')
        )
        .setFooter({
          text:
            `Page ${page + 1}/${totalPages} • ` +
            `${results.length} card(s) found`
        });
    };

    const buttons = (disabled = false) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('search_prev')
          .setLabel('⬅️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled || page === 0),

        new ButtonBuilder()
          .setCustomId('search_next')
          .setLabel('➡️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(
            disabled || page === totalPages - 1
          )
      );

    const msg = await reply({
      embeds: [createEmbed()],
      components: totalPages > 1 ? [buttons()] : [],
      allowedMentions: { parse: [] }
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      time: 60000,

      filter: interaction =>
        ['search_prev', 'search_next'].includes(
          interaction.customId
        )
    });

    collector.on('collect', async interaction => {
      try {
        if (interaction.user.id !== userId) {
          return await interaction.reply({
            content: '❌ This is not your search menu.',
            ephemeral: true
          });
        }

        await interaction.deferUpdate();
        collector.resetTimer();

        page = Math.max(
          0,
          Math.min(
            totalPages - 1,
            page + (
              interaction.customId === 'search_next'
                ? 1
                : -1
            )
          )
        );

        await interaction.editReply({
          embeds: [createEmbed()],
          components: [buttons()]
        });
      } catch (error) {
        console.error('[SEARCH] Pagination:', error);
      }
    });

    collector.on('end', () => {
      void msg.edit({
        components: [buttons(true)]
      }).catch(() => {});
    });
  } catch (error) {
    console.error('[SEARCH]', error);

    return reply(
      '❌ Search failed. Please try again.'
    ).catch(() => {});
  }
}

module.exports = {
  name: 'search',
  aliases: ['s'],
  data,

  async executeSlash(interaction) {
    return run(
      interaction,
      interaction.options.getString('type'),
      interaction.options.getString('query'),
      interaction.options.getInteger('season') ?? null
    );
  },

  async execute(context, args = []) {
    if (
      typeof context.isChatInputCommand === 'function' &&
      context.isChatInputCommand()
    ) {
      return module.exports.executeSlash(context);
    }

    const match = args
      .join(' ')
      .trim()
      .match(/^([nst]):\s*(.+)$/i);

    if (!match) {
      return context.reply(
        '❌ Use `search n:iron man`, ' +
        '`search s:halloween 26`, ' +
        'or `search t:untag`.'
      );
    }

    return run(
      context,
      {
        n: 'name',
        s: 'show',
        t: 'tag'
      }[match[1].toLowerCase()],
      match[2]
    );
  }
};