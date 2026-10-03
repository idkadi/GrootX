const cards0 = require("../data/cards");
const cards1 = require("../data/season1");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const { removeCardFromAlbums } = require("../utils/albumUtils");
const crypto = require("crypto");

const pendingBulkBurns = new Map();

const SEASONS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const REWARDS = {
  common: [25, 50, 3, 5],
  uncommon: [50, 100, 5, 8],
  rare: [100, 200, 10, 15],
  epic: [250, 500, 15, 25],
  legendary: [1000, 1500, 50, 100]
};

const SHARDS = {
  space_shard: "<:spaceshards:1504767068480995429>",
  mind_shard: "<:mindsshards:1504767348517638195>",
  reality_shard: "<:realityshards:1504767197883531386>",
  power_shard: "<:powershards:1504767126462926949>",
  time_shard: "<:timeshards:1504766994074046525>",
  soul_shard: "<:soulshards:1504767256775757845>"
};

const clean = value =>
  String(value || "").trim().toLowerCase();

const random = (min, max) =>
  crypto.randomInt(min, max + 1);

function rewardFor(entry) {
  const value = clean(
    entry.season ?? entry.cardSeason ?? 0
  );

  const season = ["1", "s1"].includes(value)
    ? 1
    : ["0", "s0"].includes(value)
      ? 0
      : null;

  const catalog = season === 1
    ? cards1
    : season === 0
      ? cards0
      : [];

  const matches = catalog.filter(card =>
    card.id != null &&
    entry.cardId != null &&
    String(card.id) === String(entry.cardId)
  );

  let card = matches.find(
    card => clean(card.event) === clean(entry.event)
  );

  if (!card && !entry.event && matches.length === 1) {
    card = matches[0];
  }

  const event = clean(entry.event || card?.event);

  const tier = event
    ? "legendary"
    : clean(card?.tier || entry.tier);

  return {
    range: REWARDS[tier],
    season,
    event
  };
}

module.exports = {
  name: "burnall",
  aliases: ["ball"],

  data: new SlashCommandBuilder()
    .setName("burnall")
    .setDescription(
      "Burn all eligible non-favorite cards after confirmation."
    ),

  async execute(message) {
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

    const token = crypto.randomBytes(8).toString("hex");

    const release = () => {
      if (pendingBulkBurns.get(userId) === token) {
        pendingBulkBurns.delete(userId);
      }
    };

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      if (pendingBulkBurns.has(userId)) {
        return await reply(
          "⚠️ Confirm or cancel your pending bulk burn first."
        );
      }

      pendingBulkBurns.set(userId, token);

      const db = await connectDB();

      if (!db.client?.startSession) {
        release();

        return await reply(
          "❌ Safe burn transactions are unavailable. " +
          "Nothing was burned."
        );
      }

      const col = db.collection("collections");
      const all = await col.find({ userId }).toArray();

      const eligible = all.filter(
        entry => !entry.favorite && rewardFor(entry).range
      );

      if (!eligible.length) {
        release();

        return await reply(
          "⭐ No eligible non-favorite cards found. " +
          "Cards with unverifiable reward data are kept safe."
        );
      }

      const protectedCount = all.filter(
        entry => entry.favorite
      ).length;

      const unknownCount =
        all.length - eligible.length - protectedCount;

      const totals = {
        s0: 0,
        s1: 0,
        event: 0
      };

      let minCoins = 0;
      let maxCoins = 0;

      for (const entry of eligible) {
        const info = rewardFor(entry);

        if (info.event) {
          totals.event++;
        } else if (info.season === 0) {
          totals.s0++;
        } else if (info.season === 1) {
          totals.s1++;
        }

        minCoins += info.range[0];
        maxCoins += info.range[1];
      }

      const warning = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("⚠️ Confirm Burn All")
        .setDescription(
          `Permanently burn **${eligible.length} cards**?\n\n` +
          `${SEASONS[0]} S0: **${totals.s0}**\n` +
          `${SEASONS[1]} S1: **${totals.s1}**\n` +
          `🎃 Events: **${totals.event}** (Legendary rewards)\n\n` +
          `⭐ Favorites protected: **${protectedCount}**\n` +
          `Unverifiable cards skipped: **${unknownCount}**\n` +
          `Coins: **${minCoins.toLocaleString()}–` +
          `${maxCoins.toLocaleString()}**, plus shards.\n\n` +
          "Only cards in this confirmation can be burned. " +
          "This cannot be undone."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ball_yes_${token}`)
          .setLabel(
            `Burn ${eligible.length} Cards`.slice(0, 80)
          )
          .setEmoji("🔥")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`ball_no_${token}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );

      let menu;

      if (slash) {
        await reply({
          embeds: [warning],
          components: [row]
        });

        menu = await message.fetchReply();
      } else {
        menu = await reply({
          embeds: [warning],
          components: [row]
        });
      }

      let processing = false;

      // Freeze the confirmed set. Newly collected cards stay safe.
      const ids = eligible.map(entry => entry._id);

      const collector = menu.createMessageComponentCollector({
        time: 30000,
        filter: interaction =>
          [
            `ball_yes_${token}`,
            `ball_no_${token}`
          ].includes(interaction.customId)
      });

      collector.on("collect", async interaction => {
        let locked = false;
        let committed = false;

        try {
          if (interaction.user.id !== userId) {
            return await interaction.reply({
              content: "❌ This is not your burn confirmation.",
              ephemeral: true
            });
          }

          if (processing) {
            return await interaction.reply({
              content: "⏳ This bulk burn is processing.",
              ephemeral: true
            });
          }

          processing = true;
          locked = true;

          await interaction.deferUpdate();
          collector.stop("processing");

          if (interaction.customId === `ball_no_${token}`) {
            return await interaction.editReply({
              content: "❌ Burn all canceled.",
              embeds: [],
              components: []
            });
          }

          let burned = [];
          let totalCoins = 0;
          let totalShards = {};

          const session = db.client.startSession();

          try {
            await session.withTransaction(async () => {
              // MongoDB may retry the transaction.
              burned = [];
              totalCoins = 0;
              totalShards = {};

              const fresh = await col.find(
                {
                  userId,
                  _id: { $in: ids },
                  favorite: { $ne: true }
                },
                { session }
              ).toArray();

              for (const entry of fresh) {
                const info = rewardFor(entry);

                if (!info.range) continue;

                const deletion = await col.deleteOne(
                  {
                    _id: entry._id,
                    userId,
                    favorite: { $ne: true }
                  },
                  { session }
                );

                if (!deletion.deletedCount) continue;

                const range = info.range;
                const types = Object.keys(SHARDS);

                const type =
                  types[random(0, types.length - 1)];

                totalCoins += random(range[0], range[1]);

                totalShards[type] =
                  (totalShards[type] || 0) +
                  random(range[2], range[3]);

                burned.push(entry);
              }

              if (!burned.length) return;

              await db.collection("balances").updateOne(
                { userId },
                {
                  $inc: { coins: totalCoins }
                },
                { upsert: true, session }
              );

              const increment = Object.fromEntries(
                Object.entries(totalShards).map(
                  ([key, value]) => [
                    `items.${key}`,
                    value
                  ]
                )
              );

              await db.collection("inventory").updateOne(
                { userId },
                {
                  $inc: increment
                },
                { upsert: true, session }
              );

              await db.collection("cardtags").deleteMany(
                {
                  userId,
                  code: {
                    $in: burned.map(entry => entry.code)
                  }
                },
                { session }
              );
            });

            committed = true;
          } finally {
            await session.endSession();
          }

          let cleanupFailures = 0;

          for (const entry of burned) {
            try {
              await removeCardFromAlbums(
                db,
                userId,
                entry.code
              );
            } catch (error) {
              cleanupFailures++;

              console.error(
                `[BURNALL] Album cleanup ${entry.code}:`,
                error
              );
            }
          }

          const shardText = Object.entries(totalShards)
            .map(([type, amount]) => {
              const name = type
                .split("_")
                .map(word =>
                  word[0].toUpperCase() + word.slice(1)
                )
                .join(" ");

              return `${SHARDS[type]} **${name}** ×${amount}`;
            })
            .join("\n");

          const result = new EmbedBuilder()
            .setColor(0xff5500)
            .setTitle("🔥 Burn All Complete")
            .addFields(
              {
                name: "🔥 Cards Burned",
                value: String(burned.length),
                inline: true
              },
              {
                name: "🪙 Coins Earned",
                value: totalCoins.toLocaleString(),
                inline: true
              },
              {
                name: "🛡️ Confirmation Cards Kept",
                value: String(
                  eligible.length - burned.length
                ),
                inline: true
              },
              {
                name: "✨ Shards Earned",
                value: shardText || "None"
              }
            )
            .setFooter({
              text: cleanupFailures
                ? `Rewards saved. Album cleanup failed for ${cleanupFailures} cards; check logs.`
                : "Favorites and cards collected after confirmation were kept safe."
            })
            .setTimestamp();

          await interaction.editReply({
            content: "",
            embeds: [result],
            components: []
          });
        } catch (error) {
          console.error("[BURNALL]", error);

          const content = committed
            ? "✅ Bulk burn and rewards were saved, but the display could not update. Check your collection, balance and inventory."
            : "❌ Bulk burn failed. Check your collection and bot logs before retrying.";

          if (interaction.deferred) {
            await interaction.editReply({
              content,
              embeds: [],
              components: []
            }).catch(() => {});
          } else {
            await interaction.reply({
              content,
              ephemeral: true
            }).catch(() => {});
          }
        } finally {
          if (locked) release();
        }
      });

      collector.on("end", async (_, reason) => {
        if (reason === "processing") return;

        release();

        await menu.edit({
          content: "⌛ Burn all confirmation expired.",
          embeds: [],
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      release();
      console.error("[BURNALL] Setup:", error);

      await reply(
        "❌ Could not open bulk burn confirmation. Nothing was burned."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;