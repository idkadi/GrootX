const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const {
  ranks,
  getRankEmoji
} = require("../utils/ranks");

const rankRewards = [
  { required: 100, name: "Rookie II", reward: "500 Coins + 5 Common Cards" },
  { required: 200, name: "Rookie III", reward: "750 Coins + 5 Common Cards" },
  { required: 300, name: "Silver I", reward: "1,000 Coins + 3 Uncommon Cards" },
  { required: 450, name: "Silver II", reward: "1,250 Coins + 3 Common + 3 Uncommon Cards" },
  { required: 600, name: "Silver III", reward: "1,500 Coins + 3 Uncommon Cards" },
  { required: 800, name: "Gold I", reward: "2,000 Coins + 2 Rare Cards" },
  { required: 1000, name: "Gold II", reward: "2,500 Coins + 2 Uncommon + 2 Rare Cards" },
  { required: 1250, name: "Gold III", reward: "3,000 Coins + 2 Rare Cards" },
  { required: 1500, name: "Platinum I", reward: "4,000 Coins + 1 Epic Card" },
  { required: 1800, name: "Platinum II", reward: "4,500 Coins + 1 Rare Card" },
  { required: 2100, name: "Platinum III", reward: "5,000 Coins + 1 Rare + 1 Epic Card" },
  { required: 2500, name: "Diamond I", reward: "6,500 Coins + 1 Epic Card" },
  { required: 3000, name: "Diamond II", reward: "7,500 Coins + 1 Epic Card" },
  { required: 3500, name: "Diamond III", reward: "8,500 Coins + 1 Epic + 1 Rare Card" },
  { required: 4000, name: "Master I", reward: "10,000 Coins + 1 Legendary Card" },
  { required: 4500, name: "Master II", reward: "12,000 Coins + 1 Epic Card" },
  { required: 5000, name: "Master III", reward: "15,000 Coins + 1 Epic Card" },
  { required: 6000, name: "Elite", reward: "20,000 Coins + 2 Legendary Cards" },
  { required: 6700, name: "Elite Milestone 1", reward: "10,000 Coins + 1 Legendary Card" },
  { required: 7400, name: "Elite Milestone 2", reward: "12,000 Coins + 1 Legendary Card" },
  { required: 8100, name: "Elite Milestone 3", reward: "15,000 Coins + 1 Legendary Card" },
  { required: 8800, name: "Elite Milestone 4", reward: "18,000 Coins + 1 Legendary Card" },
  { required: 9500, name: "Elite Milestone 5", reward: "20,000 Coins + 1 Legendary Card" }
];

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

function tierEmoji(tier) {
  switch (tier.toLowerCase()) {
    case "common": return "<:common:1504510702956839033>";
    case "uncommon": return "<:uncommon:1504510929210052698>";
    case "rare": return "<:rare:1504510606718275764>";
    case "epic": return "<:epic:1504510771214680175>";
    case "legendary": return "<:legendary:1504511435974377552>";
    default: return "🎴";
  }
}

function rewardWithEmojis(text) {
  return text
    .replace(/Coins/g, "<:grootcoin:1504742213110861834> Coins")
    .replace(/Common/g, `${tierEmoji("common")} Common`)
    .replace(/Uncommon/g, `${tierEmoji("uncommon")} Uncommon`)
    .replace(/Rare/g, `${tierEmoji("rare")} Rare`)
    .replace(/Epic/g, `${tierEmoji("epic")} Epic`)
    .replace(/Legendary/g, `${tierEmoji("legendary")} Legendary`);
}

function makeTrophyEmbed() {
  const lines = ranks.map(rank => {
    const range =
      rank.max === Infinity
        ? `${formatNumber(rank.min)}+`
        : `${formatNumber(rank.min)} - ${formatNumber(rank.max)}`;

    return `${getRankEmoji(rank.name)} **${rank.name}** — 🏆 ${range}`;
  });

  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle("🏆 GrootX Ranked Tiers")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "Use the buttons below to switch between trophies and rewards."
    });
}

function makeRewardEmbed() {
  const lines = rankRewards.map(reward => {
    return `${getRankEmoji(reward.name)} **${reward.name}** — 🏆 ${formatNumber(reward.required)}\n${rewardWithEmojis(reward.reward)}`;
  });

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("🎁 GrootX Rank Rewards")
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: "Rewards are given automatically when you reach the rank."
    });
}

function makeButtons(active) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tiers_trophies")
      .setLabel("Trophies")
      .setStyle(active === "trophies" ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("tiers_rewards")
      .setLabel("Rewards")
      .setStyle(active === "rewards" ? ButtonStyle.Success : ButtonStyle.Secondary)
  );
}

module.exports = {
  name: "tiers",
  aliases: ["tier", "ranks", "ranktiers"],

  async execute(message) {
    const msg = await message.reply({
      embeds: [makeTrophyEmbed()],
      components: [makeButtons("trophies")]
    });

    const collector = msg.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: "Only the command user can use these buttons.",
          ephemeral: true
        });
      }

      if (interaction.customId === "tiers_trophies") {
        return interaction.update({
          embeds: [makeTrophyEmbed()],
          components: [makeButtons("trophies")]
        });
      }

      if (interaction.customId === "tiers_rewards") {
        return interaction.update({
          embeds: [makeRewardEmbed()],
          components: [makeButtons("rewards")]
        });
      }
    });

    collector.on("end", async () => {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("tiers_trophies_disabled")
          .setLabel("Trophies")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),

        new ButtonBuilder()
          .setCustomId("tiers_rewards_disabled")
          .setLabel("Rewards")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      msg.edit({
        components: [disabledRow]
      }).catch(() => {});
    });
  }
};