const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");
const cards = require("../data/cards");

const COIN_EMOJI = "<:grootcoin:1504742213110861834>";

function getTierEmoji(tier = "") {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "🎴";
  }
}

function getStoneEmoji(stone) {
  switch (stone) {
    case "space": return "<:space:1504749742683324506>";
    case "mind": return "<:mind:1504749347592605716>";
    case "reality": return "<:reality:1504749391645376542>";
    case "power": return "<:power:1504749435177930857>";
    case "time": return "<:time:1504749635829239839>";
    case "soul": return "<:soul:1504749686911799296>";
    default: return "💎";
  }
}

function randomStone() {
  return ["space", "mind", "reality", "power", "time", "soul"][
    Math.floor(Math.random() * 6)
  ];
}

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }

    const exists = await collectionsCol.findOne({ code });
    if (!exists) return code;
  }
}

function getRandomCardByTier(tier) {
  const pool = cards.filter(
    c => (c.tier || "").toLowerCase() === tier.toLowerCase()
  );

  if (!pool.length) return null;

  return pool[Math.floor(Math.random() * pool.length)];
}

async function giveCardToUser(collectionsCol, serialsCol, userId, card) {
  await serialsCol.updateOne(
    { cardId: card.id },
    { $inc: { serial: 1 } },
    { upsert: true }
  );

  const serialDoc = await serialsCol.findOne({ cardId: card.id });
  const serial = serialDoc.serial;
  const code = await generateUniqueCode(collectionsCol);

  await collectionsCol.insertOne({
    userId,
    cardId: card.id,
    serial,
    code,
    tag: null,
    favorite: false,
    obtainedAt: Date.now()
  });

  return { card, serial, code };
}

function makeEmbed(page, user) {
  const pages = [
    {
      title: "🌱 Welcome to GrootX",
      desc:
        "GrootX is a Marvel themed card collection bot.\n\n" +
        "Collect cards, build your collection, wishlist dream cards, use stones, make albums, trade, and flex rare serials."
    },
    {
      title: "🎴 Collect Cards",
      desc:
        "`!drop` — Drop cards\n" +
        "`!collection` or `!col` — View your cards\n" +
        "`!collection epic` — Filter by rarity\n" +
        "`!info <card name>` — View card info\n" +
        "`!view <code>` — View an owned card\n\n" +
        "Every claimed card gets a unique code and serial."
    },
    {
      title: "💫 Wishlist",
      desc:
        "`!wishlist` — View your wishlist\n" +
        "`!wishlist @user` — View someone else's wishlist\n" +
        "`!wishlist add <card name>` — Add a card\n" +
        "`!wishlist remove <card name>` — Remove a card\n\n" +
        "Wishlist helps you track cards you want."
    },
    {
      title: "🏷️ Tags & Favorites",
      desc:
        "`!tag <code> <emoji>` — Tag a card\n" +
        "`!tag <emoji>` — Tag your latest card\n" +
        "`!fav <code>` — Favorite a card\n" +
        "`!favcards` — View favorite cards\n" +
        "`!search` — Search cards"
    },
    {
      title: "📖 Albums",
      desc:
        "`!setlayout` — Pick album layout\n" +
        "`!shopbg` — Buy backgrounds\n" +
        "`!setbg <background>` — Set background\n" +
        "`!place <slot> <code>` — Place card\n" +
        "`!displace <slot>` — Remove card\n" +
        "`!viewalbum` — View album"
    },
    {
      title: `${COIN_EMOJI} Economy`,
      desc:
        "`!bal` — Check coins and Ultron Chips\n" +
        "`!daily` — Daily reward\n" +
        "`!weekly` — Weekly reward\n" +
        "`!cooldown` — Check cooldowns\n" +
        "`!shop` — View shop\n" +
        "`!buy <item>` — Buy item\n" +
        "`!inventory` or `!inv` — View items"
    },
    {
      title: "<:guantlet:1504854241360085066> Infinity Stones",
      desc:
        "<:power:1504749435177930857> `!stone power` — Drop priority boost\n" +
        "<:time:1504749635829239839> `!stone time` — Faster cooldowns\n" +
        "<:mind:1504749347592605716> `!stone mind` — More cards in drops\n" +
        "<:reality:1504749391645376542> `!stone reality <code>` — Change card to same tier\n\n" +
        "Stones are stored in your inventory."
    },
    {
      title: "🔗 Referral",
      desc:
        "`!refer` — Get your own 6-digit referral code\n\n" +
        "At the end of debut, you can enter someone else's referral code.\n\n" +
        "**Referral Rewards**\n" +
        "• 1 Referral → 1 Rare Card\n" +
        "• 5 Referrals → 1 Epic Card\n" +
        "• 10 Referrals → 1 Legendary Card"
    }
  ];

  return new EmbedBuilder()
    .setColor(0x00aeff)
    .setAuthor({
      name: `${user.username}'s GrootX Debut`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setTitle(pages[page].title)
    .setDescription(pages[page].desc)
    .setFooter({
      text: `Page ${page + 1}/${pages.length}`
    })
    .setTimestamp();
}

function makeButtons(page, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("debut_prev")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),

    new ButtonBuilder()
      .setCustomId("debut_next")
      .setLabel(page === total - 1 ? "Enter Referral" : "Next")
      .setStyle(page === total - 1 ? ButtonStyle.Success : ButtonStyle.Primary)
  );
}

module.exports = {
  name: "debut",

  async execute(message) {
    const db = await connectDB();

    const debutCol = db.collection("debuts");
    const referralsCol = db.collection("referrals");
    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");
    const balancesCol = db.collection("balances");
    const inventoryCol = db.collection("inventory");

    const userId = message.author.id;

    const alreadyDone = await debutCol.findOne({ userId });

    if (alreadyDone) {
      return message.reply("❌ You already completed your debut.");
    }

    const existingCards = await collectionsCol.countDocuments({ userId });

    if (existingCards > 0) {
      return message.reply(
        "❌ Debut is only available for brand new players."
      );
    }

    let page = 0;
    const totalPages = 8;

    const msg = await message.reply({
      embeds: [makeEmbed(page, message.author)],
      components: [makeButtons(page, totalPages)]
    });

    const collector = msg.createMessageComponentCollector({
      time: 180000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "❌ This debut guide is not for you.",
          ephemeral: true
        });
      }

      if (interaction.customId === "debut_prev") {
        page = Math.max(0, page - 1);

        return interaction.update({
          embeds: [makeEmbed(page, message.author)],
          components: [makeButtons(page, totalPages)]
        });
      }

      if (interaction.customId === "debut_next") {
        if (page < totalPages - 1) {
          page++;

          return interaction.update({
            embeds: [makeEmbed(page, message.author)],
            components: [makeButtons(page, totalPages)]
          });
        }

        collector.stop("finished");

        await interaction.update({
          content:
            "✅ **Debut guide complete!**\n\n" +
            "Now enter a **6-digit referral code** if someone invited you.\n\n" +
            "Type `skip` if you do not have one.\n\n" +
            "To get your own referral code later, use `!refer`.",
          embeds: [],
          components: []
        });

        const refCollected = await message.channel.awaitMessages({
          filter: m => m.author.id === userId,
          max: 1,
          time: 60000
        }).catch(() => null);

        const referralInput = refCollected?.first()?.content?.trim();

        let referralUsed = null;
        let referralText = "";

        if (!referralInput) {
          referralText = "\n⚠️ No referral entered.";
        } else if (referralInput.toLowerCase() === "skip") {
          referralText = "\nReferral skipped.";
        } else if (!/^\d{6}$/.test(referralInput)) {
          referralText = "\n⚠️ Invalid referral code format. Referral skipped.";
        } else {
          const referral = await referralsCol.findOne({
            code: referralInput
          });

          if (!referral) {
            referralText = "\n⚠️ Referral code not found. Referral skipped.";
          } else if (referral.userId === userId) {
            referralText = "\n⚠️ You cannot use your own referral code.";
          } else if ((referral.referredUsers || []).includes(userId)) {
            referralText = "\n⚠️ You already used this referral code.";
          } else {
            referralUsed = referralInput;

            await referralsCol.updateOne(
              { code: referralInput },
              {
                $addToSet: {
                  referredUsers: userId
                }
              }
            );

            const updatedReferral = await referralsCol.findOne({
              code: referralInput
            });

            const totalReferrals =
              updatedReferral?.referredUsers?.length || 0;

            let rewardTier = null;

            if (totalReferrals === 1) rewardTier = "rare";
            if (totalReferrals === 5) rewardTier = "epic";
            if (totalReferrals === 10) rewardTier = "legendary";

            let rewardedCard = null;
            let rewardedData = null;

            if (rewardTier) {
              rewardedCard = getRandomCardByTier(rewardTier);

              if (rewardedCard) {
                rewardedData = await giveCardToUser(
                  collectionsCol,
                  serialsCol,
                  referral.userId,
                  rewardedCard
                );
              }
            }

            const referrerUser = await message.client.users
              .fetch(referral.userId)
              .catch(() => null);

            if (referrerUser) {
              if (rewardedData) {
                await referrerUser.send(
                  "🎉 Someone used your GrootX referral code!\n\n" +
                  `You reached **${totalReferrals} referral${totalReferrals === 1 ? "" : "s"}** and received:\n\n` +
                  `${getTierEmoji(rewardedData.card.tier)} **${rewardedData.card.name}** ` +
                  `#${rewardedData.serial} • \`${rewardedData.code}\``
                ).catch(() => {});
              } else {
                await referrerUser.send(
                  "🎉 Someone used your GrootX referral code!\n\n" +
                  `You now have **${totalReferrals} referral${totalReferrals === 1 ? "" : "s"}**.\n\n` +
                  "Next rewards:\n" +
                  "• 1 Referral → Rare Card\n" +
                  "• 5 Referrals → Epic Card\n" +
                  "• 10 Referrals → Legendary Card"
                ).catch(() => {});
              }
            }

            referralText =
              "\n🔗 Referral accepted successfully.";
          }
        }

        const stone = randomStone();
        const stoneName =
          stone.charAt(0).toUpperCase() + stone.slice(1);

        await balancesCol.updateOne(
          { userId },
          {
            $inc: {
              coins: 1000
            },
            $setOnInsert: {
              userId
            }
          },
          { upsert: true }
        );

        await inventoryCol.updateOne(
          { userId },
          {
            $inc: {
              [`items.${stone}_stone`]: 1
            },
            $setOnInsert: {
              userId
            }
          },
          { upsert: true }
        );

        await debutCol.insertOne({
          userId,
          completedAt: Date.now(),
          referralUsed
        });

        const rewardEmbed = new EmbedBuilder()
          .setColor(0x22c55e)
          .setTitle("🎉 Debut Complete!")
          .setDescription(
            `${message.author}, welcome to GrootX.\n\n` +
            "**Rewards Received**\n\n" +
            `${COIN_EMOJI} **1000 Coins**\n` +
            `${getStoneEmoji(stone)} **1 ${stoneName} Stone**\n` +
            referralText +
            "\n\n**Next Steps**\n" +
            "• `!drop` to collect cards\n" +
            "• `!daily` for free rewards\n" +
            "• `!wishlist` to track dream cards\n" +
            "• `!inventory` to check your stone\n" +
            "• `!refer` to get your referral code"
          )
          .setTimestamp();

        return message.channel.send({
          embeds: [rewardEmbed]
        });
      }
    });

    collector.on("end", async (_, reason) => {
      if (reason !== "finished") {
        await msg.edit({
          components: []
        }).catch(() => {});
      }
    });
  }
};