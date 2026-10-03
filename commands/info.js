const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder
} = require("discord.js");

const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const renderInfo = require("../utils/Inforender");
const renderCard = require("../utils/renderCard");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const toArray = data =>
  Array.isArray(data) ? data : data?.cards || [];

const databases = [
  toArray(season0Cards),
  toArray(season1Cards)
];

const textKey = value =>
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

const appearance = card =>
  card.appearance || card.show || "Unknown";

const halloween = card =>
  card.event === "halloween2026";

const colors = {
  common: 0xcd7f32,
  uncommon: 0xc0c0c0,
  rare: 0xffd700,
  epic: 0x8000ff,
  legendary: 0xe53935
};

function searchGroups(query, requestedSeason = null) {
  const groups = new Map();

  for (const [season, cards] of databases.entries()) {
    for (const card of cards) {
      // Keep appearances, rarities and event variants distinct.
      // Matching S0/S1 cards share one result.
      const base = [
        textKey(card.name),
        textKey(appearance(card)),
        textKey(card.tier),
        textKey(card.event)
      ].join("|");

      let key = base;
      let suffix = 0;

      while (groups.get(key)?.cards[season]) {
        key = `${base}|${++suffix}`;
      }

      if (!groups.has(key)) {
        groups.set(key, {
          cards: {},
          name: card.name
        });
      }

      groups.get(key).cards[season] = card;
    }
  }

  const q = textKey(query);

  return [...groups.values()]
    .filter(group => {
      if (
        requestedSeason !== null &&
        !group.cards[requestedSeason]
      ) {
        return false;
      }

      return Object.values(group.cards).some(card =>
        [
          card.name,
          ...(Array.isArray(card.aka) ? card.aka : [])
        ].some(name => textKey(name).includes(q))
      );
    })
    .sort((a, b) =>
      Number(textKey(b.name) === q) -
        Number(textKey(a.name) === q) ||
      String(a.name).localeCompare(String(b.name))
    );
}

async function execute(message, args = []) {
  const slash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user = slash ? message.user : message.author;

  if (slash && !message.deferred && !message.replied) {
    await message.deferReply();
  }

  const reply = payload => {
    if (typeof payload === "string") {
      payload = { content: payload };
    }

    if (!slash) return message.reply(payload);

    return message.deferred
      ? message.editReply(payload)
      : message.followUp(payload);
  };

  try {
    const seasonArg = slash
      ? message.options.getString("s")
      : args
          .find(argument => /^s:[01]$/i.test(argument))
          ?.slice(2);

    const requestedSeason =
      seasonArg == null ? null : Number(seasonArg);

    const query = slash
      ? message.options.getString("name", true)
      : args
          .filter(argument => !/^s:[01]$/i.test(argument))
          .join(" ")
          .trim();

    if (!textKey(query)) {
      return reply(
        "❌ Provide a name. Example: `info spider-man`."
      );
    }

    const groups = searchGroups(query, requestedSeason);

    if (!groups.length) {
      return reply("❌ No matching cards found.");
    }

    let page = 0;
    let selected = groups.length === 1 ? 0 : null;
    let season = 0;
    let busy = false;

    const pageSize = 15;
    const pageCount = Math.ceil(groups.length / pageSize);
    const cache = new Map();

    // Open S0 first unless S1 was explicitly requested.
    // S1-only cards open S1 automatically.
    const initialSeason = group =>
      requestedSeason ?? (group.cards[0] ? 0 : 1);

    if (selected !== null) {
      season = initialSeason(groups[selected]);
    }

    const button = (id, label, disabled = false) =>
      new ButtonBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);

    function menuPayload() {
      const current = groups.slice(
        page * pageSize,
        (page + 1) * pageSize
      );

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle("🔎 Choose a card")
        .setDescription(
          current
            .map((group, index) => {
              const card = group.cards[0] || group.cards[1];

              const availableSeasons = Object.keys(group.cards)
                .map(value => SEASON_EMOJIS[Number(value)])
                .join(" ");

              return (
                `**${page * pageSize + index + 1}. ` +
                `${card.name}** • ${appearance(card)}\n` +
                `└ ${
                  halloween(card)
                    ? "🎃 Halloween"
                    : card.tier || "Unknown"
                } • ${availableSeasons}`
              );
            })
            .join("\n\n")
        )
        .setFooter({
          text:
            `Page ${page + 1}/${pageCount} • ` +
            `${groups.length} variants • Choose below`
        });

      const select = new StringSelectMenuBuilder()
        .setCustomId("info_pick")
        .setPlaceholder("Choose a character variant")
        .addOptions(
          current.map((group, index) => {
            const card = group.cards[0] || group.cards[1];

            return {
              label: String(card.name).slice(0, 100),
              description: (
                `${appearance(card)} • ` +
                `${
                  halloween(card)
                    ? "Halloween"
                    : card.tier || "Unknown"
                }`
              ).slice(0, 100),
              value: String(page * pageSize + index)
            };
          })
        );

      return {
        content: slash
          ? null
          : "Choose below, or reply with the card's number.",
        embeds: [embed],
        attachments: [],
        files: [],
        components: [
          new ActionRowBuilder().addComponents(select),

          new ActionRowBuilder().addComponents(
            button("info_prev", "Previous", page === 0),
            button(
              "info_next",
              "Next",
              page === pageCount - 1
            )
          )
        ]
      };
    }

    async function cardPayload() {
      const group = groups[selected];
      const card = group.cards[season];
      const key = `${selected}:${season}`;

      if (!cache.has(key)) {
        const data = {
          ...card,
          season
        };

        const buffer = halloween(card)
          ? await renderCard(
              data,
              "?",
              {
                season,
                event: card.event
              }
            )
          : await renderInfo(data, season);

        cache.set(key, buffer);

        if (cache.size > 4) {
          cache.delete(cache.keys().next().value);
        }
      }

      const imageName = `info-s${season}.png`;

      const embed = new EmbedBuilder()
        .setColor(
          halloween(card)
            ? 0xff8c00
            : colors[String(card.tier).toLowerCase()] ||
              0xffffff
        )
        .setTitle(`${SEASON_EMOJIS[season]} ${card.name}`)
        .setDescription(
          `✨ **AKA:** ${
            Array.isArray(card.aka) && card.aka.length
              ? card.aka.join(", ")
              : "None"
          }`
        )
        .addFields(
          {
            name: "🎬 Appearance",
            value: String(appearance(card)),
            inline: true
          },
          {
            name: "⭐ Tier",
            value: halloween(card)
              ? "🎃 Halloween"
              : String(card.tier || "Unknown"),
            inline: true
          },
          {
            name: "🆔 Card ID",
            value: String(card.id),
            inline: true
          },
          {
            name: "🗓️ Season",
            value:
              `${SEASON_EMOJIS[season]} Season ${season}`,
            inline: true
          }
        )
        .setImage(`attachment://${imageName}`)
        .setFooter({
          text:
            "GrootX • Switch between available seasons below"
        });

      const row = new ActionRowBuilder().addComponents(
        ...[0, 1].map(value =>
          button(
            `info_season_${value}`,
            `Season ${value}`,
            value === season || !group.cards[value]
          )
            .setEmoji(SEASON_EMOJIS[value])
            .setStyle(
              value === season
                ? ButtonStyle.Primary
                : ButtonStyle.Secondary
            )
        )
      );

      if (groups.length > 1) {
        row.addComponents(
          button("info_back", "Back to results")
        );
      }

      return {
        content: null,
        embeds: [embed],
        attachments: [],
        files: [
          new AttachmentBuilder(cache.get(key), {
            name: imageName
          })
        ],
        components: [row]
      };
    }

    const payload = () =>
      selected === null ? menuPayload() : cardPayload();

    const sent = await reply(await payload());

    const collector = sent.createMessageComponentCollector({
      time: 180000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: "❌ Open your own info menu.",
          ephemeral: true
        });
      }

      let acquired = false;

      try {
        // Acknowledge before rendering the selected card.
        await interaction.deferUpdate();

        if (busy || collector.ended) return;

        busy = true;
        acquired = true;

        if (interaction.customId === "info_prev") {
          page = Math.max(0, page - 1);
        } else if (interaction.customId === "info_next") {
          page = Math.min(pageCount - 1, page + 1);
        } else if (interaction.customId === "info_pick") {
          selected = Number(interaction.values[0]);
          season = initialSeason(groups[selected]);
        } else if (interaction.customId === "info_back") {
          selected = null;
        } else if (
          interaction.customId.startsWith("info_season_")
        ) {
          const next = Number(
            interaction.customId.slice(-1)
          );

          if (
            selected === null ||
            !groups[selected].cards[next]
          ) {
            return;
          }

          season = next;
        }

        const nextPayload = await payload();

        if (!collector.ended) {
          await interaction.editReply(nextPayload);
        }
      } catch (error) {
        console.error("[INFO] Menu/render error:", error);

        await interaction.followUp({
          content:
            "❌ Could not render that card. Check its " +
            "image/frame files and try again.",
          ephemeral: true
        }).catch(() => {});
      } finally {
        if (acquired) busy = false;
      }
    });

    let replies;

    if (!slash && groups.length > 1) {
      replies = message.channel.createMessageCollector({
        time: 180000,
        filter: response =>
          response.author.id === user.id &&
          /^\d+$/.test(response.content.trim()) &&
          (
            !response.reference?.messageId ||
            response.reference.messageId === sent.id
          )
      });

      replies.on("collect", async response => {
        const choice =
          Number(response.content.trim()) - 1;

        if (
          busy ||
          selected !== null ||
          collector.ended ||
          choice < 0 ||
          choice >= groups.length
        ) {
          return;
        }

        busy = true;

        try {
          selected = choice;
          season = initialSeason(groups[selected]);

          const next = await cardPayload();

          if (!collector.ended) {
            await sent.edit(next);
          }
        } catch (error) {
          console.error(
            "[INFO] Number selection:",
            error
          );
        } finally {
          busy = false;
        }
      });
    }

    collector.on("end", () => {
      replies?.stop();

      sent
        .edit({ components: [] })
        .catch(() => {});
    });
  } catch (error) {
    console.error("[INFO]", error);

    return reply({
      content:
        "❌ Could not load card info. Please try again."
    });
  }
}

module.exports = {
  name: "info",
  aliases: ["i"],

  data: new SlashCommandBuilder()
    .setName("info")
    .setDescription(
      "Search character cards and switch seasons."
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Character name")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("s")
        .setDescription("Optional starting season")
        .addChoices(
          { name: "Season 0", value: "0" },
          { name: "Season 1", value: "1" }
        )
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute
};