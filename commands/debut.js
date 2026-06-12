const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");
const cards = require("../data/cards");

function getTierEmoji(tier) {
  switch ((tier || "").toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "🎴";
  }
}

async function generateUniqueCode(collectionsCol) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const exists = await collectionsCol.findOne({ code });
    if (!exists) return code;
  }
}

function randomStone() {
  const stones = [
    "space",
    "mind",
    "reality",
    "power",
    "time",
    "soul"
  ];

  return stones[Math.floor(Math.random() * stones.length)];
}

function getRandomEpicCards(amount = 3) {
  const epicCards = cards.filter(c => c.tier === "epic");
  const picked = [];

  while (picked.length < amount && epicCards.length > 0) {
    const card = epicCards[Math.floor(Math.random() * epicCards.length)];

    if (!picked.some(c => c.id === card.id)) {
      picked.push(card);
    }
  }

  return picked;
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
    favorite: false
  });

  return {
    card,
    serial,
    code
  };
}

function makeEmbed(page, user) {
  const pages = [
    {
      title: "🌱 Welcome to GrootX",
      desc:
        "GrootX is a Marvel themed card collection bot.\n\n" +
        "You can collect cards, claim drops, build albums, trade with players, and battle using your collection."
    },
    {
      title: "🎴 Collecting Cards",
      desc:
        "`!drop` spawns cards.\n" +
        "`!collection` shows your cards.\n" +
        "`!info <card>` shows card details.\n\n" +
        "Each claimed card gets a unique code and serial."
    },
    {
      title: "📖 Albums",
      desc:
        "Albums let you display your best cards.\n\n" +
        "`!createalbum`\n" +
        "`!place <album> <page> <slot> <code>`\n" +
        "`!viewalbum <album>`"
    },
    {
      title: "⚔️ Battle",
      desc:
        "Use your cards in battles and win rewards.\n\n" +
        "`!deck`\n" +
        "`!battle @user`\n\n" +
        "Stronger decks, better strategy, and rare cards help you win."
    },
    {
      title: "💰 Economy",
      desc:
        "Earn coins, Ultron Chips, stones, shards, and items.\n\n" +
        "`!daily`\n" +
        "`!weekly`\n" +
        "`!bal`\n" +
        "`!shop`"
    },
    {
      title: "🔗 Referral",
      desc:
        "After this guide, you can enter a 6-digit referral code.\n\n" +
        "If valid, the player who invited you gets **3 Epic cards in DMs**.\n\n" +
        "You will get **1000 coins + 1 random stone** after completing debut."
    }
  ];

  return new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle(pages[page].title)
    .setDescription(pages[page].desc)
    .setFooter({
      text: `${user.username} • Page ${page + 1}/${pages.length}`
    });
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
      .setLabel(page === total - 1 ? "Finish" : "Next")
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

    let page = 0;
    const totalPages = 6;

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
        page--;
        if (page < 0) page = 0;

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
            "✅ Debut guide complete!\n\n" +
            "Now enter a **6-digit referral code**.\n" +
            "Type `skip` if you do not have one.",
          embeds: [],
          components: []
        });

        const filter = m => m.author.id === userId;

        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 60000
        }).catch(() => null);

        const referralInput = collected?.first()?.content?.trim();

        let referralUsed = null;
        let referralRewardText = "";

        if (
          referralInput &&
          referralInput.toLowerCase() !== "skip"
        ) {
          if (!/^\d{6}$/.test(referralInput)) {
            referralRewardText = "\n⚠️ Invalid referral code format, skipped referral.";
          } else {
            const referral = await referralsCol.findOne({
              code: referralInput
            });

            if (!referral) {
              referralRewardText = "\n⚠️ Referral code not found, skipped referral.";
            } else if (referral.userId === userId) {
              referralRewardText = "\n⚠️ You cannot use your own referral code.";
            } else {
              const alreadyReferred = await debutCol.findOne({
                userId,
                referralUsed: { $exists: true }
              });

              if (!alreadyReferred) {
                referralUsed = referralInput;

                const epicRewards = getRandomEpicCards(3);
                const givenCards = [];

                for (const card of epicRewards) {
                  const given = await giveCardToUser(
                    collectionsCol,
                    serialsCol,
                    referral.userId,
                    card
                  );

                  givenCards.push(given);
                }

                await referralsCol.updateOne(
                  { code: referralInput },
                  {
                    $addToSet: {
                      referredUsers: userId
                    }
                  }
                );

                const referrerUser = await message.client.users
                  .fetch(referral.userId)
                  .catch(() => null);

                if (referrerUser) {
                  await referrerUser.send(
                    "🎉 Someone used your GrootX referral code!\n\n" +
                    "You received **3 Epic cards**:\n\n" +
                    givenCards.map(g =>
                      `${getTierEmoji(g.card.tier)} **${g.card.name}** #${g.serial} • ${g.code}`
                    ).join("\n")
                  ).catch(() => {});
                }

                referralRewardText =
                  "\n🔗 Referral accepted! The referrer received **3 Epic cards**.";
              }
            }
          }
        }

        const stone = randomStone();

        await balancesCol.updateOne(
          { userId },
          {
            $inc: {
              coins: 1000
            }
          },
          { upsert: true }
        );

        await inventoryCol.updateOne(
          { userId },
          {
            $inc: {
              [`stones.${stone}`]: 1
            }
          },
          { upsert: true }
        );

        await debutCol.insertOne({
          userId,
          completedAt: Date.now(),
          referralUsed
        });

        return message.channel.send(
          `🎉 ${message.author}, your debut is complete!\n\n` +
          "You received:\n" +
          "💰 **1000 Coins**\n" +
          `💎 **1 ${stone.charAt(0).toUpperCase() + stone.slice(1)} Stone**` +
          referralRewardText
        );
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