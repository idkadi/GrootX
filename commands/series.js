const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const crypto = require("crypto");
const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");
const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const SEASON_EMOJIS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const REWARDS = {
  common: 200,
  uncommon: 300,
  rare: 500,
  epic: 700,
  legendary: 1500
};

const TIER_EMOJIS = {
  common: "<:common:1504510702956839033>",
  uncommon: "<:uncommon:1504510929210052698>",
  rare: "<:rare:1504510606718275764>",
  epic: "<:epic:1504510771214680175>",
  legendary: "<:legendary:1504511435974377552>"
};

const clean = value =>
  String(value || "").trim().toLowerCase();

const clip = (value, length = 1024) =>
  String(value ?? "Unknown").slice(0, length) || "Unknown";

function normalizeSeason(card) {
  const value = clean(card.season ?? card.cardSeason ?? 0);
  if (value === "1" || value === "s1") return 1;
  if (value === "0" || value === "s0") return 0;
  return -1;
}

module.exports = {
  name: "series",

  data: new SlashCommandBuilder()
    .setName("series")
    .setDescription("Browse a series and claim its completion reward.")
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("Exact series name, including Halloween 26")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("season")
        .setDescription("Season; defaults to S1")
        .addChoices(
          { name: "Season 0", value: 0 },
          { name: "Season 1", value: 1 }
        )
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const userId = (slash ? message.user : message.author).id;

    const reply = payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      if (!slash) return message.reply(payload);
      if (message.deferred) return message.editReply(payload);
      if (message.replied) return message.followUp(payload);
      return message.reply(payload);
    };

    try {
      // Acknowledge slash commands before database work.
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      let season = slash
        ? message.options.getInteger("season") ?? 1
        : 1;

      let query;

      if (slash) {
        query = clean(message.options.getString("name", true));
      } else {
        const nameParts = args.filter(arg => {
          if (/^s:[01]$/i.test(arg)) {
            season = Number(arg.slice(2));
            return false;
          }
          return true;
        });

        query = clean(nameParts.join(" "));
      }

      if (!query) {
        return await reply(
          "❌ Provide a series name.\n" +
          "`!series Iron Man`\n" +
          "`!series Iron Man s:0`\n" +
          "`!series Halloween 26`\n" +
          "`/series name:Halloween 26`"
        );
      }

      // Halloween is one standalone series, always in S1.
      const halloween = query === "halloween 26";
      const event = halloween ? "halloween2026" : "";

      if (halloween) season = 1;

      const catalog = season === 0 ? season0Cards : season1Cards;

      const seriesCards = catalog
        .filter(card => {
          if (halloween) {
            return clean(card.event) === "halloween2026";
          }

          return (
            !clean(card.event) &&
            clean(card.appearance || card.show) === query
          );
        })
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

      if (!seriesCards.length) {
        return await reply(
          halloween
            ? "❌ No Halloween 26 cards were found in the S1 catalog."
            : `❌ Series not found in Season ${season}. Use the exact series name.`
        );
      }

      const seriesName = halloween
        ? "Halloween 26"
        : seriesCards[0].appearance || seriesCards[0].show || "Unknown";

      const seasonEmoji = SEASON_EMOJIS[season];

      const totalReward = seriesCards.reduce(
        (total, card) => total + (REWARDS[clean(card.tier)] || 0),
        0
      );

      const db = await connectDB();
      const collectionsCol = db.collection("collections");
      const balancesCol = db.collection("balances");
      const rewardsCol = db.collection("seriesRewards");

      const claimKey = crypto
        .createHash("sha256")
        .update(JSON.stringify([seriesName, season, event]))
        .digest("hex");

      const claimField = `seriesClaims.${claimKey}`;

      const rewardFilter = {
        userId,
        series: seriesName,
        season,
        ...(event
          ? { event }
          : {
              $or: [
                { event: "" },
                { event: null },
                { event: { $exists: false } }
              ]
            })
      };

      let ownedIds = new Set();
      let alreadyClaimed = false;

      async function refresh() {
        const [ownedCards, oldClaim, balanceClaim] = await Promise.all([
          collectionsCol.find(
            { userId },
            {
              projection: {
                cardId: 1,
                season: 1,
                cardSeason: 1,
                event: 1
              }
            }
          ).toArray(),

          rewardsCol.findOne(rewardFilter),

          balancesCol.findOne(
            { userId },
            { projection: { [claimField]: 1 } }
          )
        ]);

        ownedIds = new Set(
          ownedCards
            .filter(card =>
              normalizeSeason(card) === season &&
              clean(card.event) === event
            )
            .map(card => String(card.cardId))
        );

        alreadyClaimed = Boolean(
          oldClaim || balanceClaim?.seriesClaims?.[claimKey]
        );
      }

      await refresh();

      const owns = card => ownedIds.has(String(card.id));

      const ownedCount = () =>
        seriesCards.filter(owns).length;

      const completed = () =>
        seriesCards.every(owns);

      const perPage = 15;
      const totalPages = Math.ceil(seriesCards.length / perPage);

      let page = 0;
      let imageIndex = 0;
      let mode = "list";
      let busy = false;
      let expired = false;

      function statusText() {
        if (alreadyClaimed) return "Reward already claimed.";
        if (completed()) return "Completed. Claim your reward!";
        return "Collect every card in this series to claim the reward.";
      }

      function components() {
        const itemCount = mode === "list"
          ? totalPages
          : seriesCards.length;

        const navigation = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("series_prev")
            .setLabel("Previous")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(expired || itemCount <= 1),

          new ButtonBuilder()
            .setCustomId("series_view")
            .setLabel(mode === "list" ? "Image View" : "List View")
            .setEmoji("🖼️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(expired),

          new ButtonBuilder()
            .setCustomId("series_next")
            .setLabel("Next")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(expired || itemCount <= 1)
        );

        const claim = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("series_claim")
            .setLabel(alreadyClaimed ? "Claimed" : "Claim Reward")
            .setEmoji(alreadyClaimed ? "✅" : "🎁")
            .setStyle(
              alreadyClaimed
                ? ButtonStyle.Secondary
                : ButtonStyle.Success
            )
            .setDisabled(
              expired || alreadyClaimed || !completed()
            )
        );

        return [navigation, claim];
      }

      function baseEmbed() {
        return new EmbedBuilder()
          .setColor(
            halloween ? 0xf28c28 : completed() ? 0x57f287 : 0x00aeff
          )
          .addFields(
            {
              name: "🗓️ Season",
              value: `${seasonEmoji} **Season ${season}**`,
              inline: true
            },
            {
              name: "🎁 Completion Reward",
              value:
                "<:grootcoin:1504742213110861834> " +
                `**${totalReward.toLocaleString()} Coins**`,
              inline: true
            },
            {
              name: "📊 Progress",
              value: `**${ownedCount()}/${seriesCards.length}**`,
              inline: true
            }
          )
          .setTimestamp();
      }

      async function getPayload(content = "") {
        const embed = baseEmbed();
        const files = [];

        if (mode === "list") {
          const start = page * perPage;

          const list = seriesCards
            .slice(start, start + perPage)
            .map((card, index) =>
              `${owns(card) ? "✅" : "☐"} ` +
              `**${start + index + 1}. ${clip(card.name, 100)}** ` +
              `${TIER_EMOJIS[clean(card.tier)] || "🎴"}`
            )
            .join("\n");

          embed
            .setTitle(
              clip(
                `📘 ${seasonEmoji} ${halloween ? "🎃 " : ""}${seriesName}`,
                256
              )
            )
            .setDescription(list)
            .setFooter({
              text: clip(
                `Season ${season} • Page ${page + 1}/${totalPages} • ` +
                statusText(),
                2048
              )
            });
        } else {
          const card = seriesCards[imageIndex];

          // Catalog previews use their default season/event frame.
          const buffer = await renderCard(
            {
              ...card,
              season,
              event: event || null
            },
            "?",
            {
              season,
              event: event || null
            }
          );

          const imageName = "series-card.png";

          files.push(
            new AttachmentBuilder(buffer, { name: imageName })
          );

          embed
            .setTitle(
              clip(
                `${owns(card) ? "✅" : "☐"} ${seasonEmoji} ${card.name}`,
                256
              )
            )
            .setDescription(
              `${TIER_EMOJIS[clean(card.tier)] || "🎴"} ` +
              `**${clip(card.tier, 50)}**\n\n` +
              `Series: **${clip(seriesName, 150)}**\n` +
              `Card: **${imageIndex + 1}/${seriesCards.length}**\n` +
              `Status: **${owns(card) ? "Owned" : "Missing"}**`
            )
            .setImage(`attachment://${imageName}`)
            .setFooter({
              text: clip(
                `Season ${season} • ${statusText()}`,
                2048
              )
            });
        }

        return {
          content,
          embeds: [embed],
          attachments: [],
          files,
          components: components(),
          allowedMentions: { parse: [], repliedUser: false }
        };
      }

      let menu;

      if (slash) {
        await reply(await getPayload());
        menu = await message.fetchReply();
      } else {
        menu = await reply(await getPayload());
      }

      const collector = menu.createMessageComponentCollector({
        time: 120000,
        filter: interaction =>
          [
            "series_prev",
            "series_next",
            "series_view",
            "series_claim"
          ].includes(interaction.customId)
      });

      collector.on("collect", async interaction => {
        try {
          if (interaction.user.id !== userId) {
            return await interaction.reply({
              content: "❌ This series menu is not for you.",
              ephemeral: true
            });
          }

          if (busy) {
            return await interaction.reply({
              content: "⏳ Please wait for the current update.",
              ephemeral: true
            });
          }

          busy = true;
          collector.resetTimer();

          // Acknowledge before image rendering or reward queries.
          await interaction.deferUpdate();

          if (interaction.customId === "series_view") {
            mode = mode === "list" ? "image" : "list";
            page = 0;
            imageIndex = 0;
          } else if (
            interaction.customId === "series_next" ||
            interaction.customId === "series_prev"
          ) {
            const step = interaction.customId === "series_next" ? 1 : -1;

            if (mode === "list") {
              page = (page + step + totalPages) % totalPages;
            } else {
              imageIndex =
                (imageIndex + step + seriesCards.length) %
                seriesCards.length;
            }
          } else if (interaction.customId === "series_claim") {
            // Recheck ownership and existing claims immediately before payment.
            await refresh();

            if (alreadyClaimed || !completed()) {
              await interaction.editReply(await getPayload());

              return await interaction.followUp({
                content: alreadyClaimed
                  ? "❌ You already claimed this series reward."
                  : "❌ You no longer own every card in this series.",
                ephemeral: true
              });
            }

            await balancesCol.updateOne(
              { userId },
              { $setOnInsert: { userId, coins: 0 } },
              { upsert: true }
            );

            // Credit coins and record the claim atomically.
            // Concurrent menus cannot pay the same reward twice.
            const payment = await balancesCol.updateOne(
              {
                userId,
                [claimField]: { $exists: false }
              },
              {
                $inc: { coins: totalReward },
                $set: {
                  [claimField]: {
                    reward: totalReward,
                    claimedAt: Date.now()
                  }
                }
              }
            );

            alreadyClaimed = true;

            if (!payment.modifiedCount) {
              await interaction.editReply(await getPayload());

              return await interaction.followUp({
                content: "❌ This series reward has already been claimed.",
                ephemeral: true
              });
            }

            // Preserve compatibility with existing series reward records.
            // The balance claim remains authoritative if this write fails.
            try {
              await rewardsCol.updateOne(
                {
                  userId,
                  series: seriesName,
                  season,
                  event
                },
                {
                  $setOnInsert: {
                    reward: totalReward,
                    claimedAt: Date.now()
                  }
                },
                { upsert: true }
              );
            } catch (error) {
              console.error("[SERIES] Reward record failed:", error);
            }

            return await interaction.editReply(
              await getPayload(
                `🎉 You claimed **${totalReward.toLocaleString()} Coins** ` +
                `for completing **${clip(seriesName, 150)} — Season ${season}**!`
              )
            );
          }

          await interaction.editReply(await getPayload());
        } catch (error) {
          console.error("[SERIES] Button failed:", error);

          const payload = {
            content: "❌ Could not update this series. Please try again.",
            ephemeral: true
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload).catch(() => {});
          } else {
            await interaction.reply(payload).catch(() => {});
          }
        } finally {
          if (interaction.user.id === userId && interaction.deferred) {
            busy = false;
          }
        }
      });

      collector.on("end", async () => {
        expired = true;
        await menu.edit({ components: [] }).catch(() => {});
      });
    } catch (error) {
      console.error("[SERIES]", error);

      await reply(
        "❌ Could not open this series. Please try again."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;