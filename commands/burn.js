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

const pendingBurns = new Map();

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

module.exports = {
  name: "burn",

  data: new SlashCommandBuilder()
    .setName("burn")
    .setDescription(
      "Burn an owned card for coins and shards after confirmation."
    )
    .addStringOption(option =>
      option
        .setName("code")
        .setDescription(
          "Card code; omit to burn your latest collected card"
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

    const token = crypto.randomBytes(8).toString("hex");

    const release = () => {
      if (pendingBurns.get(userId) === token) {
        pendingBurns.delete(userId);
      }
    };

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      if (pendingBurns.has(userId)) {
        return await reply(
          "⚠️ Confirm or cancel your pending burn first."
        );
      }

      pendingBurns.set(userId, token);

      const db = await connectDB();
      const col = db.collection("collections");

      const code = clean(
        slash ? message.options.getString("code") : args[0]
      );

      const entry = code
        ? await col.findOne({ userId, code })
        : await col.findOne(
            { userId },
            { sort: { _id: -1 } }
          );

      if (!entry) {
        release();
        return await reply(
          "❌ Card not found in your collection."
        );
      }

      if (entry.favorite) {
        release();
        return await reply(
          "⭐ Unfavorite this card before burning it."
        );
      }

      const seasonValue = clean(
        entry.season ?? entry.cardSeason ?? 0
      );

      const season = ["1", "s1"].includes(seasonValue)
        ? 1
        : ["0", "s0"].includes(seasonValue)
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

      // Every event receives Legendary rewards.
      const tier = event
        ? "legendary"
        : clean(card?.tier || entry.tier);

      const reward = REWARDS[tier];

      // Validate rewards before deleting anything.
      if (!reward) {
        release();
        return await reply(
          "❌ This card's reward tier could not be verified. " +
          "Nothing was burned; please report its code."
        );
      }

      if (!db.client?.startSession) {
        release();
        return await reply(
          "❌ Safe burn transactions are unavailable. " +
          "Nothing was burned; check the database connection."
        );
      }

      const name = String(
        card?.name || entry.name || `Card ${entry.cardId}`
      ).slice(0, 150);

      const seasonText = season === null
        ? "Unknown season"
        : `${SEASONS[season]} Season ${season}`;

      const eventText = event
        ? `\n🎃 ${
            event === "halloween2026"
              ? "Halloween 26"
              : event.slice(0, 80)
          } • Legendary rewards`
        : "";

      const confirm = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("⚠️ Confirm Burn")
        .setDescription(
          `**${name}**\n` +
          `\`${entry.code}\` • #${entry.serial ?? "?"}\n` +
          `${seasonText}${eventText}\n\n` +
          `Rewards: **${reward[0]}–${reward[1]} coins** and ` +
          `**${reward[2]}–${reward[3]} random shards**.\n` +
          "This permanently destroys the card."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`burn_yes_${token}`)
          .setLabel("Confirm Burn")
          .setEmoji("🔥")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(`burn_no_${token}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary)
      );

      let menu;

      if (slash) {
        await reply({
          embeds: [confirm],
          components: [row]
        });
        menu = await message.fetchReply();
      } else {
        menu = await reply({
          embeds: [confirm],
          components: [row]
        });
      }

      let processing = false;

      const collector = menu.createMessageComponentCollector({
        time: 30000,
        filter: interaction =>
          [
            `burn_yes_${token}`,
            `burn_no_${token}`
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
              content: "⏳ This burn is already processing.",
              ephemeral: true
            });
          }

          processing = true;
          locked = true;

          // Acknowledge before database work.
          await interaction.deferUpdate();
          collector.stop("processing");

          if (interaction.customId === `burn_no_${token}`) {
            return await interaction.editReply({
              content: "❌ Burn canceled.",
              embeds: [],
              components: []
            });
          }

          const coins = random(reward[0], reward[1]);
          const shards = random(reward[2], reward[3]);

          const shardTypes = Object.keys(SHARDS);
          const shardType =
            shardTypes[random(0, shardTypes.length - 1)];

          const session = db.client.startSession();

          try {
            // Card deletion and rewards commit together.
            await session.withTransaction(async () => {
              const fresh = await col.findOne(
                {
                  _id: entry._id,
                  userId,
                  code: entry.code
                },
                { session }
              );

              if (!fresh) {
                throw new Error("CARD_CHANGED");
              }

              if (fresh.favorite) {
                throw new Error("FAVORITED");
              }

              if (
                fresh.cardId !== entry.cardId ||
                clean(fresh.event) !== clean(entry.event) ||
                clean(
                  fresh.season ?? fresh.cardSeason ?? 0
                ) !== seasonValue ||
                clean(fresh.tier) !== clean(entry.tier)
              ) {
                throw new Error("CARD_CHANGED");
              }

              const removed = await col.deleteOne(
                {
                  _id: entry._id,
                  userId,
                  code: entry.code,
                  favorite: { $ne: true }
                },
                { session }
              );

              if (!removed.deletedCount) {
                throw new Error("CARD_CHANGED");
              }

              await db.collection("balances").updateOne(
                { userId },
                { $inc: { coins } },
                { upsert: true, session }
              );

              await db.collection("inventory").updateOne(
                { userId },
                {
                  $inc: {
                    [`items.${shardType}`]: shards
                  }
                },
                { upsert: true, session }
              );

              await db.collection("cardtags").deleteMany(
                {
                  userId,
                  code: entry.code
                },
                { session }
              );
            });

            committed = true;
          } finally {
            await session.endSession();
          }

          // Existing album helper does not expose a session.
          let cleanupFailed = false;

          try {
            await removeCardFromAlbums(
              db,
              userId,
              entry.code
            );
          } catch (error) {
            cleanupFailed = true;
            console.error("[BURN] Album cleanup:", error);
          }

          const shardName = shardType
            .split("_")
            .map(word =>
              word[0].toUpperCase() + word.slice(1)
            )
            .join(" ");

          const result = new EmbedBuilder()
            .setColor(0xff5500)
            .setTitle("🔥 Card Burned")
            .setDescription(
              `Burned **${name}**\n` +
              `\`${entry.code}\`\n` +
              `${seasonText}${eventText}`
            )
            .addFields(
              {
                name: "<:grootcoin:1504742213110861834> Coins",
                value: String(coins),
                inline: true
              },
              {
                name: "✨ Shards",
                value:
                  `${SHARDS[shardType]} ${shardName} ×${shards}`,
                inline: true
              }
            )
            .setFooter({
              text: cleanupFailed
                ? "Rewards saved. Album cleanup failed; report this card code."
                : "The card has been permanently destroyed."
            });

          await interaction.editReply({
            content: "",
            embeds: [result],
            components: []
          });
        } catch (error) {
          console.error("[BURN]", error);

          const content = committed
            ? "✅ Card burned and rewards saved. The display could not update; check your balance and inventory."
            : error.message === "FAVORITED"
              ? "⭐ This card is now favorited. Nothing was burned."
              : error.message === "CARD_CHANGED"
                ? "❌ This card changed ownership or data. Nothing was burned."
                : "❌ Burn failed. Check your collection and bot logs before trying again.";

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
          content: "⌛ Burn confirmation expired.",
          embeds: [],
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      release();
      console.error("[BURN] Setup:", error);

      await reply(
        "❌ Could not open the burn confirmation. Nothing was burned."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;