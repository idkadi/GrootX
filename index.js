require("dotenv").config();

const fs = require("fs");
const path = require("path");

const connectDB = require("./database");
const cards = require("./data/cards");
const autoDrop = require("./systems/autoDrop");
const express = require("express");
const Topgg = require("@top-gg/sdk");
const topggApi = new Topgg.Api(process.env.TOPGG_TOKEN);

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ActivityType
} = require("discord.js");

console.log("\n========== CARD LOADING ==========");
console.log(`✅ Total Cards Loaded: ${cards.length}`);

let brokenImages = 0;

cards.forEach(card => {
  const imagePath = path.join(__dirname, "images", card.image);

  if (!fs.existsSync(imagePath)) {
    console.log(`❌ Missing Image: ${card.image}`);
    brokenImages++;
  }
});

if (brokenImages === 0) {
  console.log("✅ All card images found!");
} else {
  console.log(`❌ ${brokenImages} broken images found`);
}

console.log("==================================\n");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  client.commands.set(command.name, command);
}

function updateBotStatus() {
  try {
    const serverCount = client.guilds.cache.size;

    const playerCount = client.guilds.cache.reduce(
      (total, guild) => total + (guild.memberCount || 0),
      0
    );

    client.user.setPresence({
      activities: [
        {
          name: `${playerCount} Heroes • ${serverCount} Servers`,
          type: ActivityType.Watching
        }
      ],
      status: "online"
    });

    console.log(
      `✅ Status updated: ${playerCount} Heroes • ${serverCount} Servers`
    );
  } catch (err) {
    console.error("❌ Status update error:", err);
  }
}

async function startReminderChecker(client) {
  const db = await connectDB();

  const remindersCol = db.collection("reminders");
  const cooldownsCol = db.collection("cooldowns");

  setInterval(async () => {
    try {
      const now = Date.now();

      const reminders = await remindersCol.find({
        enabled: true
      }).toArray();

      for (const reminder of reminders) {
        let cooldownDoc = null;
        let cooldownTime = 0;

        if (reminder.type === "drop") {
          cooldownDoc = await cooldownsCol.findOne({
            userId: reminder.userId,
            type: "drop"
          });

          cooldownTime = 8 * 60 * 1000;
        }

        else if (reminder.type === "pickup") {
          cooldownDoc = await cooldownsCol.findOne({
            userId: reminder.userId,
            type: "pickup"
          });

          cooldownTime = 4 * 60 * 1000;
        }

        else if (reminder.type === "vote") {
          cooldownDoc = await cooldownsCol.findOne({
            userId: reminder.userId,
            type: "vote"
          });

          cooldownTime = 12 * 60 * 60 * 1000;
        }

        else if (reminder.type === "daily") {
          cooldownDoc = await db.collection("daily").findOne({
            userId: reminder.userId
          });

          cooldownTime = 24 * 60 * 60 * 1000;
        }

        else if (reminder.type === "weekly") {
          cooldownDoc = await db.collection("weekly").findOne({
            userId: reminder.userId
          });

          cooldownTime = 7 * 24 * 60 * 60 * 1000;
        }

        if (!cooldownDoc?.timestamp) continue;
        if (cooldownDoc.notified === true) continue;

        const ready =
          now - cooldownDoc.timestamp >= cooldownTime;

        if (!ready) continue;

        try {
          const user =
            await client.users.fetch(reminder.userId);

          await user.send(
            `🔔 Your **${reminder.type}** cooldown is over!`
          );

          if (
            reminder.type === "daily" ||
            reminder.type === "weekly"
          ) {
            await db.collection(reminder.type).updateOne(
              {
                userId: reminder.userId
              },
              {
                $set: {
                  notified: true
                }
              }
            );
          } else {
            await cooldownsCol.updateOne(
              {
                userId: reminder.userId,
                type: reminder.type
              },
              {
                $set: {
                  notified: true
                }
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
      console.error("❌ Reminder checker error:", err);
    }
  }, 60 * 1000);
}

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
    console.error("❌ Could not send error message:", err);
  }
}

client.once("clientReady", async () => {
  await connectDB();

  console.log(`${client.user.tag} is online!`);

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

client.on("guildCreate", () => {
  updateBotStatus();
  updateTopggStats();
});

client.on("guildDelete", () => {
  updateBotStatus();
  updateTopggStats();
});

client.on("messageCreate", async message => {
  try {
    if (message.author.bot) return;

    const db = await connectDB();

    const prefixesCol = db.collection("prefixes");

    const guildPrefix = await prefixesCol.findOne({
      guildId: message.guild?.id
    });

    const PREFIX = guildPrefix?.prefix || "!";

    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content
      .slice(PREFIX.length)
      .trim()
      .split(/ +/);

    const commandName = args.shift().toLowerCase();

    const command =
      client.commands.get(commandName) ||
      client.commands.find(cmd =>
        cmd.aliases &&
        cmd.aliases.includes(commandName)
      );

    if (!command) return;

    try {
      await command.execute(
        message,
        args,
        client
      );
    }

    catch (error) {
      console.error(error);
      await safeSendError(message);
    }

  } catch (error) {
    console.error("❌ messageCreate error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isButton()) return;

    const battleCommand = client.commands.get("battle");

    if (
      interaction.customId.startsWith("battle_") &&
      battleCommand &&
      typeof battleCommand.handleButton === "function"
    ) {
      return battleCommand.handleButton(interaction);
    }

  } catch (error) {
    console.error("❌ Interaction error:", error);

    const payload = {
      content: "❌ Something went wrong with this button.",
      ephemeral: true
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    } catch (err) {
      console.error("❌ Could not send interaction error:", err);
    }
  }
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

async function updateTopggStats() {
  try {
    const serverCount = client.guilds.cache.size;

    await topggApi.postStats({
      serverCount
    });

    console.log(`✅ Top.gg updated: ${serverCount} servers`);
  } catch (err) {
    console.error("❌ Top.gg update failed:", err);
  }
}

async function startTopggWebhook(client) {
  const app = express();

  app.use(express.json());

  const COIN_EMOJI = "<:grootcoin:1504742213110861834>";
  const CHIP_EMOJI = "<:chipslogo:1519287944421048320>";
  const EPIC_EMOJI = "<:epic:1504510771214680175>";
  const LEGENDARY_EMOJI = "<:legendary:1504511435974377552>";

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

  async function giveRandomCard(db, userId, tier) {
    const collectionsCol = db.collection("collections");
    const serialsCol = db.collection("serials");

    const tierCards = cards.filter(
      card => card.tier?.toLowerCase() === tier.toLowerCase()
    );

    if (tierCards.length === 0) return null;

    const card = tierCards[Math.floor(Math.random() * tierCards.length)];

    await serialsCol.updateOne(
      { cardId: card.id },
      { $inc: { serial: 1 } },
      { upsert: true }
    );

    const serialDoc = await serialsCol.findOne({
      cardId: card.id
    });

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

  app.post("/topgg", async (req, res) => {
    try {
      const vote = req.body;

      console.log("📩 Top.gg webhook received:", vote);

      if (vote.type === "webhook.test") {
        console.log("🧪 Top.gg test event ignored");
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
        return res.status(400).send("Missing user id");
      }

      const db = await connectDB();

      const cooldownsCol = db.collection("cooldowns");

      const existing = await cooldownsCol.findOne({
        type: "vote",
        userId
      });

     const now = Date.now();
const voteCooldown = 11.5 * 60 * 60 * 1000;

const existing = await cooldownsCol.findOne({
  type: "vote",
  userId
});

if (
  existing &&
  now - existing.timestamp < voteCooldown
) {
  console.log(`⚠️ Duplicate vote ignored for ${userId}`);
  return res.status(200).send("Duplicate");
}

// LOCK THE VOTE IMMEDIATELY
await cooldownsCol.updateOne(
  { type: "vote", userId },
  {
    $set: {
      timestamp: now,
      notified: false
    }
  },
  { upsert: true }
);

      const voteStreaksCol = db.collection("voteStreaks");

      const streakDoc = await voteStreaksCol.findOne({ userId });
      let streak = (streakDoc?.streak || 0) + 1;

      let extraChips = 0;
      const rewardLines = [];

      if (streak === 5) {
        extraChips += 3;
        rewardLines.push(`${CHIP_EMOJI} **Milestone 5:** +3 Ultron Chips`);
      }

      if (streak === 10) {
        const reward = await giveRandomCard(db, userId, "epic");

        if (reward) {
          rewardLines.push(
            `${EPIC_EMOJI} **Milestone 10:** ${reward.card.name} #${reward.serial} • \`${reward.code}\``
          );
        }
      }

      if (streak === 15) {
        extraChips += 3;
        rewardLines.push(`${CHIP_EMOJI} **Milestone 15:** +3 Ultron Chips`);
      }

      if (streak === 20) {
        const rewards = [];

        for (let i = 0; i < 3; i++) {
          const reward = await giveRandomCard(db, userId, "epic");
          if (reward) rewards.push(reward);
        }

        if (rewards.length > 0) {
          rewardLines.push(
            `${EPIC_EMOJI} **Milestone 20:**\n` +
            rewards
              .map(r => `• ${r.card.name} #${r.serial} • \`${r.code}\``)
              .join("\n")
          );
        }
      }

      let resetStreak = false;

      if (streak === 30) {
        const reward = await giveRandomCard(db, userId, "legendary");

        if (reward) {
          rewardLines.push(
            `${LEGENDARY_EMOJI} **Milestone 30:** ${reward.card.name} #${reward.serial} • \`${reward.code}\``
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
        { upsert: true }
      );

     
      await voteStreaksCol.updateOne(
        { userId },
        {
          $set: {
            streak: resetStreak ? 0 : streak,
            updatedAt: Date.now()
          }
        },
        { upsert: true }
      );

      try {
        const user = await client.users.fetch(userId);

        await user.send(
          "🗳️ Thanks for voting for **GrootX**!\n\n" +
          `${COIN_EMOJI} **+700 Coins**\n` +
          `${CHIP_EMOJI} **+1 Ultron Chip**\n\n` +
          `🔥 **Vote Streak:** ${resetStreak ? 0 : streak}/30\n` +
          (rewardLines.length > 0
            ? `\n🎁 **Milestone Reward:**\n${rewardLines.join("\n")}`
            : "")
        );
      } catch {}

      console.log(
        `✅ Vote reward given to ${userId} | streak: ${resetStreak ? 0 : streak}/30`
      );

      return res.status(200).send("OK");
    } catch (err) {
      console.error("❌ Top.gg webhook error:", err);
      return res.status(500).send("Error");
    }
  });

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Top.gg webhook running on port ${PORT}`);
  });
}

client.login(process.env.TOKEN);