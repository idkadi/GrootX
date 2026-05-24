const fs = require("fs");
const connectDB = require("./database");

async function migrate() {

  const db =
    await connectDB();

  const trades = JSON.parse(
    fs.readFileSync("./data/trades.json", "utf8")
  );

  const docs = Object.entries(trades).map(
    ([tradeId, data]) => ({
      tradeId,
      ...data
    })
  );

  if (docs.length > 0) {

    await db.collection("trades").deleteMany({});
    await db.collection("trades").insertMany(docs);

  }

  console.log(`✅ Migrated ${docs.length} trades`);

  process.exit();
}

migrate();