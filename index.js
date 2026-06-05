require("dotenv").config();

const fs = require("fs");
const path = require("path");

const connectDB = require("./database");
const cards = require("./data/cards");
const autoDrop = require("./systems/autoDrop");

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

        cooldownTime = 5 * 60 * 1000;
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
  }, 60 * 1000);
}

client.once("clientReady", async () => {
  await connectDB();

  console.log(`${client.user.tag} is online!`);

  updateBotStatus();

  setInterval(
    updateBotStatus,
    5 * 60 * 1000
  );

  autoDrop(client);

  startReminderChecker(client);
});

client.on("guildCreate", () => {
  updateBotStatus();
});

client.on("guildDelete", () => {
  updateBotStatus();
});

client.on("messageCreate", async message => {
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

    message.reply(
      "❌ An error occurred while executing this command."
    );
  }
});
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      const battleCommand = client.commands.get("battle");

      if (
        battleCommand &&
        typeof battleCommand.handleButton === "function" &&
        interaction.customId.startsWith("battle_")
      ) {
        return battleCommand.handleButton(interaction);
      }
    }
  } catch (error) {
    console.error("❌ Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Something went wrong with this interaction.",
        ephemeral: true
      });
    }
  }
});

client.login(process.env.TOKEN);