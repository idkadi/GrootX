const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");
const {
  EmbedBuilder,
  AttachmentBuilder,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");

const tierEmojis = {
  common: "<:common:1504510702956839033>",
  uncommon: "<:uncommon:1504510929210052698>",
  rare: "<:rare:1504510606718275764>",
  epic: "<:epic:1504510771214680175>",
  legendary: "<:legendary:1504511435974377552>"
};

const seasonEmojis = [
  "<:Season0:1555956910560256082>",
  "<:Season1:1555956879576793130>"
];

const eventKey = value =>
  String(value || "").trim().toLowerCase();

const itemName = value =>
  String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());

function resolveCard(owned) {
  const value = String(
    owned.season ?? owned.cardSeason ?? 0
  ).trim().toLowerCase();

  if (!/^s?\d+$/.test(value)) {
    throw new Error("Invalid season.");
  }

  const season = Number(value.replace(/^s/, ""));

  if (!Number.isSafeInteger(season)) {
    throw new Error("Invalid season.");
  }

  const file = path.join(
    __dirname,
    "../data",
    season === 0 ? "cards.js" : `season${season}.js`
  );

  if (!fs.existsSync(file)) {
    throw new Error(`Season ${season} catalog unavailable.`);
  }

  const data = require(file);
  const catalog = Array.isArray(data) ? data : data.cards;

  if (!Array.isArray(catalog)) {
    throw new Error("Invalid catalog.");
  }

  const candidates = catalog.filter(card =>
    card.id != null &&
    owned.cardId != null &&
    String(card.id) === String(owned.cardId)
  );

  const matches = candidates.filter(card =>
    eventKey(card.event) === eventKey(owned.event)
  );

  const card =
    matches.length === 1
      ? matches[0]
      : !owned.event && candidates.length === 1
        ? candidates[0]
        : null;

  if (!card) {
    throw new Error("Card data missing or ambiguous.");
  }

  const event = owned.event || card.event || null;

  return {
    card: { ...card, season, event },
    owned: { ...owned, season, event }
  };
}

function descriptions(lines) {
  const pages = [];
  let text = "";

  for (const line of lines) {
    const safe = String(line).slice(0, 3500);

    if (text && text.length + safe.length + 1 > 3500) {
      pages.push(text);
      text = "";
    }

    text += `${text ? "\n" : ""}${safe}`;
  }

  if (text) pages.push(text);

  return pages.length ? pages : ["No offer."];
}

async function cardSheet(records) {
  const width = 260;
  const height = 368;
  const gap = 16;
  const label = 30;

  const columns = Math.min(3, records.length);
  const rows = Math.ceil(records.length / columns);

  const canvas = createCanvas(
    columns * (width + gap) + gap,
    rows * (height + label + gap) + gap
  );

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#171923";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    const x = gap + (i % columns) * (width + gap);
    const y =
      gap + Math.floor(i / columns) * (height + label + gap);

    try {
      const buffer = await renderCard(
        record.card,
        record.owned.serial ?? "?",
        record.owned
      );

      ctx.drawImage(
        await loadImage(buffer),
        x,
        y,
        width,
        height
      );
    } catch (error) {
      console.error("[viewtrade] Card render:", error);

      errors.push(
        `Card ${record.owned.code}: image unavailable.`
      );

      ctx.fillStyle = "#333745";
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = "#ffffff";
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";

      ctx.fillText(
        "Image unavailable",
        x + width / 2,
        y + height / 2,
        width - 10
      );
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";

    ctx.fillText(
      `${record.owned.code} • #${record.owned.serial ?? "?"}`,
      x + width / 2,
      y + height + 21,
      width
    );
  }

  return {
    buffer: canvas.toBuffer("image/png"),
    errors
  };
}

module.exports = {
  name: "viewtrade",
  aliases: ["vt"],

  data: new SlashCommandBuilder()
    .setName("viewtrade")
    .setDescription(
      "View both trade offers and their equipped card frames."
    ),

  async execute(message) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;
    let sent = false;

    const send = async payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      const result = slash
        ? await (
            sent
              ? message.followUp(payload)
              : message.editReply(payload)
          )
        : await message.reply(payload);

      sent = true;
      return result;
    };

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      const db = await connectDB();

      const trade = await db.collection("trades").findOne({
        users: user.id
      });

      if (!trade) {
        return await send(
          "❌ You are not in an active trade."
        );
      }

      if (
        !Array.isArray(trade.users) ||
        trade.users.length !== 2
      ) {
        return await send(
          "❌ This trade has invalid participant data."
        );
      }

      await send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🤝 Active Trade")
            .setDescription(
              trade.users
                .map(id => `<@${id}>`)
                .join(" ↔ ")
            )
            .setFooter({
              text:
                "Offer snapshot • Use !confirmtrade or /confirmtrade when ready."
            })
        ]
      });

      for (const userId of trade.users) {
        const offer = trade.offers?.[userId];

        const username =
          message.guild?.members?.cache?.get(userId)
            ?.user?.username || `User ${userId}`;

        const lines = [
          `👤 <@${userId}>`,
          `💰 Coins: **${offer?.coins ?? 0}**`
        ];

        const entries = Object.entries(
          offer?.items || {}
        ).filter(([, amount]) => Number(amount) > 0);

        if (entries.length) {
          lines.push("\n📦 **Items**");

          for (const [item, amount] of entries) {
            lines.push(
              `• **${itemName(item).slice(0, 150)}** ×${amount}`
            );
          }
        }

        const codes = Array.isArray(offer?.cards)
          ? offer.cards
          : [];

        const records = [];

        lines.push("\n🎴 **Cards**");

        if (!codes.length) {
          lines.push("No cards added.");
        }

        for (const value of codes) {
          const code = String(value).trim().toLowerCase();

          const owned = await db
            .collection("collections")
            .findOne({ userId, code });

          if (!owned) {
            lines.push(
              `⚠️ ${code}: no longer owned by this trader.`
            );
            continue;
          }

          try {
            const record = resolveCard(owned);
            records.push(record);

            const { card } = record;

            const frame =
              owned.frameId != null &&
              String(owned.frameId).trim() !== ""
                ? ` • Custom frame #${owned.frameId}`
                : "";

            const seasonLabel =
              seasonEmojis[card.season] || `S${card.season}`;

            const tierEmoji =
              tierEmojis[
                String(card.tier || "").toLowerCase()
              ] || "🎴";

            const name = String(
              card.name || "Unknown"
            ).slice(0, 150);

            const eventLabel = card.event
              ? ` • Event: ${String(card.event).slice(0, 100)}`
              : "";

            lines.push(
              `${seasonLabel} ${tierEmoji} **${name}**\n` +
              `└ ${owned.code} • #${owned.serial ?? "?"}` +
              `${frame}${eventLabel}`
            );
          } catch (error) {
            console.error("[viewtrade] Catalog:", error);

            lines.push(
              `⚠️ ${code}: ${error.message}`
            );
          }
        }

        const textPages = descriptions(lines);

        for (let i = 0; i < textPages.length; i++) {
          await send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(
                  `${username}'s Offer`.slice(0, 256)
                )
                .setDescription(textPages[i])
                .setFooter({
                  text:
                    `Offer details ${i + 1}/${textPages.length}`
                })
            ]
          });
        }

        for (let i = 0; i < records.length; i += 6) {
          const sheet = await cardSheet(
            records.slice(i, i + 6)
          );

          const filename =
            `trade-cards-${userId}-${i}.png`;

          const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(
              `${username}'s Cards`.slice(0, 256)
            )
            .setImage(`attachment://${filename}`)
            .setFooter({
              text:
                `Card preview ${Math.floor(i / 6) + 1}/` +
                `${Math.ceil(records.length / 6)}` +
                " • Equipped frames shown"
            });

          if (sheet.errors.length) {
            embed.setDescription(
              sheet.errors.join("\n").slice(0, 3500)
            );
          }

          await send({
            embeds: [embed],
            files: [
              new AttachmentBuilder(sheet.buffer, {
                name: filename
              })
            ]
          });
        }
      }
    } catch (error) {
      console.error("[viewtrade]", error);

      const payload = {
        content:
          "❌ Could not finish displaying the trade. Please try again."
      };

      if (slash && !message.deferred && !message.replied) {
        await message.reply(payload).catch(() => {});
      } else {
        await send(payload).catch(() => {});
      }
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;