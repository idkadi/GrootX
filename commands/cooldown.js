const {
  EmbedBuilder
} = require("discord.js");

const connectDB =
  require("../database");

module.exports = {

  name: "cooldown",

  aliases: ["cd"],

  async execute(message) {

    const db =
      await connectDB();

    const cooldownsCol =
      db.collection("cooldowns");

    const userId =
      message.author.id;

    const now =
      Date.now();

    // ===== DROP =====

    const dropDoc =
      await cooldownsCol.findOne({

        type: "drop",

        userId

      });

    const dropCooldown =
      dropDoc?.timestamp;

    const dropTime =
      8 * 60 * 1000;

    let dropText =
      "✅ Ready";

    if (

      dropCooldown &&

      now - dropCooldown <
      dropTime

    ) {

      const remaining =
        dropTime -
        (now - dropCooldown);

      const minutes =
        Math.floor(
          remaining / 60000
        );

      const seconds =
        Math.floor(
          (remaining % 60000) / 1000
        );

      dropText =
        `⏳ ${minutes}m ${seconds}s`;

    }

    // ===== PICKUP =====

    const pickupDoc =
      await cooldownsCol.findOne({

        type: "pickup",

        userId

      });

    const pickupCooldown =
      pickupDoc?.timestamp;

    const pickupTime =
      5 * 60 * 1000;

    let pickupText =
      "✅ Ready";

    if (

      pickupCooldown &&

      now - pickupCooldown <
      pickupTime

    ) {

      const remaining =
        pickupTime -
        (now - pickupCooldown);

      const minutes =
        Math.floor(
          remaining / 60000
        );

      const seconds =
        Math.floor(
          (remaining % 60000) / 1000
        );

      pickupText =
        `⏳ ${minutes}m ${seconds}s`;

    }

    const embed =
      new EmbedBuilder()

        .setColor(0x8b5cf6)

        .setTitle(
          "⏱️ Cooldowns"
        )

        .addFields(

          {
            name:
              "🎴 Drop Cooldown",

            value:
              dropText,

            inline: false
          },

          {
            name:
              "🎯 Pickup Cooldown",

            value:
              pickupText,

            inline: false
          }

        )

        .setFooter({

          text:
            "GrootX Cooldown System"

        })

        .setTimestamp();

    await message.reply({

      embeds: [embed]

    });

  }

};