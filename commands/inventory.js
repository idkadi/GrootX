const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require("discord.js");

const connectDB = require("../database");

let backgrounds = [];
try {
  backgrounds = require("../data/backgrounds.js");
} catch {
  backgrounds = [];
}

const VIBRANIUM_EMOJI = "<:vibranium:1558406389284741150>";

// Weapon quantities are stored in inventory.weapons.
// Crafting and battle commands must use these same keys.
const WEAPONS = {
  web_shooter: {
    name: "Web Shooter",
    emoji: "<:webshooter:1558404855071113236>",
    energy: 1
  },
  cap_shield: {
    name: "Captain America's Shield",
    emoji: "<:capshield:1558405113050177636>",
    energy: 1
  },
  arc_reactor: {
    name: "Arc Reactor",
    emoji: "<:arc:1558405297536634940>",
    energy: 2
  },
  mjolnir: {
    name: "Mjolnir",
    emoji: "<:mjolnir:1558405891722846318>",
    energy: 3
  },
  wolverine_claws: {
    name: "Wolverine's Claws",
    emoji: "<:claws:1558407325256261652>",
    energy: 2
  }
};

function getItemEmoji(item) {
  switch (item) {
    case "space_stone":
      return "<:space:1504749742683324506>";
    case "mind_stone":
      return "<:mind:1504749347592605716>";
    case "reality_stone":
      return "<:reality:1504749391645376542>";
    case "power_stone":
      return "<:power:1504749435177930857>";
    case "time_stone":
      return "<:time:1504749635829239839>";
    case "soul_stone":
      return "<:soul:1504749686911799296>";
    case "space_shard":
      return "<:spaceshards:1504767068480995429>";
    case "mind_shard":
      return "<:mindsshards:1504767348517638195>";
    case "reality_shard":
      return "<:realityshards:1504767197883531386>";
    case "power_shard":
      return "<:powershards:1504767126462926949>";
    case "time_shard":
      return "<:timeshards:1504766994074046525>";
    case "soul_shard":
      return "<:soulshards:1504767256775757845>";
    case "groot_candy":
      return "<:grootcandy:1555950722816675870>";
    case "halloween_pack":
      return "<:halloweenpack:1555956375979425963>";
    case "token":
      return "🎟️";
    case "shard_booster":
      return "🍁";
    case "extra_drop":
      return "🎲";
    case "gauntlet":
      return "<:guantlet:1504854241360085066>";
    case "album":
      return "📖";
    case "page":
      return "📄";
    default:
      return "📦";
  }
}

function formatItemName(item) {
  if (item === "halloween_pack") {
    return "Halloween Card Pack";
  }

  return item
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const infinityStones = [
  "space_stone",
  "mind_stone",
  "reality_stone",
  "power_stone",
  "time_stone",
  "soul_stone"
];

const infinityShards = [
  "space_shard",
  "mind_shard",
  "reality_shard",
  "power_shard",
  "time_shard",
  "soul_shard"
];

function makeButtons(activePage) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("inv_stones")
      .setLabel("Stones")
      .setEmoji("💎")
      .setStyle(
        activePage === "stones"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      ),

    new ButtonBuilder()
      .setCustomId("inv_shards")
      .setLabel("Shards")
      .setEmoji("✨")
      .setStyle(
        activePage === "shards"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      ),

    new ButtonBuilder()
      .setCustomId("inv_albums")
      .setLabel("Albums")
      .setEmoji("📖")
      .setStyle(
        activePage === "albums"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      ),

    new ButtonBuilder()
      .setCustomId("inv_bgs")
      .setLabel("BGs")
      .setEmoji("🖼️")
      .setStyle(
        activePage === "bgs"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      ),

    new ButtonBuilder()
      .setCustomId("inv_others")
      .setLabel("Others")
      .setEmoji("📦")
      .setStyle(
        activePage === "others"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      )
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("inv_weapons")
      .setLabel("Weapons")
      .setEmoji("⚔️")
      .setStyle(
        activePage === "weapons"
          ? ButtonStyle.Primary
          : ButtonStyle.Secondary
      )
  );

  return [row1, row2];
}

async function makeEmbed(message, pageType) {
  const db = await connectDB();

  const inventoryCollection = db.collection("inventory");
  const albumsCollection = db.collection("albums");
  const usersCollection = db.collection("users");

  const userId = message.author.id;

  const inventoryDoc =
    await inventoryCollection.findOne({ userId }) || {
      userId,
      items: {},
      weapons: {}
    };

  const userInventory = inventoryDoc.items || {};

  const userAlbums = await albumsCollection
    .find({ userId })
    .toArray();

  const userData = await usersCollection.findOne({ userId });
  const userBackgroundIds = userData?.backgrounds || [];

  let title = "";
  let description = "";

  if (pageType === "stones") {
    title = "💎 Infinity Stones";

    description = infinityStones
      .map(item => {
        const amount = userInventory[item] || 0;

        return (
          `${getItemEmoji(item)} ` +
          `**${formatItemName(item)}** × ${amount}`
        );
      })
      .join("\n");
  }

  if (pageType === "shards") {
    title = "✨ Infinity Shards";

    description = infinityShards
      .map(item => {
        const amount = userInventory[item] || 0;

        return (
          `${getItemEmoji(item)} ` +
          `**${formatItemName(item)}** × ${amount}`
        );
      })
      .join("\n");
  }

  if (pageType === "albums") {
    title = "📖 Albums";

    const albumItem = userInventory.album || 0;
    const pageItem = userInventory.page || 0;

    if (userAlbums.length === 0) {
      description =
        `📖 **Album Item** × ${albumItem}\n` +
        `📄 **Page Item** × ${pageItem}\n\n` +
        "No created albums yet.";
    } else {
      description =
        `📖 **Album Item** × ${albumItem}\n` +
        `📄 **Page Item** × ${pageItem}\n\n` +
        userAlbums
          .map((album, index) => {
            const pages = album.pages?.length || 0;

            return (
              `**${index + 1}.** ` +
              `${album.name} — ${pages} page(s)`
            );
          })
          .join("\n");
    }
  }

  if (pageType === "bgs") {
    title = "🖼️ Backgrounds";

    if (userBackgroundIds.length === 0) {
      description = "No backgrounds owned.";
    } else {
      description = userBackgroundIds
        .map(bgId => {
          const bg = backgrounds.find(
            b => Number(b.id) === Number(bgId)
          );

          if (!bg) {
            return `Unknown Background ID: ${bgId}`;
          }

          return `🖼️ **${bg.name}**`;
        })
        .join("\n");
    }
  }

  if (pageType === "weapons") {
    title = "⚔️ Weapons";

    const owned = inventoryDoc.weapons || {};

    description = Object.entries(WEAPONS)
      .map(([key, weapon]) =>
        `${weapon.emoji} **${weapon.name}** × ${owned[key] || 0}\n` +
        `└ Weapon energy: **${weapon.energy}**`
      )
      .join("\n\n");

    // Display future weapons even before a name/emoji is configured.
    const extra = Object.entries(owned).filter(
      ([key]) => !WEAPONS[key]
    );

    if (extra.length) {
      description += "\n\n" + extra
        .map(([key, amount]) =>
          `⚔️ **${formatItemName(key)}** × ${amount}`
        )
        .join("\n");
    }
  }

  if (pageType === "others") {
    title = "📦 Others";

    const others = Object.entries({
      groot_candy: 0,
      halloween_pack: 0,
      ...userInventory
    }).filter(([item]) =>
      !infinityStones.includes(item) &&
      !infinityShards.includes(item) &&
      item !== "vibranium" &&
      item !== "weapons" &&
      item !== "album" &&
      item !== "page"
    );

    if (others.length === 0) {
      description = "No other items.";
    } else {
      description = others
        .map(([item, amount]) =>
          `${getItemEmoji(item)} ` +
          `**${formatItemName(item)}** × ${amount}`
        )
        .join("\n");
    }
  }

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`🔐 ${message.author.username}'s Inventory`)
    .setDescription(
      `${VIBRANIUM_EMOJI} **Vibranium: ` +
      `${Number(userInventory.vibranium || 0).toLocaleString()}**\n\n` +
      `### ${title}\n${description}`
    )
    .setFooter({ text: "GrootX Item System" })
    .setTimestamp();
}

module.exports = {
  name: "inventory",
  aliases: ["inv"],

  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription(
      "View your Vibranium, weapons, stones, shards, albums and items."
    ),

  async execute(message) {
    const isSlash =
      typeof message.isChatInputCommand === "function" &&
      message.isChatInputCommand();

    const user = isSlash ? message.user : message.author;
    const context = { author: user };

    if (isSlash && !message.deferred && !message.replied) {
      await message.deferReply();
    }

    let currentPage = "stones";

    const msg = await (
      isSlash
        ? message.editReply.bind(message)
        : message.reply.bind(message)
    )({
      embeds: [await makeEmbed(context, currentPage)],
      components: makeButtons(currentPage)
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000,
      filter: interaction => [
        "inv_stones",
        "inv_shards",
        "inv_albums",
        "inv_bgs",
        "inv_others",
        "inv_weapons"
      ].includes(interaction.customId)
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: "❌ This inventory is not for you.",
          ephemeral: true
        });
      }

      try {
        // Acknowledge before database reads to avoid timeouts.
        await interaction.deferUpdate();
        collector.resetTimer();

        if (interaction.customId === "inv_stones") {
          currentPage = "stones";
        }

        if (interaction.customId === "inv_shards") {
          currentPage = "shards";
        }

        if (interaction.customId === "inv_albums") {
          currentPage = "albums";
        }

        if (interaction.customId === "inv_bgs") {
          currentPage = "bgs";
        }

        if (interaction.customId === "inv_weapons") {
          currentPage = "weapons";
        }

        if (interaction.customId === "inv_others") {
          currentPage = "others";
        }

        return await interaction.editReply({
          embeds: [await makeEmbed(context, currentPage)],
          components: makeButtons(currentPage)
        });
      } catch (error) {
        console.error("[INVENTORY] Page update:", error);

        const payload = {
          content: "❌ Could not load inventory. Please try again.",
          ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => {});
    });
  }
};

module.exports.executeSlash = module.exports.execute;
module.exports.slashExecute = module.exports.execute;
module.exports.slash = module.exports.execute;
module.exports.run = module.exports.execute;