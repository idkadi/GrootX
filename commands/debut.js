const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const connectDB = require("../database");
const cards = require("../data/cards");

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

function getTierPower(tier = "") {
  switch (tier.toLowerCase()) {
    case "common": return 10;
    case "uncommon": return 18;
    case "rare": return 28;
    case "epic": return 42;
    case "legendary": return 60;
    default: return 10;
  }
}

function randomStone() {
  return ["space", "mind", "reality", "power", "time", "soul"][
    Math.floor(Math.random() * 6)
  ];
}

function pickRandomCards(amount = 12) {
  const usable = cards.filter(c => c.id && c.name && c.tier);
  const picked = [];

  while (picked.length < amount && usable.length > 0) {
    const card = usable[Math.floor(Math.random() * usable.length)];

    if (!picked.some(c => Number(c.id) === Number(card.id))) {
      picked.push(card);
    }
  }

  return picked;
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

function getRandomEpicCards(amount = 3) {
  const epicCards = cards.filter(c => (c.tier || "").toLowerCase() === "epic");
  const picked = [];

  while (picked.length < amount && epicCards.length > 0) {
    const card = epicCards[Math.floor(Math.random() * epicCards.length)];

    if (!picked.some(c => Number(c.id) === Number(card.id))) {
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
    favorite: false,
    obtainedAt: Date.now()
  });

  return { card, serial, code };
}

function makeLessonEmbed(step, total) {
  return new EmbedBuilder()
    .setColor(0x00aeff)
    .setTitle(`🌱 GrootX Debut Training ${step.index + 1}/${total}`)
    .setDescription(
      `${step.desc}\n\n` +
      `Type this command now:\n` +
      `## ${step.command}`
    )
    .setFooter({ text: "Type the command to continue." });
}

function makeBattleEmbed(user, userScore, aiScore, round, userCard, aiCard, log) {
  return new EmbedBuilder()
    .setColor(0xffc107)
    .setTitle("🤖 Final Trial: GrootX AI Battle")
    .setDescription(
      `**${user.username}** vs **GrootX AI**\n\n` +
      `Round: **${round}/3**\n\n` +
      `Your Score: **${userScore}**\n` +
      `AI Score: **${aiScore}**\n\n` +
      `${userCard ? `Your Card: ${getTierEmoji(userCard.tier)} **${userCard.name}**\n` : ""}` +
      `${aiCard ? `AI Card: ${getTierEmoji(aiCard.tier)} **${aiCard.name}**\n\n` : ""}` +
      `${log || "Choose your move."}`
    );
}

function battleButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("debut_attack")
      .setLabel("Attack")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("debut_defend")
      .setLabel("Defend")
      .setEmoji("🛡️")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("debut_special")
      .setLabel("Special")
      .setEmoji("✨")
      .setStyle(ButtonStyle.Success)
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

    const lessons = [
      {
        command: "!bal",
        desc: "💰 **Balance** shows your Coins and Ultron Chips."
      },
      {
        command: "!inventory",
        desc: "🎒 **Inventory** shows your stones, shards, backgrounds, albums, and items."
      },
      {
        command: "!daily",
        desc: "🎁 **Daily** gives you free regular rewards."
      },
      {
        command: "!weekly",
        desc: "📅 **Weekly** gives bigger weekly rewards."
      },
      {
        command: "!cooldown",
        desc: "⏳ **Cooldown** shows when your rewards/actions reset."
      },
      {
        command: "!drop",
        desc: "🎴 **Drop** spawns cards in the server."
      },
      {
        command: "!collection",
        desc: "📚 **Collection** shows your owned cards."
      },
      {
        command: "!info spider-man",
        desc: "🔎 **Info** shows details about a card."
      },
      {
        command: "!wishlist",
        desc: "💫 **Wishlist** shows your dream cards."
      },
      {
        command: "!profile",
        desc: "👤 **Profile** shows your GrootX identity."
      },
      {
        command: "!shop",
        desc: "🛒 **Shop** shows items you can buy."
      },
      {
        command: "!deck",
        desc: "🃏 **Deck** shows your battle deck."
      },
      {
        command: "!refer",
        desc: "🔗 **Refer** gives your 6-digit referral code."
      }
    ];

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle("🌱 Welcome to GrootX Debut")
          .setDescription(
            "You will learn the main GrootX commands.\n\n" +
            "Type each command when asked.\n" +
            "Then you will get a **temporary demo deck** and fight **GrootX AI**.\n\n" +
            "Completion rewards:\n" +
            "💰 **1000 Coins**\n" +
            "💎 **1 Random Infinity Stone**"
          )
      ]
    });

    for (let i = 0; i < lessons.length; i++) {
      const step = { ...lessons[i], index: i };

      await message.channel.send({
        embeds: [makeLessonEmbed(step, lessons.length)]
      });

      const baseCommand = step.command.split(" ")[0].toLowerCase();

      const collected = await message.channel.awaitMessages({
        filter: m =>
          m.author.id === userId &&
          m.content.toLowerCase().startsWith(baseCommand),
        max: 1,
        time: 120000
      }).catch(() => null);

      if (!collected || collected.size === 0) {
        return message.channel.send(
          "❌ Debut cancelled because you did not type the command in time.\nUse `!debut` again."
        );
      }

      await message.channel.send("✅ Command learned.");
    }

    const demoDeck = pickRandomCards(12);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8b5cf6)
          .setTitle("🃏 Demo Deck Created")
          .setDescription(
            "You received a **temporary demo deck** for this tutorial battle only.\n\n" +
            demoDeck.map((card, i) =>
              `**${i + 1}.** ${getTierEmoji(card.tier)} **${card.name}** • ${card.tier}`
            ).join("\n") +
            "\n\nThis deck is **not saved**. Build your real deck later with `!deck add <code>`."
          )
      ]
    });

    let round = 1;
    let userScore = 0;
    let aiScore = 0;
    let lastUserCard = null;
    let lastAiCard = null;
    let log = "";

    const battleMsg = await message.channel.send({
      embeds: [
        makeBattleEmbed(
          message.author,
          userScore,
          aiScore,
          round,
          lastUserCard,
          lastAiCard,
          log
        )
      ],
      components: [battleButtons()]
    });

    const battleCollector = battleMsg.createMessageComponentCollector({
      time: 180000
    });

    battleCollector.on("collect", async interaction => {
      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: "❌ This debut battle is not for you.",
          ephemeral: true
        });
      }

      const move = interaction.customId.replace("debut_", "");

      lastUserCard = demoDeck[Math.floor(Math.random() * demoDeck.length)];
      lastAiCard = cards[Math.floor(Math.random() * cards.length)];

      let userPower = getTierPower(lastUserCard.tier);
      let aiPower = getTierPower(lastAiCard.tier);

      if (move === "attack") userPower += 10;
      if (move === "defend") aiPower -= 5;
      if (move === "special") userPower += Math.floor(Math.random() * 18);

      aiPower += Math.floor(Math.random() * 12);

      if (userPower >= aiPower) {
        userScore++;
        log =
          `✅ You won this round!\n` +
          `Your Power: **${userPower}**\n` +
          `AI Power: **${aiPower}**`;
      } else {
        aiScore++;
        log =
          `❌ AI won this round.\n` +
          `Your Power: **${userPower}**\n` +
          `AI Power: **${aiPower}**`;
      }

      if (round >= 3) {
        battleCollector.stop("finished");

        const stone = randomStone();
        const stoneName = stone.charAt(0).toUpperCase() + stone.slice(1);

        await balancesCol.updateOne(
          { userId },
          {
            $inc: { coins: 1000 },
            $setOnInsert: { userId }
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

        await interaction.update({
          embeds: [
            makeBattleEmbed(
              message.author,
              userScore,
              aiScore,
              round,
              lastUserCard,
              lastAiCard,
              log +
                "\n\n🏁 **Battle Finished!**\n\n" +
                `${userScore >= aiScore
                  ? "🎉 You defeated GrootX AI!"
                  : "🤖 GrootX AI won, but your training is complete!"}`
            )
          ],
          components: []
        });

        await message.channel.send(
          `🎉 ${message.author}, your GrootX debut is complete!\n\n` +
          "You received:\n" +
          "💰 **1000 Coins**\n" +
          `💎 **1 ${stoneName} Stone**\n\n` +
          "Use `!bal` to check coins.\n" +
          "Use `!inventory` to check your stone.\n" +
          "Use `!refer` to get your referral code."
        );

        await message.channel.send(
          "Now enter a **6-digit referral code** if someone invited you.\n" +
          "Type `skip` if you do not have one."
        );

        const refCollected = await message.channel.awaitMessages({
          filter: m => m.author.id === userId,
          max: 1,
          time: 60000
        }).catch(() => null);

        const referralInput = refCollected?.first()?.content?.trim();
        let referralUsed = null;

        if (referralInput && referralInput.toLowerCase() !== "skip") {
          if (/^\d{6}$/.test(referralInput)) {
            const referral = await referralsCol.findOne({
              code: referralInput
            });

            if (referral && referral.userId !== userId) {
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
                    `${getTierEmoji(g.card.tier)} **${g.card.name}** #${g.serial} • \`${g.code}\``
                  ).join("\n")
                ).catch(() => {});
              }

              await message.channel.send(
                "🔗 Referral accepted! The referrer received **3 Epic cards**."
              );
            } else {
              await message.channel.send("⚠️ Invalid referral code. Skipped.");
            }
          } else {
            await message.channel.send("⚠️ Invalid referral format. Skipped.");
          }
        }

        await debutCol.insertOne({
          userId,
          completedAt: Date.now(),
          referralUsed,
          aiBattle: {
            userScore,
            aiScore
          }
        });

        return;
      }

      round++;

      return interaction.update({
        embeds: [
          makeBattleEmbed(
            message.author,
            userScore,
            aiScore,
            round,
            lastUserCard,
            lastAiCard,
            log
          )
        ],
        components: [battleButtons()]
      });
    });

    battleCollector.on("end", async (_, reason) => {
      if (reason !== "finished") {
        await battleMsg.edit({ components: [] }).catch(() => {});
      }
    });
  }
};