const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const {
  randomInt,
  randomBytes
} = require("node:crypto");

const connectDB = require("../database");
const renderCard = require("../utils/renderCard");
const refer = require("./refer");

// Matches the current drop season.
// Change when the next season launches.
const CURRENT_SEASON = Number(
  process.env.GROOTX_CURRENT_SEASON || 1
);

const catalogData = require(
  `../data/season${CURRENT_SEASON}`
);

const catalog = Array.isArray(catalogData)
  ? catalogData
  : catalogData.cards;

const regular = catalog.filter(
  card =>
    !card.event &&
    card.rawImage &&
    Number.isFinite(Number(card.id))
);

const epics = regular.filter(
  card =>
    String(card.tier).toLowerCase() === "epic"
);

const active = new Set();
const LEASE_MS = 20 * 60 * 1000;

const COIN =
  "<:grootcoin:1504742213110861834>";

const TIERS = {
  common: "<:common:1504510702956839033>",
  uncommon: "<:uncommon:1504510929210052698>",
  rare: "<:rare:1504510606718275764>",
  epic: "<:epic:1504510771214680175>",
  legendary: "<:legendary:1504511435974377552>"
};

const short = value =>
  String(value || "Unknown").slice(0, 180);

const pick = pool =>
  pool[randomInt(pool.length)];

const cardLine = (card, owned) =>
  `${
    TIERS[String(card.tier).toLowerCase()] || "🎴"
  } **${short(card.name)}** • ` +
  `#${owned.serial} • \`${owned.code}\``;

function problem(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// Matches the persistent classification used by index.js.
// A referral record alone is not prior gameplay.
async function hasPlayedBefore(db, userId) {
  const access = await db
    .collection("playerAccess")
    .findOne({ _id: userId });

  if (access) {
    return access.status === "legacy";
  }

  const sources = [
    "collections",
    "balances",
    "inventory",
    "cooldowns",
    "profiles",
    "wishlists",
    "albums",
    "tradePasses",
    "stoneeffects",
    "daily",
    "weekly",
    "reminders",
    "voteStreaks",
    "cardtags",
    "decks"
  ];

  const records = await Promise.all(
    sources.map(name =>
      db.collection(name).findOne(
        { userId },
        { projection: { _id: 1 } }
      )
    )
  );

  return records.some(Boolean);
}

async function canUseCommand(
  db,
  userId,
  commandName
) {
  if (
    String(commandName).toLowerCase() === "debut"
  ) {
    return true;
  }

  const state = await db
    .collection("debuts")
    .findOne({ userId });

  if (state?.completedAt) {
    return true;
  }

  if (state?.eligible === true) {
    return false;
  }

  return hasPlayedBefore(db, userId);
}

async function indexes(db) {
  await db.collection("debuts").createIndex(
    { userId: 1 },
    { unique: true }
  );

  await refer.ensureIndexes(db);

  await db.collection("collections").createIndex(
    { code: 1 },
    { unique: true }
  );

  await db.collection("serials").createIndex(
    {
      cardId: 1,
      season: 1
    },
    { unique: true }
  );
}

async function transaction(db, action) {
  const session = db.client.startSession();

  try {
    return await session.withTransaction(
      () => action(session)
    );
  } finally {
    await session.endSession();
  }
}

async function giveCard(
  db,
  userId,
  card,
  session,
  source
) {
  const cardId = Number(card.id);

  const serialResult = await db
    .collection("serials")
    .findOneAndUpdate(
      {
        cardId,
        season: CURRENT_SEASON
      },
      {
        $inc: { serial: 1 }
      },
      {
        upsert: true,
        returnDocument: "after",
        includeResultMetadata: false,
        session
      }
    );

  const serialDoc =
    serialResult?.value ?? serialResult;

  if (
    !Number.isSafeInteger(serialDoc?.serial)
  ) {
    throw new Error("Serial allocation failed");
  }

  const owned = {
    userId,
    cardId,
    season: CURRENT_SEASON,
    serial: serialDoc.serial,
    code: randomBytes(3).toString("hex"),
    tag: null,
    favorite: false,
    obtainedAt: Date.now(),
    source
  };

  await db.collection("collections").insertOne(
    owned,
    { session }
  );

  return owned;
}

// A code collision aborts the transaction.
// Retry the entire operation.
async function retryWrite(action) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (
        error.code !== 11000 ||
        attempt === 7
      ) {
        throw error;
      }
    }
  }
}

function starterCard() {
  const roll = randomInt(1000);

  const tier =
    roll < 600
      ? "common"
      : roll < 875
        ? "uncommon"
        : roll < 975
          ? "rare"
          : roll < 997
            ? "epic"
            : "legendary";

  const pool = regular.filter(
    card =>
      String(card.tier).toLowerCase() === tier
  );

  return pick(pool.length ? pool : regular);
}

function resolveCard(owned) {
  return regular.find(
    card =>
      Number(card.id) === Number(owned.cardId)
  );
}

async function claimStarter(
  db,
  userId,
  token
) {
  return retryWrite(() =>
    transaction(db, async session => {
      const states = db.collection("debuts");

      const state = await states.findOne(
        {
          userId,
          leaseToken: token
        },
        { session }
      );

      if (!state || state.completedAt) {
        problem("SESSION_EXPIRED");
      }

      if (state.starter) {
        return state.starter;
      }

      const card = resolveCard({
        cardId: state.previewCardId
      });

      if (!card) {
        throw new Error("Starter card unavailable");
      }

      const owned = await giveCard(
        db,
        userId,
        card,
        session,
        "debut-starter"
      );

      const result = await states.updateOne(
        {
          userId,
          leaseToken: token,
          stage: "claim",
          starter: { $exists: false }
        },
        {
          $set: {
            starter: owned,
            stage: "view"
          }
        },
        { session }
      );

      if (result.modifiedCount !== 1) {
        problem("SESSION_EXPIRED");
      }

      return owned;
    })
  );
}

async function finish(
  db,
  userId,
  token,
  input
) {
  return retryWrite(() =>
    transaction(db, async session => {
      const states = db.collection("debuts");

      const state = await states.findOne(
        {
          userId,
          leaseToken: token
        },
        { session }
      );

      if (
        !state ||
        state.completedAt ||
        state.stage !== "referral"
      ) {
        problem("SESSION_EXPIRED");
      }

      const referrals =
        db.collection("referrals");

      const player = await referrals.findOne(
        { userId },
        { session }
      );

      const previous = await referrals.findOne(
        { referredUsers: userId },
        { session }
      );

      if (
        player?.referredBy ||
        player?.referralRedeemedAt ||
        previous
      ) {
        problem("REFERRAL_USED");
      }

      let owner = null;

      if (input !== "none") {
        if (!/^\d{6}$/.test(input)) {
          problem("INVALID_FORMAT");
        }

        owner = await referrals.findOne(
          { code: input },
          { session }
        );

        if (!owner) {
          problem("INVALID_CODE");
        }

        if (owner.userId === userId) {
          problem("SELF_REFERRAL");
        }

        await referrals.updateOne(
          { userId: owner.userId },
          {
            $addToSet: {
              referredUsers: userId
            }
          },
          { session }
        );

        const balance = await db
          .collection("balances")
          .findOne(
            { userId: owner.userId },
            { session }
          );

        const chipsField =
          balance?.ultronChips != null
            ? "ultronChips"
            : balance?.ultronchips != null
              ? "ultronchips"
              : "ultronChips";

        await db.collection("balances").updateOne(
          { userId: owner.userId },
          {
            $inc: {
              coins: 500,
              [chipsField]: 3
            }
          },
          {
            upsert: true,
            session
          }
        );

        await db.collection("inventory").updateOne(
          { userId: owner.userId },
          {
            $inc: {
              "items.groot_candy": 300
            }
          },
          {
            upsert: true,
            session
          }
        );
      }

      const rewards = [];

      // Two different Epics when possible.
      const first = pick(epics);

      const remaining = epics.filter(
        card =>
          Number(card.id) !== Number(first.id)
      );

      const second = pick(
        remaining.length ? remaining : epics
      );

      for (const card of [first, second]) {
        rewards.push(
          await giveCard(
            db,
            userId,
            card,
            session,
            "debut-reward"
          )
        );
      }

      await db.collection("balances").updateOne(
        { userId },
        {
          $inc: { coins: 3000 }
        },
        {
          upsert: true,
          session
        }
      );

      const now = Date.now();

      await referrals.updateOne(
        { userId },
        {
          $set: {
            debutCompleted: true,
            referralDecisionAt: now,

            ...(owner
              ? {
                  referredBy: owner.userId,
                  referralRedeemedAt: now,
                  redeemedCode: input
                }
              : {
                  referralSkipped: true
                })
          }
        },
        { session }
      );

      const updated = await states.updateOne(
        {
          userId,
          leaseToken: token,
          completedAt: { $exists: false }
        },
        {
          $set: {
            completedAt: now,
            stage: "completed",
            referralUsed: owner ? input : null,
            rewards
          },

          $unset: {
            leaseToken: "",
            leaseUntil: ""
          }
        },
        { session }
      );

      if (updated.modifiedCount !== 1) {
        problem("SESSION_EXPIRED");
      }

      return {
        rewards,
        referrerId: owner?.userId
      };
    })
  );
}

const pages = {
  welcome: [
    "🌱 Welcome to GrootX",

    "Collect Marvel cards, complete series, " +
    "build albums and trade with other players.\n\n" +
    "This guided debut includes a starter drop, " +
    "your card view, collection and books. " +
    "Finish it to receive **3,000 coins + " +
    "2 current-season Epic cards**.",

    "Start my debut"
  ],

  tiers: [
    "🎴 Rarities, seasons and card codes",

    Object.entries(TIERS)
      .map(
        ([tier, emoji]) =>
          `${emoji} **${
            tier[0].toUpperCase() + tier.slice(1)
          }**`
      )
      .join("\n") +

    "\n\nRarities run from Common to Legendary; " +
    "higher tiers are rarer. Halloween cards " +
    "are separate event editions.\n\n" +

    "**Season 0 / Season 1** identify different " +
    "card editions.\n\n" +

    "**Serial #** identifies the numbered copy " +
    "of a character in its season; lower " +
    "serials are prized.\n\n" +

    "Your **card code** identifies your owned " +
    "copy for view, give and other commands. " +
    "It is separate from your referral code.",

    "Try a drop"
  ],

  drop: [
    "🎴 Make your first drop",

    "Press **Drop my starter** to reveal a card, " +
    "then claim it. This tutorial drop is " +
    "reserved for you.\n\n" +

    "Outside debut, `drop` shows cards with " +
    "claim buttons. Claim a card to add it " +
    "to your collection.\n\n" +

    "Normal drops and grabs have cooldowns; " +
    "check `cooldown`.",

    "Drop my starter"
  ],

  claim: [
    "🎴 Your starter drop",

    "Your card is below. Press **Claim my card** " +
    "to save it to your collection.",

    "Claim my card"
  ],

  view: [
    "🖼️ View your card",

    "Press **View my card** to open the card " +
    "you claimed.\n\n" +

    "Later, use `view <card code>` or `/view` " +
    "for your latest card. The image uses " +
    "your card's season and frame.",

    "View my card"
  ],

  collection: [
    "🗂️ Your collection",

    "Press **Open my collection** to see " +
    "your cards.\n\n" +

    "Use `collection` / `col` later. Its menu " +
    "supports sorting, season filters " +
    "and image view.",

    "Open my collection"
  ],

  books: [
    "📚 Complete your books",

    "Press **Open my books** to see your " +
    "progress across series.\n\n" +

    "`books` counts unique characters you " +
    "own in each series and season. Duplicate " +
    "copies do not increase completion.\n\n" +

    "Switch to the current season in the " +
    "menu to see your starter.",

    "Open my books"
  ],

  tools: [
    "✨ Your next steps",

    "**Find cards:** `info <name>` and " +
    "`wishlist`. Add a target with " +
    "`wishlist add n:spider-man`; optional " +
    "season and appearance filters narrow " +
    "the match.\n\n" +

    "**Organize:** `tag`, `fav`, `favcards` " +
    "and albums.\n\n" +

    "**Earn and spend:** `daily`, `weekly`, " +
    "`balance`, `inventory`, `store`, `buy` " +
    "and `market`. Coins, Ultron Chips and " +
    "Groot Candy have different uses.\n\n" +

    "**More:** `give` transfers cards; " +
    "`burn` destroys cards for materials, " +
    "so choose carefully. Infinity stones " +
    "provide special effects.\n\n" +

    "`help` explains command syntax. Use bot " +
    "mentions, your server's prefix, or " +
    "available slash commands.",

    "Continue to referral"
  ],

  referral: [
    "🔗 Did someone invite you?",

    "Press **Enter code or none**. Enter " +
    "their **six-digit referral code**, or " +
    "type **none** if you do not have one.\n\n" +

    "Your referrer receives **3 Ultron Chips + " +
    "500 coins + 300 candies**.\n\n" +

    "You receive your own **3,000 coins + " +
    "2 current-season Epics** either way.\n\n" +

    "You can choose a referral once, during " +
    "debut. Afterwards, use `refer` to share " +
    "your own permanent code.",

    "Enter code or none"
  ]
};

const next = {
  welcome: "tiers",
  tiers: "drop",
  view: "collection",
  collection: "books",
  books: "tools",
  tools: "referral"
};

function payload(stage) {
  const [
    title,
    description,
    label
  ] = pages[stage];

  return {
    content: "",
    attachments: [],

    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle(title)
        .setDescription(description)
        .setFooter({
          text: "GrootX • Your first adventure"
        })
    ],

    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`debut_${stage}`)
          .setLabel(label)
          .setStyle(ButtonStyle.Success)
      )
    ],

    allowedMentions: {
      parse: []
    }
  };
}

async function showMenu(
  name,
  message,
  user,
  send
) {
  // Invoke the real command within the tutorial.
  const command =
    message.client.commands?.get(name) ||
    require(`./${name}`);

  const context = {
    author: user,
    user,
    client: message.client,
    channel: message.channel,
    guild: message.guild,
    guildId: message.guildId,
    member: message.member,

    mentions: {
      users: new Map()
    },

    reply: async value => {
      const data =
        typeof value === "string"
          ? { content: value }
          : { ...value };

      if (
        /^❌/.test(data.content || "")
      ) {
        throw new Error(data.content);
      }

      delete data.attachments;

      data.allowedMentions = {
        parse: []
      };

      return send(data);
    }
  };

  await command.execute(context, []);
}

async function execute(message) {
  const slash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user =
    slash ? message.user : message.author;

  if (
    slash &&
    !message.deferred &&
    !message.replied
  ) {
    await message.deferReply();
  }

  const reply = data =>
    slash
      ? message.editReply(data)
      : message.reply(data);

  const send = data =>
    slash
      ? message.followUp(data)
      : message.channel.send(data);

  let db;
  let token;
  let menu;

  if (user.bot) {
    return reply({
      content: "Bots cannot complete debut."
    });
  }

  if (active.has(user.id)) {
    return reply({
      content:
        "Your debut is already running. " +
        "Continue in its menu."
    });
  }

  active.add(user.id);

  try {
    if (
      !regular.length ||
      !epics.length
    ) {
      throw new Error(
        "Current season needs renderable cards and Epics"
      );
    }

    db = await connectDB();

    await indexes(db);

    const states = db.collection("debuts");

    let state = await states.findOne({
      userId: user.id
    });

    // Legacy completed records may lack a stage.
    if (
      state?.completedAt ||
      (
        state &&
        state.eligible !== true
      )
    ) {
      return await reply({
        content:
          "❌ You have already debuted. " +
          "This command is for brand-new players."
      });
    }

    if (!state) {
      if (
        await hasPlayedBefore(db, user.id)
      ) {
        return await reply({
          content:
            "❌ Debut is only for players " +
            "who have never used GrootX before."
        });
      }

      try {
        await states.insertOne({
          userId: user.id,
          eligible: true,
          stage: "welcome",
          startedAt: Date.now()
        });
      } catch (error) {
        if (error.code !== 11000) {
          throw error;
        }
      }
    }

    token = randomBytes(12).toString("hex");

    const lease = await states.updateOne(
      {
        userId: user.id,
        eligible: true,
        completedAt: { $exists: false },

        $or: [
          {
            leaseUntil: { $exists: false }
          },
          {
            leaseUntil: { $lt: Date.now() }
          }
        ]
      },
      {
        $set: {
          leaseToken: token,
          leaseUntil: Date.now() + LEASE_MS
        }
      }
    );

    if (!lease.modifiedCount) {
      return await reply({
        content:
          "Your debut is already running. " +
          "Continue there, or retry when " +
          "that session expires."
      });
    }

    await refer.getOrCreateReferral(
      db,
      user.id
    );

    state = await states.findOne({
      userId: user.id
    });

    menu = await reply(
      payload(state.stage)
    );

    while (true) {
      state = await states.findOne({
        userId: user.id,
        leaseToken: token
      });

      if (!state) {
        problem("SESSION_EXPIRED");
      }

      let interaction;

      try {
        interaction = await menu
          .awaitMessageComponent({
            filter: interaction =>
              interaction.user.id === user.id &&
              interaction.customId ===
                `debut_${state.stage}`,

            time: 180000
          });
      } catch (_) {
        await menu.edit({
          content:
            "⏳ Debut paused. Run `debut` " +
            "again to resume; your progress " +
            "is saved.",

          components: []
        });

        break;
      }

      if (state.stage === "referral") {
        const modalId =
          `debut_ref_${token}_` +
          randomBytes(3).toString("hex");

        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle("GrootX referral")
          .addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId("code")
                  .setLabel(
                    "Six-digit referral code, or none"
                  )
                  .setStyle(TextInputStyle.Short)
                  .setMinLength(4)
                  .setMaxLength(6)
                  .setRequired(true)
              )
          );

        await interaction.showModal(modal);

        let submitted;

        try {
          submitted = await interaction
            .awaitModalSubmit({
              filter: submission =>
                submission.user.id === user.id &&
                submission.customId === modalId,

              time: 180000
            });
        } catch (_) {
          continue;
        }

        await submitted.deferReply({
          ephemeral: true
        });

        try {
          const input = submitted.fields
            .getTextInputValue("code")
            .trim()
            .toLowerCase();

          const result = await finish(
            db,
            user.id,
            token,
            input
          );

          await submitted.editReply(
            "✅ Debut complete! " +
            "Your rewards have been added."
          );

          const rewardLines = result.rewards
            .map(owned =>
              cardLine(
                resolveCard(owned),
                owned
              )
            )
            .join("\n");

          const referralText =
            result.referrerId
              ? "🔗 Your referrer received " +
                "3 chips, 500 coins and 300 candies."
              : "Referral: none.";

          const completedEmbed =
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("🎉 Welcome to GrootX!")
              .setDescription(
                `${COIN} **3,000 coins**\n\n` +

                `**2 Season ${CURRENT_SEASON} ` +
                `Epic cards:**\n${rewardLines}\n\n` +

                "Your claimed starter is also yours.\n" +
                `${referralText}\n\n` +

                "Try `daily`, `drop`, `view`, " +
                "`collection`, `books`, `help` " +
                "and `refer` next."
              );

          await menu.edit({
            content: "",
            attachments: [],
            components: [],
            embeds: [completedEmbed]
          });

          break;
        } catch (error) {
          const hints = {
            INVALID_FORMAT:
              "Enter exactly six digits, " +
              "or type none.",

            INVALID_CODE:
              "That referral code does not exist. " +
              "Check it and try again, " +
              "or enter none.",

            SELF_REFERRAL:
              "You cannot enter your own code. " +
              "Enter your friend's code or none.",

            REFERRAL_USED:
              "A referral was already recorded " +
              "for your account. Contact " +
              "the bot owner.",

            SESSION_EXPIRED:
              "This session has ended. " +
              "Run debut again."
          };

          if (!hints[error.code]) {
            console.error(
              "[DEBUT] Completion error",
              error
            );
          }

          await submitted.editReply(
            hints[error.code] ||
            "Could not save rewards. " +
            "Your progress is saved; try again."
          );

          // Completion may have committed even
          // if Discord delivery failed.
          const saved = await states.findOne({
            userId: user.id
          });

          if (saved?.completedAt) {
            break;
          }

          continue;
        }
      }

      await interaction.deferUpdate();

      try {
        await states.updateOne(
          {
            userId: user.id,
            leaseToken: token
          },
          {
            $set: {
              leaseUntil: Date.now() + LEASE_MS
            }
          }
        );

        let stage = next[state.stage];

        if (state.stage === "drop") {
          const card = starterCard();

          await states.updateOne(
            {
              userId: user.id,
              leaseToken: token
            },
            {
              $set: {
                previewCardId: Number(card.id),
                stage: "claim"
              }
            }
          );

          // Save before rendering so retries
          // never re-roll the starter.
          stage = "claim";
        }

        if (
          state.stage === "drop" ||
          state.stage === "claim"
        ) {
          const saved = await states.findOne({
            userId: user.id
          });

          if (state.stage === "claim") {
            await claimStarter(
              db,
              user.id,
              token
            );

            stage = "view";
          } else {
            const card = resolveCard({
              cardId: saved.previewCardId
            });

            const image = await renderCard(
              {
                ...card,
                season: CURRENT_SEASON
              },
              "?",
              {
                season: CURRENT_SEASON
              }
            );

            const data = payload("claim");

            data.files = [
              {
                attachment: image,
                name: "debut-drop.png"
              }
            ];

            data.embeds[0]
              .setDescription(
                `**${short(card.name)}** • ` +

                `${
                  TIERS[
                    String(card.tier).toLowerCase()
                  ] || "🎴"
                } ${short(card.tier)}\n\n` +

                "Claim this card to get its " +
                "serial and unique code."
              )
              .setImage(
                "attachment://debut-drop.png"
              );

            await menu.edit(data);

            continue;
          }
        } else if (state.stage === "view") {
          const card = resolveCard(
            state.starter
          );

          const image = await renderCard(
            {
              ...card,
              season: CURRENT_SEASON
            },
            state.starter.serial,
            state.starter
          );

          const viewEmbed = new EmbedBuilder()
            .setColor(0x00aeff)
            .setTitle("🖼️ Your first card")
            .setDescription(
              cardLine(card, state.starter) +

              "\n\nUse " +
              `\`view ${state.starter.code}\` later.`
            )
            .setImage(
              "attachment://debut-card.png"
            );

          await send({
            embeds: [viewEmbed],

            files: [
              {
                attachment: image,
                name: "debut-card.png"
              }
            ],

            allowedMentions: {
              parse: []
            }
          });
        } else if (
          state.stage === "collection" ||
          state.stage === "books"
        ) {
          await showMenu(
            state.stage,
            message,
            user,
            send
          );
        }

        await states.updateOne(
          {
            userId: user.id,
            leaseToken: token
          },
          {
            $set: { stage }
          }
        );

        await menu.edit(
          payload(stage)
        );
      } catch (error) {
        console.error(
          "[DEBUT] Tutorial step",
          error
        );

        // Reload progress, including claims
        // saved before a UI failure.
        const saved = await states.findOne({
          userId: user.id
        });

        await menu
          .edit(payload(saved.stage))
          .catch(() => {});

        await interaction
          .followUp({
            content:
              "Could not display this step. " +
              "Press the button to retry; " +
              "your progress is saved.",

            ephemeral: true
          })
          .catch(() => {});
      }
    }
  } catch (error) {
    console.error("[DEBUT]", error);

    const data = {
      content:
        "❌ Could not start debut. " +
        "Please try again; existing " +
        "progress is saved.",

      components: []
    };

    if (menu) {
      await menu.edit(data).catch(() => {});
    } else {
      await reply(data).catch(() => {});
    }
  } finally {
    active.delete(user.id);

    if (db && token) {
      await db.collection("debuts")
        .updateOne(
          {
            userId: user.id,
            leaseToken: token
          },
          {
            $unset: {
              leaseToken: "",
              leaseUntil: ""
            }
          }
        )
        .catch(error =>
          console.error(
            "[DEBUT] Lease cleanup",
            error
          )
        );
    }
  }
}

module.exports = {
  name: "debut",

  data: new SlashCommandBuilder()
    .setName("debut")
    .setDescription(
      "Start your GrootX adventure with a " +
      "guided tutorial and starter rewards."
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute,

  canUseCommand,
  hasPlayedBefore
};