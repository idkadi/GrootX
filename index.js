require("dotenv").config();

const fs = require("fs");
const path = require("path");

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
  ActivityType
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
// BOT STATUS
// ==========================================

function updateBotStatus() {
  try {
    const serverCount =
      client.guilds.cache.size;

    const playerCount =
      client.guilds.cache.reduce(
        (total, guild) =>
          total +
          (guild.memberCount || 0),

        0
      );

    client.user.setPresence({
      activities: [
        {
          name:
            `${playerCount} Heroes • ${serverCount} Servers`,

          type:
            ActivityType.Watching
        }
      ],

      status:
        "online"
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

async function startReminderChecker(
  client
) {
  const db =
    await connectDB();

  const remindersCol =
    db.collection("reminders");

  const cooldownsCol =
    db.collection("cooldowns");

  setInterval(
    async () => {
      try {
        const now =
          Date.now();

        const reminders =
          await remindersCol
            .find({
              enabled: true
            })
            .toArray();

        for (
          const reminder of reminders
        ) {
          let cooldownDoc =
            null;

          let cooldownTime =
            0;

          if (
            reminder.type ===
            "drop"
          ) {
            cooldownDoc =
              await cooldownsCol
                .findOne({
                  userId:
                    reminder.userId,

                  type:
                    "drop"
                });

            cooldownTime =
              8 *
              60 *
              1000;
          }

          else if (
            reminder.type ===
            "pickup"
          ) {
            cooldownDoc =
              await cooldownsCol
                .findOne({
                  userId:
                    reminder.userId,

                  type:
                    "pickup"
                });

            cooldownTime =
              4 *
              60 *
              1000;
          }

          else if (
            reminder.type ===
            "vote"
          ) {
            cooldownDoc =
              await cooldownsCol
                .findOne({
                  userId:
                    reminder.userId,

                  type:
                    "vote"
                });

            cooldownTime =
              12 *
              60 *
              60 *
              1000;
          }

          else if (
            reminder.type ===
            "daily"
          ) {
            cooldownDoc =
              await db
                .collection(
                  "daily"
                )
                .findOne({
                  userId:
                    reminder.userId
                });

            cooldownTime =
              24 *
              60 *
              60 *
              1000;
          }

          else if (
            reminder.type ===
            "weekly"
          ) {
            cooldownDoc =
              await db
                .collection(
                  "weekly"
                )
                .findOne({
                  userId:
                    reminder.userId
                });

            cooldownTime =
              7 *
              24 *
              60 *
              60 *
              1000;
          }

          if (
            !cooldownDoc?.timestamp
          ) {
            continue;
          }

          if (
            cooldownDoc.notified ===
            true
          ) {
            continue;
          }

          const ready =
            now -
            cooldownDoc.timestamp >=
            cooldownTime;

          if (!ready) {
            continue;
          }

          try {
            const user =
              await client.users.fetch(
                reminder.userId
              );

            await user.send(
              `🔔 Your **${reminder.type}** cooldown is over!`
            );

            if (
              reminder.type ===
                "daily" ||
              reminder.type ===
                "weekly"
            ) {
              await db
                .collection(
                  reminder.type
                )
                .updateOne(
                  {
                    userId:
                      reminder.userId
                  },

                  {
                    $set: {
                      notified:
                        true
                    }
                  }
                );
            } else {
              await cooldownsCol
                .updateOne(
                  {
                    userId:
                      reminder.userId,

                    type:
                      reminder.type
                  },

                  {
                    $set: {
                      notified:
                        true
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
        console.error(
          "❌ Reminder checker error:",
          err
        );
      }

    },

    60 * 1000
  );
}

// ==========================================
// SAFE PREFIX ERROR
// ==========================================

async function safeSendError(
  message
) {
  try {
    if (!message.guild) {
      await message
        .reply(
          "❌ An error occurred while executing this command."
        )
        .catch(() => {});

      return;
    }

    const me =
      message.guild.members.me;

    const perms =
      message.channel
        .permissionsFor(me);

    if (
      !perms ||
      !perms.has([
        "ViewChannel",
        "SendMessages"
      ])
    ) {
      return;
    }

    await message
      .reply(
        "❌ An error occurred while executing this command."
      )
      .catch(
        async () => {
          await message.channel
            .send(
              "❌ An error occurred while executing this command."
            )
            .catch(() => {});
        }
      );

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

async function safeSlashError(
  interaction
) {
  const payload = {
    content:
      "❌ An error occurred while executing this command.",

    ephemeral:
      true
  };

  try {
    if (
      interaction.deferred ||
      interaction.replied
    ) {
      await interaction
        .followUp(payload)
        .catch(() => {});
    } else {
      await interaction
        .reply(payload)
        .catch(() => {});
    }

  } catch (err) {
    console.error(
      "❌ Could not send slash error:",
      err
    );
  }
}

// ==========================================
// FIND COMMAND
// ==========================================

function findCommand(
  commandName
) {
  return (
    client.commands.get(
      commandName
    ) ||

    client.commands.find(
      cmd =>
        cmd.aliases &&
        cmd.aliases.includes(
          commandName
        )
    )
  );
}

// ==========================================
// READY
// ==========================================

client.once(
  "clientReady",

  async () => {
    await connectDB();

    console.log(
      `${client.user.tag} is online!`
    );

    await updateTopggStats();

    setInterval(
      updateTopggStats,
      30 *
      60 *
      1000
    );

    updateBotStatus();

    setInterval(
      updateBotStatus,
      5 *
      60 *
      1000
    );

    autoDrop(client);

    startReminderChecker(
      client
    );

    startTopggWebhook(
      client
    );
  }
);

// ==========================================
// GUILD CREATE
// ==========================================

client.on(
  "guildCreate",

  () => {
    updateBotStatus();
    updateTopggStats();
  }
);

// ==========================================
// GUILD DELETE
// ==========================================

client.on(
  "guildDelete",

  () => {
    updateBotStatus();
    updateTopggStats();
  }
);

// ==========================================
// PREFIX / MENTION COMMANDS
// ==========================================

client.on(
  "messageCreate",

  async message => {
    try {
      if (
        message.author.bot
      ) {
        return;
      }

      const db =
        await connectDB();

      const prefixesCol =
        db.collection(
          "prefixes"
        );

      const guildPrefix =
        await prefixesCol
          .findOne({
            guildId:
              message.guild?.id
          });

      const PREFIX =
        guildPrefix?.prefix ||
        "!";

      const content =
        message.content.trim();

      const mentionRegex =
        new RegExp(
          `^<@!?${client.user.id}>\\s*`
        );

      let args =
        null;

      if (
        content.startsWith(
          PREFIX
        )
      ) {
        args =
          content
            .slice(
              PREFIX.length
            )
            .trim()
            .split(/ +/);
      }

      else if (
        mentionRegex.test(
          content
        )
      ) {
        args =
          content
            .replace(
              mentionRegex,
              ""
            )
            .trim()
            .split(/ +/);
      }

      else {
        return;
      }

      if (
        !args ||
        !args[0]
      ) {
        return message
          .reply(
            `👋 My prefix here is \`${PREFIX}\`.\n` +
            `You can use \`${PREFIX}help\` or mention me like ` +
            `\`@${client.user.username} help\`.`
          )
          .catch(() => {});
      }

      const commandName =
        args
          .shift()
          .toLowerCase();

      const command =
        findCommand(
          commandName
        );

      if (!command) {
        return;
      }

      try {
        await command.execute(
          message,
          args,
          client
        );
      }

      catch (error) {
        console.error(
          error
        );

        await safeSendError(
          message
        );
      }

    } catch (error) {
      console.error(
        "❌ messageCreate error:",
        error
      );
    }
  }
);

// ==========================================
// INTERACTIONS
// ==========================================

client.on(
  "interactionCreate",

  async interaction => {
    try {
      if (
        interaction
          .isChatInputCommand()
      ) {
        const command =
          client.commands.get(
            interaction.commandName
          );

        if (!command) {
          return interaction
            .reply({
              content:
                "❌ Unknown slash command.",

              ephemeral:
                true
            })
            .catch(() => {});
        }

        if (
          typeof command
            .slashExecute !==
          "function"
        ) {
          return interaction
            .reply({
              content:
                "❌ This slash command is not ready yet. Use the prefix command for now.",

              ephemeral:
                true
            })
            .catch(() => {});
        }

        try {
          await command
            .slashExecute(
              interaction,
              client
            );
        }

        catch (error) {
          console.error(
            "❌ Slash command error:",
            error
          );

          await safeSlashError(
            interaction
          );
        }

        return;
      }

      if (
        !interaction.isButton()
      ) {
        return;
      }

      if (
        interaction.customId
          .startsWith(
            "battle_accept_"
          ) ||

        interaction.customId
          .startsWith(
            "battle_decline_"
          )
      ) {
        return;
      }

      const battleCommand =
        client.commands.get(
          "battle"
        );

      if (
        interaction.customId
          .startsWith(
            "battle_"
          ) &&

        battleCommand &&

        typeof battleCommand
          .handleButton ===
          "function"
      ) {
        return await battleCommand
          .handleButton(
            interaction
          );
      }

    } catch (error) {
      console.error(
        "❌ Interaction error:",
        error
      );

      const payload = {
        content:
          "❌ Something went wrong with this interaction.",

        ephemeral:
          true
      };

      try {
        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction
            .followUp(payload)
            .catch(() => {});
        } else {
          await interaction
            .reply(payload)
            .catch(() => {});
        }

      } catch (err) {
        console.error(
          "❌ Could not send interaction error:",
          err
        );
      }
    }
  }
);

// ==========================================
// PROCESS ERRORS
// ==========================================

process.on(
  "unhandledRejection",

  err => {
    console.error(
      "UNHANDLED REJECTION:",
      err
    );
  }
);

process.on(
  "uncaughtException",

  err => {
    console.error(
      "UNCAUGHT EXCEPTION:",
      err
    );
  }
);

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

async function startTopggWebhook(
  client
) {
  const app =
    express();

  app.use(
    express.json()
  );

  const COIN_EMOJI =
    "<:grootcoin:1504742213110861834>";

  const CHIP_EMOJI =
    "<:chipslogo:1519287944421048320>";

  const EPIC_EMOJI =
    "<:epic:1504510771214680175>";

  const LEGENDARY_EMOJI =
    "<:legendary:1504511435974377552>";

  // ========================================
  // UNIQUE CARD CODE
  // ========================================

  async function generateUniqueCode(
    collectionsCol
  ) {
    const chars =
      "abcdefghijklmnopqrstuvwxyz0123456789";

    while (true) {
      let code =
        "";

      for (
        let i = 0;
        i < 6;
        i++
      ) {
        code += chars.charAt(
          Math.floor(
            Math.random() *
            chars.length
          )
        );
      }

      const exists =
        await collectionsCol
          .findOne({
            code
          });

      if (!exists) {
        return code;
      }
    }
  }

  // ========================================
  // GIVE RANDOM S1 CARD
  // ========================================

  async function giveRandomCard(
    db,
    userId,
    tier
  ) {
    const collectionsCol =
      db.collection(
        "collections"
      );

    const serialsCol =
      db.collection(
        "serials"
      );

    /*
     * `cards` now comes exclusively from:
     *
     * ./data/season1
     */

    const tierCards =
      cards.filter(
        card =>
          String(
            card.tier ||
            ""
          ).toLowerCase() ===
          String(
            tier ||
            ""
          ).toLowerCase()
      );

    if (
      tierCards.length ===
      0
    ) {
      return null;
    }

    const card =
      tierCards[
        Math.floor(
          Math.random() *
          tierCards.length
        )
      ];

    // ======================================
    // SEASON 1 SERIAL
    // ======================================

    await serialsCol.updateOne(
      {
        cardId:
          Number(
            card.id
          ),

        season:
          SEASON
      },

      {
        $inc: {
          serial:
            1
        },

        $setOnInsert: {
          season:
            SEASON
        }
      },

      {
        upsert:
          true
      }
    );

    const serialDoc =
      await serialsCol
        .findOne({
          cardId:
            Number(
              card.id
            ),

          season:
            SEASON
        });

    if (!serialDoc) {
      throw new Error(
        `Failed to generate S1 serial for card ${card.id}`
      );
    }

    const serial =
      serialDoc.serial;

    const code =
      await generateUniqueCode(
        collectionsCol
      );

    // ======================================
    // SAVE S1 OWNED CARD
    // ======================================

    await collectionsCol.insertOne({
      userId,

      cardId:
        Number(
          card.id
        ),

      season:
        SEASON,

      serial,

      code,

      tag:
        null,

      favorite:
        false
    });

    return {
      card: {
        ...card,
        season:
          SEASON
      },

      season:
        SEASON,

      serial,

      code
    };
  }

  // ========================================
  // TOP.GG ENDPOINT
  // ========================================

  app.post(
    "/topgg",

    async (
      req,
      res
    ) => {
      try {
        const vote =
          req.body;

        console.log(
          "📩 Top.gg webhook received:",
          vote
        );

        if (
          vote.type ===
          "webhook.test"
        ) {
          console.log(
            "🧪 Top.gg test event ignored"
          );

          return res
            .status(200)
            .send("OK");
        }

        const userId =
          vote.user ||
          vote.userId ||
          vote.discord_id ||
          vote.discordId ||
          vote.data?.user
            ?.platform_id ||
          vote.data?.user
            ?.id;

        if (!userId) {
          return res
            .status(400)
            .send(
              "Missing user id"
            );
        }

        const db =
          await connectDB();

        const cooldownsCol =
          db.collection(
            "cooldowns"
          );

        const now =
          Date.now();

        const voteCooldown =
          11.5 *
          60 *
          60 *
          1000;

        const existing =
          await cooldownsCol
            .findOne({
              type:
                "vote",

              userId
            });

        if (
          existing &&
          now -
            existing.timestamp <
            voteCooldown
        ) {
          console.log(
            `⚠️ Duplicate vote ignored for ${userId}`
          );

          return res
            .status(200)
            .send(
              "Duplicate"
            );
        }

        await cooldownsCol.updateOne(
          {
            type:
              "vote",

            userId
          },

          {
            $set: {
              timestamp:
                now,

              notified:
                false
            }
          },

          {
            upsert:
              true
          }
        );

        const voteStreaksCol =
          db.collection(
            "voteStreaks"
          );

        const streakDoc =
          await voteStreaksCol
            .findOne({
              userId
            });

        let streak =
          (
            streakDoc?.streak ||
            0
          ) + 1;

        let extraChips =
          0;

        const rewardLines =
          [];

        // ====================================
        // 5 VOTES
        // ====================================

        if (
          streak ===
          5
        ) {
          extraChips +=
            3;

          rewardLines.push(
            `${CHIP_EMOJI} **Milestone 5:** +3 Ultron Chips`
          );
        }

        // ====================================
        // 10 VOTES - S1 EPIC
        // ====================================

        if (
          streak ===
          10
        ) {
          const reward =
            await giveRandomCard(
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

        // ====================================
        // 15 VOTES
        // ====================================

        if (
          streak ===
          15
        ) {
          extraChips +=
            3;

          rewardLines.push(
            `${CHIP_EMOJI} **Milestone 15:** +3 Ultron Chips`
          );
        }

        // ====================================
        // 20 VOTES - 3 S1 EPICS
        // ====================================

        if (
          streak ===
          20
        ) {
          const rewards =
            [];

          for (
            let i = 0;
            i < 3;
            i++
          ) {
            const reward =
              await giveRandomCard(
                db,
                userId,
                "epic"
              );

            if (reward) {
              rewards.push(
                reward
              );
            }
          }

          if (
            rewards.length >
            0
          ) {
            rewardLines.push(
              `${EPIC_EMOJI} **Milestone 20:**\n` +

              rewards
                .map(
                  r =>
                    `• 1️⃣ ${r.card.name} ` +
                    `#${r.serial} • ` +
                    `\`${r.code}\``
                )
                .join("\n")
            );
          }
        }

        // ====================================
        // 30 VOTES - S1 LEGENDARY
        // ====================================

        let resetStreak =
          false;

        if (
          streak ===
          30
        ) {
          const reward =
            await giveRandomCard(
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

          resetStreak =
            true;
        }

        // ====================================
        // NORMAL VOTE REWARDS
        // ====================================

        await db
          .collection(
            "balances"
          )
          .updateOne(
            {
              userId
            },

            {
              $inc: {
                coins:
                  700,

                ultronChips:
                  1 +
                  extraChips
              }
            },

            {
              upsert:
                true
            }
          );

        // ====================================
        // UPDATE STREAK
        // ====================================

        await voteStreaksCol
          .updateOne(
            {
              userId
            },

            {
              $set: {
                streak:
                  resetStreak
                    ? 0
                    : streak,

                updatedAt:
                  Date.now()
              }
            },

            {
              upsert:
                true
            }
          );

        // ====================================
        // DM USER
        // ====================================

        try {
          const user =
            await client.users
              .fetch(
                userId
              );

          await user.send(
            "🗳️ Thanks for voting for **GrootX**!\n\n" +

            `${COIN_EMOJI} **+700 Coins**\n` +

            `${CHIP_EMOJI} **+1 Ultron Chip**\n\n` +

            `🔥 **Vote Streak:** ${
              resetStreak
                ? 0
                : streak
            }/30\n` +

            (
              rewardLines.length >
              0

                ? `\n🎁 **Milestone Reward • Season 1:**\n${rewardLines.join("\n")}`

                : ""
            )
          );

        } catch {}

        console.log(
          `✅ Vote reward given to ${userId} | streak: ${
            resetStreak
              ? 0
              : streak
          }/30`
        );

        return res
          .status(200)
          .send("OK");

      } catch (err) {
        console.error(
          "❌ Top.gg webhook error:",
          err
        );

        return res
          .status(500)
          .send("Error");
      }
    }
  );

  // ========================================
  // WEBHOOK SERVER
  // ========================================

  const PORT =
    process.env.PORT ||
    3000;

  app.listen(
    PORT,
    "0.0.0.0",

    () => {
      console.log(
        `✅ Top.gg webhook running on port ${PORT}`
      );
    }
  );
}

// ==========================================
// LOGIN
// ==========================================

client.login(
  process.env.TOKEN
);