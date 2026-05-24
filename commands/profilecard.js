const connectDB = require("../database");

module.exports = {
  name: "profilecard",
  aliases: ["setprofilecard", "showcase"],

  async execute(message, args) {
    const code = args[0];

    if (!code) {
      return message.reply("❌ Use: `!profilecard <card code>`");
    }

    const userId = message.author.id;

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const profilesCol = db.collection("profiles");

    const claimedCard = await collectionsCol.findOne({
      userId,
      code: code.toLowerCase()
    });

    if (!claimedCard) {
      return message.reply(
        `❌ You don't own card code **${code}**.`
      );
    }

    await profilesCol.updateOne(
      { userId },
      {
        $set: {
          showcaseCard: claimedCard.code
        }
      },
      {
        upsert: true
      }
    );

    return message.reply(
      `✅ Profile showcase card set to \`${claimedCard.code}\`.`
    );
  }
};