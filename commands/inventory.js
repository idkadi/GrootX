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
      return "🎃";
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
  if (item === "halloween_pack") return "Halloween Card Pack";

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

  return [row1];
}

async function makeEmbed(message, pageType) {
  const db = await connectDB();

  const inventoryCollection = db.collection("inventory");
  const albumsCollection = db.collection("albums");
  const usersCollection = db.collection("users");

  const userId = message.author.id;

  let inventoryDoc = await inventoryCollection.findOne({ userId });

  if (!inventoryDoc) {
    await inventoryCollection.insertOne({
      userId,
      items: {}
    });

    inventoryDoc = {
      userId,
      items: {}
    };
  }

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

          if (!bg) return `Unknown Background ID: ${bgId}`;

          return `🖼️ **${bg.name}**`;
        })
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
    .setDescription(`### ${title}\n${description}`)
    .setFooter({ text: "GrootX Item System" })
    .setTimestamp();
}

module.exports = {
  name: "inventory",
  aliases: ["inv"],

  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription(
      "View your stones, shards, albums, backgrounds, candy, and packs."
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
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: "❌ This inventory is not for you.",
          ephemeral: true
        });
      }

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

      if (interaction.customId === "inv_others") {
        currentPage = "others";
      }

      return interaction.editReply({
        embeds: [await makeEmbed(context, currentPage)],
        components: makeButtons(currentPage)
      });
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