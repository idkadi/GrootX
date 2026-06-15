const connectDB = require("../database");

const {
  getRank,
  getTrophyChange,
  getRankFloor
} = require("./ranks");

const {
  giveRankRewards
} = require("./rankRewards");

module.exports = async (winnerId, loserId) => {
  const db = await connectDB();

  const rankedCol =
    db.collection("rankedProfiles");

  let winner =
    await rankedCol.findOne({
      userId: winnerId
    });

  let loser =
    await rankedCol.findOne({
      userId: loserId
    });

  if (!winner) {
    winner = {
      userId: winnerId,
      trophies: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      highestTrophies: 0,
      rewardsClaimed: []
    };

    await rankedCol.insertOne(winner);
  }

  if (!loser) {
    loser = {
      userId: loserId,
      trophies: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      highestTrophies: 0,
      rewardsClaimed: []
    };

    await rankedCol.insertOne(loser);
  }

  const oldWinnerTrophies =
    winner.trophies;

  const winnerRank =
    getRank(winner.trophies);

  const loserRank =
    getRank(loser.trophies);

  let winGain =
    getTrophyChange(
      winnerRank.name
    ).win;

  let lossAmount =
    getTrophyChange(
      loserRank.name
    ).loss;

  // Higher rank bonus

  if (
    loser.trophies >
    winner.trophies
  ) {
    winGain += 5;
  }

  // Lost to lower rank

  if (
    winner.trophies >
    loser.trophies
  ) {
    lossAmount -= 5;
  }

  winner.streak =
    (winner.streak || 0) + 1;

  if (winner.streak >= 5) {
    winGain += 5;
  } else if (
    winner.streak >= 3
  ) {
    winGain += 3;
  }

  winner.trophies += winGain;

  loser.trophies += lossAmount;

  const floor =
    getRankFloor(
      loser.highestTrophies || 0
    );

  if (loser.trophies < floor) {
    loser.trophies = floor;
  }

  winner.wins =
    (winner.wins || 0) + 1;

  loser.losses =
    (loser.losses || 0) + 1;

  loser.streak = 0;

  if (
    winner.trophies >
    (winner.highestTrophies || 0)
  ) {
    winner.highestTrophies =
      winner.trophies;
  }

  // AUTO REWARDS

  const rewards =
    await giveRankRewards(
      db,
      winnerId,
      oldWinnerTrophies,
      winner.trophies,
      winner.rewardsClaimed || []
    );

  winner.rewardsClaimed = [
    ...(winner.rewardsClaimed || []),
    ...rewards.claimedIds
  ];

  await rankedCol.updateOne(
    { userId: winnerId },
    {
      $set: winner
    }
  );

  await rankedCol.updateOne(
    { userId: loserId },
    {
      $set: loser
    }
  );

  return {
    winGain,
    lossAmount,

    winnerTrophies:
      winner.trophies,

    loserTrophies:
      loser.trophies,

    rewardsText:
      rewards.text || ""
  };
};