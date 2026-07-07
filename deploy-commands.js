require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = [];

const commandFiles = fs
  .readdirSync(path.join(__dirname, "commands"))
  .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);

  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} global slash commands.`);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      {
        body: commands
      }
    );

    console.log("✅ Global slash commands deployed successfully.");
  } catch (error) {
    console.error(error);
  }
})();