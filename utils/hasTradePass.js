const fs = require("fs");

const tradePassesPath =
  "./data/tradePasses.json";

module.exports = userId => {

  const tradePasses =
    JSON.parse(
      fs.readFileSync(
        tradePassesPath
      )
    );

  const data =
    tradePasses[userId];

  if (!data)
    return false;

  return (
    Date.now() <
    data.expiresAt
  );

};