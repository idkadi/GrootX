const activeBattles = require("../data/activeBattles");
const battleCommand = require("./battle");

module.exports = {
  name: "forfeit",
  aliases: ["ff"],

  async execute(message) {
    const battle = activeBattles.get(message.author.id);

    if (!battle) {
      return message.reply("❌ You are not in an active battle.");
    }

    if (battle.finished) {
      activeBattles.delete(battle.player1Id);
      activeBattles.delete(battle.player2Id);

      return message.reply("✅ Cleared your old finished battle state.");
    }

    const winnerId =
      message.author.id === battle.player1Id
        ? battle.player2Id
        : battle.player1Id;

    await message.reply("🏳️ You forfeited the battle.");

    return battleCommand.finishBattle(
      message.client,
      battle,
      winnerId,
      `because <@${message.author.id}> forfeited.`
    );
  }
};