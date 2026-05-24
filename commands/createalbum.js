const connectDB =
  require("../database");

module.exports = {

  name: "createalbum",

  async execute(message, args) {

    if (!args.length) {

      return message.reply(

        "❌ Provide an album name.\n\n" +

        "Example:\n" +

        "`!createalbum Iron-Man`"

      );

    }

    const albumName =
      args.join(" ");

    const db =
      await connectDB();

    const inventoryCol =
      db.collection("inventory");

    const albumsCol =
      db.collection("albums");

    const userId =
      message.author.id;

    let inventoryDoc =
      await inventoryCol.findOne({
        userId
      });

    if (!inventoryDoc) {

      await inventoryCol.insertOne({

        userId,

        items: {}

      });

      inventoryDoc = {

        userId,

        items: {}

      };

    }

    const items =
      inventoryDoc.items || {};

    if (
      (items.album || 0) < 1
    ) {

      return message.reply(

        "❌ You need an Album item.\n\n" +

        "Buy one using:\n" +

        "`!buy album`"

      );

    }

    const existing =
      await albumsCol.findOne({

        userId,

        name: {
          $regex:
            `^${albumName}$`,
          $options: "i"
        }

      });

    if (existing) {

      return message.reply(

        "❌ You already have an album with this name."

      );

    }

    await inventoryCol.updateOne(

      { userId },

      {
        $inc: {
          "items.album": -1
        }
      }

    );

    await albumsCol.insertOne({

      userId,

      id:
        Date.now().toString(),

      name:
        albumName,

      pages: []

    });

    message.reply(

      `📘 Created album ` +

      `**${albumName}**`

    );

  }

};