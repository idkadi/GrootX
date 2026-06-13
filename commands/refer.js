const { EmbedBuilder } = require("discord.js");
const connectDB = require("../database");

async function generateReferralCode(referralsCol) {
  while (true) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const exists = await referralsCol.findOne({ code });
    if (!exists) return code;
  }
}

module.exports = {
  name: "refer",
  aliases: ["referral"],

  async execute(message) {
    const db = await connectDB();
    const referralsCol = db.collection("referrals");

    const userId = message.author.id;

    let data = await referralsCol.findOne({ userId });

    if (!data) {
      const code = await generateReferralCode(referralsCol);

      data = {
        userId,
        code,
        referredUsers: [],
        createdAt: Date.now()
      };

      await referralsCol.insertOne(data);
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aeff)
      .setTitle("🔗 Your GrootX Referral Code")
      .setDescription(
        `Your referral code is:\n\n` +
        `## ${data.code}\n\n` +
        "Give this code to new players when they use `!debut`.\n\n" +
        "When someone uses your code, you get **3 Epic cards**."
      )
      .setFooter({
        text: `Total referrals: ${data.referredUsers?.length || 0}`
      });

    return message.reply({ embeds: [embed] });
  }
};