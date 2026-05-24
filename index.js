require("dotenv").config();

const fs = require("fs");
const path = require("path");

const connectDB =
  require("./database");

const cards =
  require("./data/cards");

const autoDrop =
  require("./systems/autoDrop");

const {

  Client,
  GatewayIntentBits,
  Partials,
  Collection

} = require("discord.js");

console.log(
  "\n========== CARD LOADING =========="
);

console.log(
  `✅ Total Cards Loaded: ${cards.length}`
);

let brokenImages = 0;

cards.forEach(card => {

  const imagePath =
    path.join(
      __dirname,
      "images",
      card.image
    );

  if (
    !fs.existsSync(imagePath)
  ) {

    console.log(
      `❌ Missing Image: ${card.image}`
    );

    brokenImages++;

  }

});

if (brokenImages === 0) {

  console.log(
    "✅ All card images found!"
  );

}

else {

  console.log(
    `❌ ${brokenImages} broken images found`
  );

}

console.log(
  "==================================\n"
);

// CLIENT
const client = new Client({

  intents: [

    GatewayIntentBits.Guilds,

    GatewayIntentBits.GuildMessages,

    GatewayIntentBits.MessageContent,

    GatewayIntentBits.GuildMessageReactions

  ],

  partials: [

    Partials.Message,
    Partials.Channel,
    Partials.Reaction

  ]

});

// COMMANDS
client.commands =
  new Collection();

// COMMANDS PATH
const commandsPath =
  path.join(
    __dirname,
    "commands"
  );

// COMMAND FILES
const commandFiles =
  fs.readdirSync(commandsPath)

    .filter(file =>
      file.endsWith(".js")
    );

// LOAD COMMANDS
for (const file of commandFiles) {

  const filePath =
    path.join(
      commandsPath,
      file
    );

  const command =
    require(filePath);

  client.commands.set(
    command.name,
    command
  );

}

// READY
client.once(
  "clientReady",

  async () => {

    await connectDB();

    console.log(
      `${client.user.tag} is online!`
    );

    autoDrop(client);

  }

);

// MESSAGE EVENT
client.on(
  "messageCreate",

  async message => {

    if (message.author.bot)
      return;

    const db =
      await connectDB();

    const prefixesCol =
      db.collection("prefixes");

    const guildPrefix =
      await prefixesCol.findOne({

        guildId:
          message.guild?.id

      });

    const PREFIX =
      guildPrefix?.prefix || "!";

    if (
      !message.content.startsWith(
        PREFIX
      )
    ) return;

    const args =
      message.content

        .slice(PREFIX.length)

        .trim()

        .split(/ +/);

    const commandName =
      args.shift()
        .toLowerCase();

    const command =

      client.commands.get(commandName)

      ||

      client.commands.find(cmd =>

        cmd.aliases &&
        cmd.aliases.includes(
          commandName
        )

      );

    if (!command)
      return;

    try {

      await command.execute(
        message,
        args,
        client
      );

    }

    catch (error) {

      console.error(error);

      message.reply(

        "❌ An error occurred while executing this command."

      );

    }

  }

);

// LOGIN
client.login(
  process.env.TOKEN
);