const { MongoClient } = require("mongodb");

const uri =
  "mongodb://adityakumar07june:ypGlDhXk8Y3hMQx8@ac-rdazeaw-shard-00-00.73xejc1.mongodb.net:27017,ac-rdazeaw-shard-00-01.73xejc1.mongodb.net:27017,ac-rdazeaw-shard-00-02.73xejc1.mongodb.net:27017/?ssl=true&replicaSet=atlas-bczvl1-shard-0&authSource=admin&appName=Groot";

const client =
  new MongoClient(uri);

let db;

async function connectDB() {

  if (!db) {

    await client.connect();

    db = client.db("grootx");

    console.log("✅ MongoDB Connected");

  }

  return db;

}

module.exports = connectDB;