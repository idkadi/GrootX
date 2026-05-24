const connectDB =
  require("../database");

module.exports = {

  name: "addpage",

  async execute(message, args) {

    if (!args.length) {

      return message.reply(

        "❌ Provide an album name.\n\n" +

        "Example:\n" +

        "`!addpage Iron-Man`"

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
      (items.page || 0) < 1
    ) {

      return message.reply(

        "❌ You need a Page item.\n\n" +

        "Buy one using:\n" +

        "`!buy page`"

      );

    }

    const album =
      await albumsCol.findOne({

        userId,

        name: {
          $regex:
            `^${albumName}$`,
          $options: "i"
        }

      });

    if (!album) {

      return message.reply(

        "❌ Album not found."

      );

    }

    await inventoryCol.updateOne(

      { userId },

      {
        $inc: {
          "items.page": -1
        }
      }

    );

    album.pages.push({

      background: 0,

      layout: null,

      slots: []

    });

    await albumsCol.updateOne(

      {
        _id:
          album._id
      },

      {
        $set: {
          pages:
            album.pages
        }
      }

    );

    message.reply(

      `📄 Added Page ` +

      `#${album.pages.length} ` +

      `to **${album.name}**`

    );

  }

};