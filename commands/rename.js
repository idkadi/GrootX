const connectDB = require("../database");

module.exports = {
  name: "rename",

  async execute(message, args) {
    if (!args[0]) {
      return message.reply(
        "❌ Usage:\n" +
        "`!rename tag <oldname> <newname>`\n" +
        "`!rename emoji <tagname> <emoji>`"
      );
    }

    const db = await connectDB();

    const createdTagsCol = db.collection("createdtags");
    const cardTagsCol = db.collection("cardtags");

    const userId = message.author.id;

    const sub = args[0].toLowerCase();

    // Rename tag name
    if (sub === "tag") {
      const oldName = args[1]?.toLowerCase();
      const newName = args[2]?.toLowerCase();

      if (!oldName || !newName) {
        return message.reply(
          "❌ Usage: `!rename tag <oldname> <newname>`"
        );
      }

      const existing = await createdTagsCol.findOne({
        userId,
        name: oldName
      });

      if (!existing) {
        return message.reply("❌ Tag not found.");
      }

      const duplicate = await createdTagsCol.findOne({
        userId,
        name: newName
      });

      if (duplicate) {
        return message.reply("❌ A tag with that name already exists.");
      }

      await createdTagsCol.updateOne(
        { userId, name: oldName },
        {
          $set: {
            name: newName
          }
        }
      );

      // Update all tagged cards using it
      await cardTagsCol.updateMany(
        {
          userId,
          tagName: oldName
        },
        {
          $set: {
            tagName: newName
          }
        }
      );

      return message.reply(
        `✅ Renamed tag **${oldName}** → **${newName}**`
      );
    }

    // Change emoji
    if (sub === "emoji") {
      const tagName = args[1]?.toLowerCase();
      const emoji = args[2];

      if (!tagName || !emoji) {
        return message.reply(
          "❌ Usage: `!rename emoji <tagname> <emoji>`"
        );
      }

      const tag = await createdTagsCol.findOne({
        userId,
        name: tagName
      });

      if (!tag) {
        return message.reply("❌ Tag not found.");
      }

      await createdTagsCol.updateOne(
        {
          userId,
          name: tagName
        },
        {
          $set: {
            emoji
          }
        }
      );

      // Update all cards using the tag
      await cardTagsCol.updateMany(
        {
          userId,
          tagName
        },
        {
          $set: {
            emoji
          }
        }
      );

      return message.reply(
        `✅ Updated **${tagName}** emoji to ${emoji}`
      );
    }

    return message.reply(
      "❌ Usage:\n" +
      "`!rename tag <oldname> <newname>`\n" +
      "`!rename emoji <tagname> <emoji>`"
    );
  }
};