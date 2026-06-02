const connectDB = require("../database");

module.exports = {
  name: "tag",

  async execute(message, args) {
    if (!args[0]) {
      return message.reply("❌ Provide a tag name.");
    }

    const db = await connectDB();

    const collectionsCol = db.collection("collections");
    const createdTagsCol = db.collection("createdtags");
    const cardTagsCol = db.collection("cardtags");

    const userId = message.author.id;

    let code;
    let tagName;
    let card;

    // !tag tagname  => tag last collected card
    if (args.length === 1) {
      tagName = args[0].toLowerCase();

      card = await collectionsCol.findOne(
        { userId },
        {
          sort: {
            obtainedAt: -1,
            claimedAt: -1,
            createdAt: -1,
            _id: -1
          }
        }
      );

      if (!card) {
        return message.reply("❌ You have no collected cards.");
      }

      code = card.code;
    }

    // !tag code tagname  => old method still works
    else {
      code = args[0].toLowerCase();
      tagName = args[1].toLowerCase();

      card = await collectionsCol.findOne({
        userId,
        code
      });

      if (!card) {
        return message.reply("❌ Card not found.");
      }
    }

    if (tagName === "remove") {
      await cardTagsCol.deleteOne({
        userId,
        code
      });

      return message.reply(`✅ Removed tag from **${code}**`);
    }

    const createdTag = await createdTagsCol.findOne({
      userId,
      name: tagName
    });

    if (!createdTag) {
      return message.reply("❌ That tag does not exist.");
    }

    await cardTagsCol.updateOne(
      {
        userId,
        code
      },
      {
        $set: {
          tagName,
          emoji: createdTag.emoji,
          updatedAt: new Date()
        }
      },
      {
        upsert: true
      }
    );

    return message.reply(
      `✅ Applied ${createdTag.emoji} **${tagName}** to **${code}**`
    );
  }
};