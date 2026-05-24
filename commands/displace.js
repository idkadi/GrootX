const connectDB = require("../database");

module.exports = {

  name: "displace",
  aliases: ["removefromalbum"],

  async execute(message, args) {

    if (!args[0]) {
      return message.reply(
        "❌ Provide album name."
      );
    }

    if (!args[1]) {
      return message.reply(
        "❌ Provide page number."
      );
    }

    if (!args[2]) {
      return message.reply(
        "❌ Provide slot number."
      );
    }

    const albumName =
      args[0];

    const pageNumber =
      Number(args[1]);

    const slotNumber =
      Number(args[2]);

    if (
      isNaN(pageNumber) ||
      pageNumber < 1
    ) {

      return message.reply(
        "❌ Invalid page number."
      );

    }

    if (
      isNaN(slotNumber) ||
      slotNumber < 1
    ) {

      return message.reply(
        "❌ Invalid slot number."
      );

    }

    const db =
      await connectDB();

    const albumsCol =
      db.collection("albums");

    const userId =
      message.author.id;

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

    const pageIndex =
      pageNumber - 1;

    if (
      !album.pages ||
      !album.pages[pageIndex]
    ) {

      return message.reply(
        "❌ Page not found."
      );

    }

    const slotIndex =
      slotNumber - 1;

    const page =
      album.pages[pageIndex];

    if (
      !page.slots ||
      !page.slots[slotIndex]
    ) {

      return message.reply(
        "❌ No card in that slot."
      );

    }

    page.slots[slotIndex] = null;

    await albumsCol.updateOne(

      {
        _id: album._id
      },

      {
        $set: {
          pages: album.pages
        }
      }

    );

    return message.reply(

      `✅ Removed card from ` +

      `page **${pageNumber}** ` +

      `slot **${slotNumber}**`

    );

  }

};