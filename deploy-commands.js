require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

async function main() {
  const token = process.env.TOKEN?.trim();
  const clientId = process.env.CLIENT_ID?.trim();

  if (!token) {
    throw new Error(
      "TOKEN is missing from your .env file."
    );
  }

  if (
    !clientId ||
    !/^\d{17,20}$/.test(clientId)
  ) {
    throw new Error(
      "Set CLIENT_ID to your bot's Application ID in .env."
    );
  }

  const folder = path.join(
    __dirname,
    "commands"
  );

  const files = fs
    .readdirSync(folder)
    .filter(file => file.endsWith(".js"))
    .sort();

  const commands = [];
  const names = new Map();
  const failures = [];

  let skipped = 0;

  for (const file of files) {
    try {
      const command = require(
        path.join(folder, file)
      );

      if (!command.data) {
        console.log(
          `⏭️ ${file}: no slash definition; normal command only.`
        );

        skipped++;
        continue;
      }

      // Supports builders and plain API definition objects.
      const data =
        typeof command.data.toJSON === "function"
          ? command.data.toJSON()
          : command.data;

      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
      ) {
        throw new Error(
          "Invalid slash definition."
        );
      }

      if (
        data.type != null &&
        data.type !== 1
      ) {
        throw new Error(
          "Expected a chat-input slash command (type 1)."
        );
      }

      if (
        typeof data.name !== "string" ||
        !/^[a-z0-9_-]{1,32}$/.test(data.name)
      ) {
        throw new Error(
          "Slash name must be 1–32 lowercase letters, " +
          "digits, underscores or hyphens."
        );
      }

      if (
        typeof data.description !== "string" ||
        data.description.length < 1 ||
        data.description.length > 100
      ) {
        throw new Error(
          "Slash description must be 1–100 characters."
        );
      }

      if (names.has(data.name)) {
        throw new Error(
          `Duplicate /${data.name}; also defined in ` +
          `${names.get(data.name)}.`
        );
      }

      const handler = [
        command.slashExecute,
        command.executeSlash,
        command.slash,
        command.execute
      ].find(fn =>
        typeof fn === "function"
      );

      if (!handler) {
        throw new Error(
          "No executable command handler found."
        );
      }

      names.set(data.name, file);
      commands.push(data);

      console.log(
        `✅ /${data.name} — ${file}`
      );
    } catch (error) {
      failures.push(
        `${file}: ${error.message}`
      );
    }
  }

  // Bulk registration replaces the global command list.
  // Cancel if any file failed instead of deploying a partial list.
  if (failures.length) {
    throw new Error(
      "Deployment cancelled. Fix these command files first:\n" +
      failures.join("\n")
    );
  }

  if (!commands.length) {
    throw new Error(
      "No slash definitions found. Deployment cancelled."
    );
  }

  if (commands.length > 100) {
    throw new Error(
      "More than 100 global slash commands found."
    );
  }

  console.log(
    `\nLoaded ${commands.length} slash commands; ` +
    `${skipped} files have no slash definition.`
  );

  // Check without contacting Discord.
  if (process.argv.includes("--check")) {
    console.log(
      "✅ Check passed. No slash commands were changed."
    );

    return;
  }

  const rest = new REST({
    version: "10"
  }).setToken(token);

  console.log(
    `Refreshing ${commands.length} GLOBAL slash commands...`
  );

  const deployed = await rest.put(
    Routes.applicationCommands(clientId),
    {
      body: commands
    }
  );

  console.log(
    `✅ Deployed ${deployed.length} global slash commands successfully.`
  );

  console.log(
    "Restart the bot to load the updated command handlers."
  );
}

main().catch(error => {
  // Avoid dumping request objects or credentials.
  console.error(
    `❌ ${error.message}`
  );

  process.exitCode = 1;
});