const {
  EmbedBuilder,
  SlashCommandBuilder
} = require("discord.js");

const { randomInt } = require("node:crypto");
const connectDB = require("../database");

const rewardText =
  "<:chipslogo:1519287944421048320> **3 Ultron Chips**\n" +
  "<:grootcoin:1504742213110861834> **500 Coins**\n" +
  "<:grootcandy:1555950722816675870> **300 Groot Candy**";

// Database indexes enforce one record per user and unique codes.
async function ensureIndexes(db) {
  const referrals = db.collection("referrals");

  await referrals.createIndex(
    { userId: 1 },
    { unique: true }
  );

  await referrals.createIndex(
    { code: 1 },
    {
      unique: true,
      partialFilterExpression: {
        code: { $type: "string" }
      }
    }
  );
}

async function getOrCreateReferral(db, userId) {
  const referrals = db.collection("referrals");

  for (let attempt = 0; attempt < 50; attempt++) {
    const existing = await referrals.findOne({ userId });

    // Keep the user's existing valid code permanently.
    if (
      existing &&
      /^\d{6}$/.test(existing.code || "")
    ) {
      return existing;
    }

    const code = String(randomInt(100000, 1000000));

    try {
      if (existing) {
        await referrals.updateOne(
          {
            _id: existing._id,
            code: existing.code ?? null
          },
          {
            $set: { code }
          }
        );

        // Re-read in case another request assigned a code first.
        continue;
      }

      const data = {
        userId,
        code,
        referredUsers: [],
        createdAt: Date.now()
      };

      await referrals.insertOne(data);
      return data;
    } catch (error) {
      // Retry a code collision or simultaneous user creation.
      if (error.code !== 11000) throw error;
    }
  }

  throw new Error(
    "Unable to allocate a unique referral code."
  );
}

async function execute(message) {
  const slash =
    typeof message.isChatInputCommand === "function" &&
    message.isChatInputCommand();

  const user = slash ? message.user : message.author;

  if (
    slash &&
    !message.deferred &&
    !message.replied
  ) {
    await message.deferReply();
  }

  const reply = payload => {
    if (typeof payload === "string") {
      payload = { content: payload };
    }

    payload.allowedMentions = {
      parse: [],
      repliedUser: false
    };

    if (!slash) {
      return message.reply(payload);
    }

    return message.deferred
      ? message.editReply(payload)
      : message.followUp(payload);
  };

  try {
    if (user.bot) {
      return await reply(
        "Bots cannot use referrals."
      );
    }

    const db = await connectDB();

    await ensureIndexes(db);

    const player = await getOrCreateReferral(
      db,
      user.id
    );

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("🔗 GrootX Referrals")
      .setDescription(
        `Your referral code:\n\n` +
        `## ${player.code}\n\n` +
        "Share this permanent code with a new player. " +
        "At the end of `debut`, they will be asked to " +
        "enter a referral code or type `none`.\n\n" +
        "If they enter your code, **you receive** " +
        "the rewards below."
      )
      .addFields(
        {
          name: "🎁 You earn per referral",
          value: rewardText
        },
        {
          name: "👥 Successful referrals",
          value: String(
            player.referredUsers?.length || 0
          ),
          inline: true
        }
      )
      .setFooter({
        text:
          "Your code stays the same • " +
          "Referral codes are entered during debut"
      });

    return await reply({
      embeds: [embed]
    });
  } catch (error) {
    console.error("[REFER]", error);

    return await reply(
      "❌ Could not load your referral code. " +
      "Please try again."
    );
  }
}

module.exports = {
  name: "refer",
  aliases: ["referral"],

  data: new SlashCommandBuilder()
    .setName("refer")
    .setDescription(
      "Show your permanent six-digit GrootX referral code."
    ),

  execute,
  executeSlash: execute,
  slashExecute: execute,
  slash: execute,
  run: execute,

  // debut.js can reuse these helpers.
  getOrCreateReferral,
  ensureIndexes
};