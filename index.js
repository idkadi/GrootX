require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { AsyncLocalStorage } = require("node:async_hooks");

const connectDB = require("./database");
const cards = require("./data/season1");
const SEASON = 1;

const autoDrop = require("./systems/autoDrop");
const express = require("express");
const Topgg = require("@top-gg/sdk");
const topggApi = new Topgg.Api(process.env.TOPGG_TOKEN);

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  InteractionCollector
} = require("discord.js");

console.log("\n========== CARD LOADING ==========");
console.log(`✅ Season 1 Cards Loaded: ${cards.length}`);

let brokenImages = 0;
let brokenRawImages = 0;

const rawDir = path.join(__dirname, "images", "raw");

let rawImageFiles = [];

try {
  rawImageFiles = fs
    .readdirSync(rawDir)
    .filter(file =>
      [".png", ".jpg", ".jpeg", ".webp"].includes(
        path.extname(file).toLowerCase()
      )
    );

  console.log(
    `🖼️ Total Raw Images Found: ${rawImageFiles.length}`
  );
} catch (err) {
  console.log("❌ images/raw folder not found!");
  console.log(`Path checked: ${rawDir}`);
}

cards.forEach(card => {
  if (card.rawImage) {
    const rawPath = path.join(
      __dirname,
      "images",
      card.rawImage
    );

    if (!fs.existsSync(rawPath)) {
      console.log(
        `❌ Missing Raw Image: ${card.name} => ${card.rawImage}`
      );

      brokenRawImages++;
    }
  } else if (card.image) {
    const imagePath = path.join(
      __dirname,
      "images",
      card.image
    );

    if (!fs.existsSync(imagePath)) {
      console.log(
        `❌ Missing Image: ${card.name} => ${card.image}`
      );

      brokenImages++;
    }
  } else {
    console.log(
      `❌ No image/rawImage set for card: ${card.name}`
    );

    brokenImages++;
  }
});

if (
  brokenImages === 0 &&
  brokenRawImages === 0
) {
  console.log(
    "✅ All card images and raw images found!"
  );
} else {
  console.log(
    `❌ Broken normal images: ${brokenImages}`
  );

  console.log(
    `❌ Broken raw images: ${brokenRawImages}`
  );
}

console.log("==================================\n");

// ==========================================
// CLIENT
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],

  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

client.commands = new Collection();

// ==========================================
// COMMAND LOADING
// ==========================================

const commandsPath = path.join(
  __dirname,
  "commands"
);

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file =>
    file.endsWith(".js")
  );

for (const file of commandFiles) {
  const filePath = path.join(
    commandsPath,
    file
  );

  const command = require(filePath);

  if (!command.name) {
    console.log(
      `⚠️ Command file missing name: ${file}`
    );

    continue;
  }

  client.commands.set(
    command.name,
    command
  );
}

// ==========================================
// ONBOARDING ACCESS + LIFETIME WELCOME DM
// ==========================================

const SUPPORT_SERVER = "https://discord.gg/QBYkY6dc46";
const debutContext = new AsyncLocalStorage();
const welcomeQueue = new Map();

let welcomeWorkerRunning = false;
let welcomeBackfillRunning = false;

function debutCommand() {
  const command = client.commands.get("debut");

  if (
    !command ||
    typeof command.hasPlayedBefore !== "function"
  ) {
    throw new Error(
      "Install the patched commands/debut.js before starting GrootX."
    );
  }

  return command;
}

async function playerHasAccess(db, userId) {
  const state = await db
    .collection("debuts")
    .findOne({ userId });

  if (
    state?.completedAt ||
    (state && state.eligible !== true)
  ) {
    return true;
  }

  if (state?.eligible === true) {
    return false;
  }

  const access = db.collection("playerAccess");
  const saved = await access.findOne({ _id: userId });

  if (saved) {
    return saved.status === "legacy";
  }

  // Classify before commands create gameplay records.
  const legacy = await debutCommand()
    .hasPlayedBefore(db, userId);

  try {
    await access.insertOne({
      _id: userId,
      userId,
      status: legacy ? "legacy" : "onboarding",
      firstSeenAt: Date.now()
    });

    return legacy;
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    const winner = await access.findOne({
      _id: userId
    });

    return winner?.status === "legacy";
  }
}

const debutNotice =
  "🌱 Welcome to GrootX! Complete your debut before using other commands. " +
  "Use **/debut** or mention me with **debut** to begin.";

async function rejectLockedInteraction(interaction) {
  if (interaction.deferred) {
    return interaction.editReply({
      content: debutNotice,
      components: [],
      embeds: []
    });
  }

  if (interaction.replied) {
    return interaction.followUp({
      content: debutNotice,
      ephemeral: true
    });
  }

  return interaction.reply({
    content: debutNotice,
    ephemeral: true
  });
}

function welcomePayload() {
  const embed = new EmbedBuilder()
    .setColor(0x22c55e)
    .setTitle("🌱 Welcome to the GrootX family!")
    .setDescription(
      "Thank you for playing **GrootX** and being part of our community! " +
      "Whether you are just starting or have been collecting for a while, " +
      "we are glad you are here.\n\n" +
      "Collect Marvel cards, complete books, build albums and share your " +
      "collection with other players.\n\n" +
      "Join our official server for updates, events, trading and support:\n" +
      SUPPORT_SERVER + "\n\n" +
      "New here? Start with **/debut**. Already playing? Use **/help** " +
      "or mention GrootX with **help** to explore the commands."
    )
    .setFooter({
      text: "Thank you for supporting GrootX 💚"
    });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel("Join the GrootX server")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER)
    );

  return {
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] }
  };
}

async function sendLifetimeWelcome(userId, knownUser) {
  const db = await connectDB();
  const welcomes = db.collection("welcomeMessages");

  // Claim before sending to prevent duplicate lifetime welcomes.
  try {
    await welcomes.insertOne({
      _id: userId,
      userId,
      status: "claimed",
      attemptedAt: Date.now()
    });
  } catch (error) {
    if (error.code === 11000) {
      return;
    }

    throw error;
  }

  try {
    const user =
      knownUser ||
      await client.users.fetch(userId);

    if (user.bot) {
      await welcomes.updateOne(
        { _id: userId },
        {
          $set: {
            status: "bot-skipped"
          }
        }
      );

      return;
    }

    await user.send(welcomePayload());

    await welcomes.updateOne(
      { _id: userId },
      {
        $set: {
          status: "sent",
          sentAt: Date.now()
        }
      }
    );
  } catch (error) {
    // Do not retry an ambiguous send that may have reached Discord.
    // Closed DMs never interrupt commands.
    await welcomes.updateOne(
      { _id: userId },
      {
        $set: {
          status: "failed",
          failedAt: Date.now(),
          errorCode: String(error.code || "UNKNOWN")
        }
      }
    ).catch(() => {});

    console.warn(
      `[WELCOME] Could not welcome ${userId}: ${
        error.code || error.message
      }`
    );
  }
}

function queueWelcome(userId, user) {
  if (
    !/^\d{17,20}$/.test(String(userId)) ||
    user?.bot
  ) {
    return;
  }

  if (!welcomeQueue.has(userId)) {
    welcomeQueue.set(userId, user || null);
  }

  void runWelcomeQueue();
}

async function runWelcomeQueue() {
  if (welcomeWorkerRunning) {
    return;
  }

  welcomeWorkerRunning = true;

  try {
    while (welcomeQueue.size) {
      const [userId, user] =
        welcomeQueue.entries().next().value;

      welcomeQueue.delete(userId);

      try {
        await sendLifetimeWelcome(userId, user);
      } catch (error) {
        console.error(
          "[WELCOME] Queue error",
          error
        );
      }

      // Gradual delivery. Discord.js also handles rate limits.
      await new Promise(resolve =>
        setTimeout(resolve, 1000)
      );
    }
  } finally {
    welcomeWorkerRunning = false;
  }
}

async function backfillWelcomeMessages() {
  if (welcomeBackfillRunning) {
    return;
  }

  welcomeBackfillRunning = true;

  try {
    const db = await connectDB();
    const seen = new Set();

    const sources = [
      "collections",
      "balances",
      "inventory",
      "cooldowns",
      "profiles",
      "wishlists",
      "albums",
      "debuts",
      "referrals",
      "daily",
      "weekly",
      "reminders",
      "voteStreaks",
      "tradePasses",
      "stoneeffects",
      "playerAccess"
    ];

    for (const name of sources) {
      const cursor = db.collection(name).find(
        {
          userId: { $type: "string" }
        },
        {
          projection: { userId: 1 }
        }
      );

      for await (const record of cursor) {
        if (seen.has(record.userId)) {
          continue;
        }

        seen.add(record.userId);

        const done = await db
          .collection("welcomeMessages")
          .findOne(
            { _id: record.userId },
            { projection: { _id: 1 } }
          );

        if (!done) {
          queueWelcome(record.userId);
        }
      }
    }

    console.log(
      `[WELCOME] Checked ${seen.size} existing player IDs.`
    );
  } catch (error) {
    console.error(
      "[WELCOME] Backfill error",
      error
    );
  } finally {
    welcomeBackfillRunning = false;
  }
}

// Main handlers cannot stop independent drop collectors.
// Capture ownership of collectors created inside debut.
const originalMessageCollector =
  Message.prototype.createMessageComponentCollector;

Message.prototype.createMessageComponentCollector =
  function(options) {
    const collector =
      originalMessageCollector.call(this, options);

    collector.grootxDebutOwner =
      debutContext.getStore()?.userId;

    return collector;
  };

const originalInteractionCollect =
  InteractionCollector.prototype.collect;

InteractionCollector.prototype.collect =
  async function(interaction) {
    const key =
      originalInteractionCollect.call(this, interaction);

    if (
      !key ||
      !interaction.user ||
      interaction.user.bot
    ) {
      return key;
    }

    try {
      const db = await connectDB();

      // The player's own tutorial controls bypass the lock.
      if (
        this.grootxDebutOwner === interaction.user.id
      ) {
        return key;
      }

      const modal =
        /^debut_ref_([a-f0-9]{24})_[a-f0-9]{6}$/
          .exec(interaction.customId || "");

      if (modal) {
        const state = await db
          .collection("debuts")
          .findOne({
            userId: interaction.user.id,
            leaseToken: modal[1],
            stage: "referral",
            eligible: true
          });

        if (state && !state.completedAt) {
          return key;
        }
      }

      if (
        await playerHasAccess(db, interaction.user.id)
      ) {
        return key;
      }

      await rejectLockedInteraction(interaction)
        .catch(() => {});

      return null;
    } catch (error) {
      console.error(
        "[ACCESS] Collector check failed",
        error
      );

      if (
        !interaction.deferred &&
        !interaction.replied
      ) {
        await interaction.reply({
          content:
            "❌ Could not check your player status. Please try again.",
          ephemeral: true
        }).catch(() => {});
      }

      return null;
    }
  };

// ==========================================
// BOT STATUS
// ==========================================

function updateBotStatus() {
  try {
    const serverCount =
      client.guilds.cache.size;

    const playerCount =
      client.guilds.cache.reduce(
        (total, guild) =>
          total + (guild.memberCount || 0),
        0
      );

    client.user.setPresence({
      activities: [
        {
          name:
            `${playerCount} Heroes • ${serverCount} Servers`,
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });

    console.log(
      `✅ Status updated: ${playerCount} Heroes • ${serverCount} Servers`
    );
  } catch (err) {
    console.error(
      "❌ Status update error:",
      err
    );
  }
}

// ==========================================
// REMINDER CHECKER
// ==========================================

async function startReminderChecker(client) {
  const db = await connectDB();

  const remindersCol =
    db.collection("reminders");

  const cooldownsCol =
    db.collection("cooldowns");

  setInterval(async () => {
    try {
      const now = Date.now();

      const reminders = await remindersCol
        .find({ enabled: true })
        .toArray();

      for (const reminder of reminders) {
        let cooldownDoc = null;
        let cooldownTime = 0;

        if (reminder.type === "drop") {
          cooldownDoc = await cooldownsCol
            .findOne({
              userId: reminder.userId,
              type: "drop"
            });

          cooldownTime = 8 * 60 * 1000;
        } else if (reminder.type === "pickup") {
          cooldownDoc = await cooldownsCol
            .findOne({
              userId: reminder.userId,
              type: "pickup"
            });

          cooldownTime = 4 * 60 * 1000;
        } else if (reminder.type === "vote") {
          cooldownDoc = await cooldownsCol
            .findOne({
              userId: reminder.userId,
              type: "vote"
            });

          cooldownTime = 12 * 60 * 60 * 1000;
        } else if (reminder.type === "daily") {
          cooldownDoc = await db
            .collection("daily")
            .findOne({
              userId: reminder.userId
            });

          cooldownTime = 24 * 60 * 60 * 1000;
        } else if (reminder.type === "weekly") {
          cooldownDoc = await db
            .collection("weekly")
            .findOne({
              userId: reminder.userId
            });

          cooldownTime = 7 * 24 * 60 * 60 * 1000;
        }

        if (!cooldownDoc?.timestamp) {
          continue;
        }

        if (cooldownDoc.notified === true) {
          continue;
        }

        const ready =
          now - cooldownDoc.timestamp >= cooldownTime;

        if (!ready) {
          continue;
        }

        try {
          const user = await client.users.fetch(
            reminder.userId
          );

          await user.send(
            `🔔 Your **${reminder.type}** cooldown is over!`
          );

          if (
            reminder.type === "daily" ||
            reminder.type === "weekly"
          ) {
            await db.collection(reminder.type)
              .updateOne(
                { userId: reminder.userId },
                {
                  $set: { notified: true }
                }
              );
          } else {
            await cooldownsCol.updateOne(
              {
                userId: reminder.userId,
                type: reminder.type
              },
              {
                $set: { notified: true }
              }
            );
          }
        } catch (err) {
          console.log(
            `Could not DM ${reminder.userId}: ${err.message}`
          );
        }
      }
    } catch (err) {
      console.error(
        "❌ Reminder checker error:",
        err
      );
    }
  }, 60 * 1000);
}

// ==========================================
// SAFE PREFIX ERROR
// ==========================================

async function safeSendError(message) {
  try {
    if (!message.guild) {
      await message.reply(
        "❌ An error occurred while executing this command."
      ).catch(() => {});

      return;
    }

    const me = message.guild.members.me;
    const perms = message.channel.permissionsFor(me);

    if (
      !perms ||
      !perms.has([
        "ViewChannel",
        "SendMessages"
      ])
    ) {
      return;
    }

    await message.reply(
      "❌ An error occurred while executing this command."
    ).catch(async () => {
      await message.channel.send(
        "❌ An error occurred while executing this command."
      ).catch(() => {});
    });
  } catch (err) {
    console.error(
      "❌ Could not send error message:",
      err
    );
  }
}

// ==========================================
// SAFE SLASH ERROR
// ==========================================

async function safeSlashError(interaction) {
  const content =
    "❌ An error occurred while executing this command.";

  try {
    if (interaction.deferred) {
      await interaction.editReply({ content });
    } else if (interaction.replied) {
      await interaction.followUp({
        content,
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error(
      "❌ Could not send slash error:",
      error
    );
  }
}

// ==========================================
// FIND COMMAND
// ==========================================

function findCommand(commandName) {
  return (
    client.commands.get(commandName) ||
    client.commands.find(
      cmd =>
        cmd.aliases &&
        cmd.aliases.includes(commandName)
    )
  );
}

// ==========================================
// READY
// ==========================================

client.once("clientReady", async () => {
  await connectDB();

  debutCommand();
  void backfillWelcomeMessages();

  console.log(
    `${client.user.tag} is online!`
  );

  await updateTopggStats();

  setInterval(
    updateTopggStats,
    30 * 60 * 1000
  );

  updateBotStatus();

  setInterval(
    updateBotStatus,
    5 * 60 * 1000
  );

  autoDrop(client);
  startReminderChecker(client);
  startTopggWebhook(client);
});

// ==========================================
// GUILD EVENTS
// ==========================================

client.on("guildCreate", () => {
  updateBotStatus();
  updateTopggStats();
});

client.on("guildDelete", () => {
  updateBotStatus();
  updateTopggStats();
});

// ==========================================
// PREFIX / MENTION COMMANDS
// ==========================================

client.on("messageCreate", async message => {
  try {
    if (message.author.bot) {
      return;
    }

    const content =
      String(message.content || "").trim();

    if (!content) {
      return;
    }

    const db = await connectDB();

    const guildPrefix = message.guild
      ? await db.collection("prefixes").findOne({
          guildId: message.guild.id
        })
      : null;

    const PREFIX =
      guildPrefix?.prefix || "!";

    const mentionRegex =
      new RegExp(`^<@!?${client.user.id}>\\s*`);

    let text;

    if (content.startsWith(PREFIX)) {
      text = content.slice(PREFIX.length).trim();
    } else if (mentionRegex.test(content)) {
      text = content
        .replace(mentionRegex, "")
        .trim();
    } else {
      return;
    }

    queueWelcome(
      message.author.id,
      message.author
    );

    const allowed = await playerHasAccess(
      db,
      message.author.id
    );

    const args =
      text ? text.split(/\s+/) : [];

    const commandName =
      (args.shift() || "").toLowerCase();

    const command = commandName
      ? findCommand(commandName)
      : null;

    if (
      !allowed &&
      command?.name !== "debut"
    ) {
      return await message.reply({
        content: debutNotice,
        allowedMentions: {
          repliedUser: false
        }
      });
    }

    if (!commandName) {
      return await message.reply({
        content:
          `👋 My prefix here is \`${PREFIX}\`.\n` +
          `Use \`${PREFIX}help\`, **/help**, ` +
          "or mention me with **help**.",

        allowedMentions: {
          repliedUser: false
        }
      });
    }

    if (!command) {
      return;
    }

    try {
      if (command.name === "debut") {
        await debutContext.run(
          { userId: message.author.id },
          () => command.execute(
            message,
            args,
            client
          )
        );
      } else {
        await command.execute(
          message,
          args,
          client
        );
      }
    } catch (error) {
      console.error("[COMMAND]", error);
      await safeSendError(message);
    }
  } catch (error) {
    console.error(
      "❌ messageCreate error:",
      error
    );

    await safeSendError(message);
  }
});

// ==========================================
// INTERACTIONS
// ==========================================

client.on("interactionCreate", async interaction => {
  try {
    if (
      interaction.user &&
      !interaction.user.bot
    ) {
      queueWelcome(
        interaction.user.id,
        interaction.user
      );
    }

    if (interaction.isChatInputCommand()) {
      const command = findCommand(
        interaction.commandName
      );

      // Acknowledge before database and image work.
      await interaction.deferReply();

      // Support older handlers that call reply() directly.
      const initialReply =
        interaction.reply.bind(interaction);

      interaction.reply = async payload => {
        if (
          interaction.deferred &&
          !interaction.replied
        ) {
          const data =
            typeof payload === "string"
              ? { content: payload }
              : { ...payload };

          delete data.ephemeral;

          return interaction.editReply(data);
        }

        if (interaction.replied) {
          return interaction.followUp(payload);
        }

        return initialReply(payload);
      };

      const db = await connectDB();

      const allowed = await playerHasAccess(
        db,
        interaction.user.id
      );

      if (
        !allowed &&
        command?.name !== "debut"
      ) {
        return await rejectLockedInteraction(
          interaction
        );
      }

      if (!command) {
        return await interaction.editReply(
          "❌ Unknown slash command."
        );
      }

      const handler = [
        command.slashExecute,
        command.executeSlash,
        command.slash,
        command.data ? command.execute : null
      ].find(fn =>
        typeof fn === "function"
      );

      if (!handler) {
        return await interaction.editReply(
          "❌ This command has no slash handler yet. " +
          "Mention me with the command instead."
        );
      }

      const invoke = () =>
        handler === command.execute
          ? handler.call(
              command,
              interaction,
              [],
              client
            )
          : handler.call(
              command,
              interaction,
              client
            );

      if (command.name === "debut") {
        await debutContext.run(
          { userId: interaction.user.id },
          invoke
        );
      } else {
        await invoke();
      }

      return;
    }

    // Other menus and modal submissions use collectors.
    if (!interaction.isButton()) {
      return;
    }

    if (
      interaction.customId.startsWith("battle_accept_") ||
      interaction.customId.startsWith("battle_decline_")
    ) {
      return;
    }

    const battle =
      client.commands.get("battle");

    if (
      interaction.customId.startsWith("battle_") &&
      typeof battle?.handleButton === "function"
    ) {
      const db = await connectDB();

      if (
        !(await playerHasAccess(
          db,
          interaction.user.id
        ))
      ) {
        return await rejectLockedInteraction(
          interaction
        );
      }

      return await battle.handleButton(
        interaction
      );
    }
  } catch (error) {
    console.error(
      "❌ Interaction error:",
      error
    );

    await safeSlashError(interaction);
  }
});

// ==========================================
// PROCESS ERRORS
// ==========================================

process.on("unhandledRejection", err => {
  console.error(
    "UNHANDLED REJECTION:",
    err
  );
});

process.on("uncaughtException", err => {
  console.error(
    "UNCAUGHT EXCEPTION:",
    err
  );
});

// ==========================================
// TOP.GG STATS
// ==========================================

async function updateTopggStats() {
  try {
    const serverCount =
      client.guilds.cache.size;

    await topggApi.postStats({
      serverCount
    });

    console.log(
      `✅ Top.gg updated: ${serverCount} servers`
    );
  } catch (err) {
    console.error(
      "❌ Top.gg update failed:",
      err
    );
  }
}

// ==========================================
// TOP.GG WEBHOOK
// ==========================================

async function startTopggWebhook(client) {
  const app = express();

  app.use(express.json());

  const COIN_EMOJI =
    "<:grootcoin:1504742213110861834>";

  const CHIP_EMOJI =
    "<:chipslogo:1519287944421048320>";

  const EPIC_EMOJI =
    "<:epic:1504510771214680175>";

  const LEGENDARY_EMOJI =
    "<:legendary:1504511435974377552>";

  async function generateUniqueCode(collectionsCol) {
    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789";

    while (true) {
      let code = "";

      for (let i = 0; i < 6; i++) {
        code += chars.charAt(
          Math.floor(
            Math.random() * chars.length
          )
        );
      }

      const exists = await collectionsCol
        .findOne({ code });

      if (!exists) {
        return code;
      }
    }
  }

  async function giveRandomCard(
    db,
    userId,
    tier
  ) {
    const collectionsCol =
      db.collection("collections");

    const serialsCol =
      db.collection("serials");

    const tierCards = cards.filter(
      card =>
        String(card.tier || "").toLowerCase() ===
        String(tier || "").toLowerCase()
    );

    if (tierCards.length === 0) {
      return null;
    }

    const card = tierCards[
      Math.floor(
        Math.random() * tierCards.length
      )
    ];

    await serialsCol.updateOne(
      {
        cardId: Number(card.id),
        season: SEASON
      },
      {
        $inc: {
          serial: 1
        },
        $setOnInsert: {
          season: SEASON
        }
      },
      {
        upsert: true
      }
    );

    const serialDoc = await serialsCol.findOne({
      cardId: Number(card.id),
      season: SEASON
    });

    if (!serialDoc) {
      throw new Error(
        `Failed to generate S1 serial for card ${card.id}`
      );
    }

    const serial = serialDoc.serial;

    const code = await generateUniqueCode(
      collectionsCol
    );

    await collectionsCol.insertOne({
      userId,
      cardId: Number(card.id),
      season: SEASON,
      serial,
      code,
      tag: null,
      favorite: false
    });

    return {
      card: {
        ...card,
        season: SEASON
      },
      season: SEASON,
      serial,
      code
    };
  }

  app.post("/topgg", async (req, res) => {
    try {
      const vote = req.body;

      console.log(
        "📩 Top.gg webhook received:",
        vote
      );

      if (vote.type === "webhook.test") {
        console.log(
          "🧪 Top.gg test event ignored"
        );

        return res.status(200).send("OK");
      }

      const userId =
        vote.user ||
        vote.userId ||
        vote.discord_id ||
        vote.discordId ||
        vote.data?.user?.platform_id ||
        vote.data?.user?.id;

      if (!userId) {
        return res.status(400).send(
          "Missing user id"
        );
      }

      const db = await connectDB();

      // Classify before vote rewards create balances.
      await playerHasAccess(db, userId);
      queueWelcome(String(userId));

      const cooldownsCol =
        db.collection("cooldowns");

      const now = Date.now();

      const voteCooldown =
        11.5 * 60 * 60 * 1000;

      const existing = await cooldownsCol
        .findOne({
          type: "vote",
          userId
        });

      if (
        existing &&
        now - existing.timestamp < voteCooldown
      ) {
        console.log(
          `⚠️ Duplicate vote ignored for ${userId}`
        );

        return res.status(200).send(
          "Duplicate"
        );
      }

      await cooldownsCol.updateOne(
        {
          type: "vote",
          userId
        },
        {
          $set: {
            timestamp: now,
            notified: false
          }
        },
        {
          upsert: true
        }
      );

      const voteStreaksCol =
        db.collection("voteStreaks");

      const streakDoc = await voteStreaksCol
        .findOne({ userId });

      let streak =
        (streakDoc?.streak || 0) + 1;

      let extraChips = 0;
      const rewardLines = [];

      if (streak === 5) {
        extraChips += 3;

        rewardLines.push(
          `${CHIP_EMOJI} **Milestone 5:** +3 Ultron Chips`
        );
      }

      if (streak === 10) {
        const reward = await giveRandomCard(
          db,
          userId,
          "epic"
        );

        if (reward) {
          rewardLines.push(
            `1️⃣ ${EPIC_EMOJI} **Milestone 10:** ` +
            `${reward.card.name} ` +
            `#${reward.serial} • ` +
            `\`${reward.code}\``
          );
        }
      }

      if (streak === 15) {
        extraChips += 3;

        rewardLines.push(
          `${CHIP_EMOJI} **Milestone 15:** +3 Ultron Chips`
        );
      }

      if (streak === 20) {
        const rewards = [];

        for (let i = 0; i < 3; i++) {
          const reward = await giveRandomCard(
            db,
            userId,
            "epic"
          );

          if (reward) {
            rewards.push(reward);
          }
        }

        if (rewards.length > 0) {
          rewardLines.push(
            `${EPIC_EMOJI} **Milestone 20:**\n` +
            rewards.map(
              reward =>
                `• 1️⃣ ${reward.card.name} ` +
                `#${reward.serial} • ` +
                `\`${reward.code}\``
            ).join("\n")
          );
        }
      }

      let resetStreak = false;

      if (streak === 30) {
        const reward = await giveRandomCard(
          db,
          userId,
          "legendary"
        );

        if (reward) {
          rewardLines.push(
            `1️⃣ ${LEGENDARY_EMOJI} **Milestone 30:** ` +
            `${reward.card.name} ` +
            `#${reward.serial} • ` +
            `\`${reward.code}\``
          );
        }

        resetStreak = true;
      }

      await db.collection("balances").updateOne(
        { userId },
        {
          $inc: {
            coins: 700,
            ultronChips: 1 + extraChips
          }
        },
        {
          upsert: true
        }
      );

      await voteStreaksCol.updateOne(
        { userId },
        {
          $set: {
            streak: resetStreak ? 0 : streak,
            updatedAt: Date.now()
          }
        },
        {
          upsert: true
        }
      );

      try {
        const user = await client.users.fetch(
          userId
        );

        await user.send(
          "🗳️ Thanks for voting for **GrootX**!\n\n" +
          `${COIN_EMOJI} **+700 Coins**\n` +
          `${CHIP_EMOJI} **+1 Ultron Chip**\n\n` +
          `🔥 **Vote Streak:** ${
            resetStreak ? 0 : streak
          }/30\n` +
          (
            rewardLines.length > 0
              ? "\n🎁 **Milestone Reward • Season 1:**\n" +
                rewardLines.join("\n")
              : ""
          )
        );
      } catch {}

      console.log(
        `✅ Vote reward given to ${userId} | streak: ${
          resetStreak ? 0 : streak
        }/30`
      );

      return res.status(200).send("OK");
    } catch (err) {
      console.error(
        "❌ Top.gg webhook error:",
        err
      );

      return res.status(500).send("Error");
    }
  });

  const PORT =
    process.env.PORT || 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `✅ Top.gg webhook running on port ${PORT}`
    );
  });
}

// ==========================================
// LOGIN
// ==========================================

client.login(process.env.TOKEN);