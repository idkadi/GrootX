const season0Cards = require("../data/cards");
const season1Cards = require("../data/season1");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

const SEASONS = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const rarityEmojis = {
  common: "<:common:1504510702956839033>",
  uncommon: "<:uncommon:1504510929210052698>",
  rare: "<:rare:1504510606718275764>",
  epic: "<:epic:1504510771214680175>",
  legendary: "<:legendary:1504511435974377552>"
};

const clean = value =>
  String(value || "").trim().toLowerCase();

const clip = (value, size) =>
  String(value ?? "Unknown").slice(0, size);

const PER_PAGE = 10;

function describe(entry) {
  const seasonValue = clean(
    entry.season ?? entry.cardSeason ?? 0
  );

  const season = ["1", "s1"].includes(seasonValue)
    ? 1
    : ["0", "s0"].includes(seasonValue)
      ? 0
      : null;

  const catalog = season === 1
    ? season1Cards
    : season === 0
      ? season0Cards
      : [];

  const candidates = catalog.filter(card =>
    card.id != null &&
    entry.cardId != null &&
    String(card.id) === String(entry.cardId)
  );

  let card = candidates.find(
    card => clean(card.event) === clean(entry.event)
  );

  if (!card && !entry.event && candidates.length === 1) {
    card = candidates[0];
  }

  const event = clean(entry.event || card?.event);

  const eventLabel = event === "halloween2026"
    ? " • 🎃 Halloween 26"
    : event
      ? ` • 🎉 ${clip(event, 40)}`
      : "";

  const name =
    card?.name || entry.name || "Card data unavailable";

  const appearance = event === "halloween2026"
    ? "Halloween 26"
    : card?.appearance ||
      card?.show ||
      entry.appearance ||
      "Unknown series";

  const tier = clean(card?.tier || entry.tier);

  // Keep every favorite visible even if catalog data is missing.
  return (
    `⭐ \`${clip(entry.code, 40)}\` • ` +
    `${season === null ? "❓" : SEASONS[season]} ` +
    `${rarityEmojis[tier] || "🎴"} ` +
    `#${clip(entry.serial ?? "?", 20)} ` +
    `**${clip(name, 80)}** • ` +
    `${clip(appearance, 70)}${eventLabel}`
  );
}

module.exports = {
  name: "favcards",
  aliases: ["favorites", "favs"],

  data: new SlashCommandBuilder()
    .setName("favcards")
    .setDescription(
      "List your favorite cards from every season and event."
    ),

  async execute(message) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;

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
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      const db = await connectDB();

      const favorites = await db
        .collection("collections")
        .find({
          userId: user.id,
          favorite: true
        })
        .sort({ _id: -1 })
        .toArray();

      if (!favorites.length) {
        return await reply(
          "⭐ You have no favorite cards. " +
          "Use `!fav code` or `/fav code:…` to add one."
        );
      }

      const lines = favorites.map(describe);

      let page = 0;
      let busy = false;

      const totalPages = Math.ceil(lines.length / PER_PAGE);

      const embed = () =>
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle(
            clip(`⭐ ${user.username}'s Favorite Cards`, 256)
          )
          .setDescription(
            lines
              .slice(page * PER_PAGE, (page + 1) * PER_PAGE)
              .join("\n")
          )
          .setFooter({
            text:
              `Page ${page + 1}/${totalPages} • ` +
              `${favorites.length} favorite card(s) • S0, S1 & events`
          });

      const buttons = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("fav_prev")
            .setLabel("Previous")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),

          new ButtonBuilder()
            .setCustomId("fav_next")
            .setLabel("Next")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1)
        );

      const payload = () => ({
        embeds: [embed()],
        components: totalPages > 1 ? [buttons()] : []
      });

      let menu;

      if (slash) {
        await reply(payload());
        menu = await message.fetchReply();
      } else {
        menu = await reply(payload());
      }

      if (totalPages <= 1) return;

      const collector = menu.createMessageComponentCollector({
        time: 120000,
        filter: interaction =>
          ["fav_prev", "fav_next"].includes(interaction.customId)
      });

      collector.on("collect", async interaction => {
        let locked = false;

        try {
          if (interaction.user.id !== user.id) {
            return await interaction.reply({
              content: "❌ This is not your favorites menu.",
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
          locked = true;

          await interaction.deferUpdate();
          collector.resetTimer();

          const step =
            interaction.customId === "fav_next" ? 1 : -1;

          page = Math.max(
            0,
            Math.min(totalPages - 1, page + step)
          );

          await interaction.editReply(payload());
        } catch (error) {
          console.error("[FAVCARDS] Pagination:", error);

          const notice = {
            content: "❌ Could not update the page. Please try again.",
            ephemeral: true
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(notice).catch(() => {});
          } else {
            await interaction.reply(notice).catch(() => {});
          }
        } finally {
          if (locked) busy = false;
        }
      });

      collector.on("end", () =>
        menu.edit({ components: [] }).catch(() => {})
      );
    } catch (error) {
      console.error("[FAVCARDS]", error);

      await reply(
        "❌ Could not load your favorites. Please try again."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;