const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const connectDB = require("../database");

const VIBRANIUM = "<:vibranium:1558406389284741150>";
const COST = 2500;
const UNITS = 3;
const MAX_BATCHES = 100;

const WEAPONS = {
  web_shooter: {
    name: "Web Shooter",
    emoji: "<:webshooter:1558404855071113236>",
    energy: 1,
    aliases: ["webshooter", "web shooter", "web shooters", "web"]
  },

  cap_shield: {
    name: "Captain America's Shield",
    emoji: "<:capshield:1558405113050177636>",
    energy: 1,
    aliases: [
      "capshield",
      "cap shield",
      "shield",
      "captain america shield",
      "captain america's shield",
      "captain shield"
    ]
  },

  arc_reactor: {
    name: "Arc Reactor",
    emoji: "<:arc:1558405297536634940>",
    energy: 2,
    aliases: ["arc", "arc reactor", "reactor"]
  },

  mjolnir: {
    name: "Mjolnir",
    emoji: "<:mjolnir:1558405891722846318>",
    energy: 3,
    aliases: ["mjolnir", "mjonir", "hammer"]
  },

  wolverine_claws: {
    name: "Wolverine's Claws",
    emoji: "<:claws:1558407325256261652>",
    energy: 2,
    aliases: [
      "claws",
      "wolverine claws",
      "wolverine's claws",
      "wolverine"
    ]
  }
};

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveWeapon(input) {
  const normalized = normalize(input);

  return Object.keys(WEAPONS).find(key =>
    normalize(key) === normalized ||
    WEAPONS[key].aliases.some(
      alias => normalize(alias) === normalized
    )
  );
}

module.exports = {
  name: "craft",

  data: new SlashCommandBuilder()
    .setName("craft")
    .setDescription(
      "Craft 3 weapon units per batch for 2,500 Vibranium."
    )
    .addStringOption(option =>
      option
        .setName("weapon")
        .setDescription("Weapon to craft")
        .setRequired(true)
        .addChoices(
          ...Object.entries(WEAPONS).map(([value, weapon]) => ({
            name: weapon.name,
            value
          }))
        )
    )
    .addIntegerOption(option =>
      option
        .setName("batches")
        .setDescription(
          "Number of batches; each gives 3 units (default 1)"
        )
        .setMinValue(1)
        .setMaxValue(MAX_BATCHES)
    ),

  async execute(message, args = []) {
    const slash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = slash ? message.user : message.author;
    let credited = false;

    const reply = payload => {
      if (typeof payload === "string") {
        payload = { content: payload };
      }

      payload.allowedMentions = {
        parse: [],
        repliedUser: false
      };

      if (!slash) return message.reply(payload);
      if (message.deferred) return message.editReply(payload);
      if (message.replied) return message.followUp(payload);

      return message.reply(payload);
    };

    try {
      if (slash && !message.deferred && !message.replied) {
        await message.deferReply();
      }

      let input;
      let batches = 1;

      if (slash) {
        input = message.options.getString("weapon", true);
        batches = message.options.getInteger("batches") ?? 1;
      } else {
        const parts = [...args];

        // A trailing number is the batch count.
        if (
          parts.length &&
          /^[+-]?\d+(?:\.\d+)?$/.test(parts[parts.length - 1])
        ) {
          batches = Number(parts.pop());
        }

        input = parts.join(" ");
      }

      const key = resolveWeapon(input);

      if (!key) {
        return await reply(
          "⚒️ **Weapon Crafting**\n" +
          Object.values(WEAPONS)
            .map(weapon =>
              weapon.emoji + " **" + weapon.name + "**"
            )
            .join("\n") +
          "\n\n" +
          VIBRANIUM +
          " **2,500 Vibranium → 3 units** per batch.\n" +
          "Use: `!craft web shooter 2` or " +
          "`/craft weapon:Web Shooter batches:2`\n" +
          "Two batches cost 5,000 Vibranium and give 6 units."
        );
      }

      if (
        !Number.isSafeInteger(batches) ||
        batches < 1 ||
        batches > MAX_BATCHES
      ) {
        return await reply(
          "❌ Batches must be a whole number from 1 to 100."
        );
      }

      const cost = batches * COST;
      const quantity = batches * UNITS;
      const weapon = WEAPONS[key];

      const db = await connectDB();
      const inventory = db.collection("inventory");

      // Deduction and weapon credit happen atomically.
      // Concurrent requests cannot spend the same balance twice.
      const result = await inventory.updateOne(
        {
          userId: user.id,
          "items.vibranium": { $gte: cost }
        },
        {
          $inc: {
            "items.vibranium": -cost,
            ["weapons." + key]: quantity
          }
        }
      );

      if (!result.modifiedCount) {
        const doc = await inventory.findOne({
          userId: user.id
        });

        const available = Number(
          doc?.items?.vibranium || 0
        );

        return await reply(
          "❌ Not enough Vibranium.\n" +
          VIBRANIUM +
          " Required: **" +
          cost.toLocaleString() +
          "**\n" +
          VIBRANIUM +
          " Available: **" +
          available.toLocaleString() +
          "**\n" +
          "Burn unwanted cards to earn more."
        );
      }

      credited = true;

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("⚒️ Crafting Complete")
        .setDescription(
          weapon.emoji +
          " **" +
          weapon.name +
          " × " +
          quantity +
          "**\n\n" +
          VIBRANIUM +
          " Spent: **" +
          cost.toLocaleString() +
          "**\n" +
          "Batches: **" +
          batches +
          "**\n" +
          "Battle weapon energy per use: **" +
          weapon.energy +
          "**\n\n" +
          "Added to the **Weapons** section of your inventory."
        )
        .setFooter({
          text: "Each weapon unit is consumed when used in battle."
        })
        .setTimestamp();

      return await reply({ embeds: [embed] });
    } catch (error) {
      console.error("[CRAFT]", error);

      await reply(
        credited
          ? "✅ Weapons crafted and saved, but the display failed. Check your inventory."
          : "❌ Crafting could not be completed. Check your inventory before retrying."
      ).catch(() => {});
    }
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;