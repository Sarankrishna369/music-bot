require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require("discord.js");

const { Connectors, Shoukaku } = require("shoukaku");
const express = require("express");

// =========================
// WEB SERVER (Render)
// =========================
const app = express();

app.get("/", (req, res) => {
  res.send("Music Bot Online");
});

app.listen(process.env.PORT || 10000, () => {
  console.log(`Web server listening on port ${process.env.PORT || 10000}`);
});

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// LAVALINK
// =========================
const Nodes = [
  {
    name: "PremiumNode",
    url: process.env.LAVALINK_HOST,
    auth: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE === "true"
  }
];

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  Nodes
);

// Prevent crash on Lavalink errors
shoukaku.on("error", (name, error) => {
  console.error(`[LAVALINK ERROR] ${name}`, error);
});

shoukaku.on("ready", (name) => {
  console.log(`[LAVALINK] Node connected: ${name}`);
});

shoukaku.on("close", (name, code, reason) => {
  console.log(
    `[LAVALINK CLOSED] ${name} | Code: ${code} | Reason: ${reason}`
  );
});

// =========================
// QUEUES
// =========================
const queues = new Map();

// =========================
// READY
// =========================
client.once("ready", () => {
  console.log(`${client.user.tag} online`);

  client.user.setActivity("/play music", {
    type: ActivityType.Listening
  });
});

// =========================
// PLAY COMMAND
// =========================
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // ======================
  // PLAY
  // ======================
  if (cmd === "!play") {
    const query = args.join(" ");

    if (!query)
      return message.reply("❌ Please provide a song name.");

    const vc = message.member.voice.channel;

    if (!vc)
      return message.reply("❌ Join a voice channel first.");

    try {
      const node = [...shoukaku.nodes.values()][0];

      if (!node)
        return message.reply(
          "❌ Lavalink node unavailable. Try again later."
        );

      const result = await node.rest.resolve(`scsearch:${query}`);

      if (
        !result ||
        !result.data ||
        result.data.length === 0
      ) {
        return message.reply("❌ No results found.");
      }

      const track = result.data[0];

      let queue = queues.get(message.guild.id);

      if (!queue) {
        const player = await shoukaku.joinVoiceChannel({
          guildId: message.guild.id,
          channelId: vc.id,
          shardId: 0,
          deaf: true
        });

        queue = {
          player,
          tracks: []
        };

        queues.set(message.guild.id, queue);

        player.on("end", async () => {
          if (queue.tracks.length === 0) return;

          const next = queue.tracks.shift();

          try {
            await player.playTrack({
              track: {
                encoded: next.encoded
              }
            });
          } catch (err) {
            console.error(err);
          }
        });

        await player.playTrack({
          track: {
            encoded: track.encoded
          }
        });
      } else {
        queue.tracks.push(track);
      }

      const embed = new EmbedBuilder()
        .setColor("Purple")
        .setTitle("🎵 Now Playing")
        .setDescription(`**${track.info.title}**`)
        .addFields(
          {
            name: "Author",
            value: track.info.author || "Unknown",
            inline: true
          },
          {
            name: "Length",
            value:
              `${Math.floor(track.info.length / 60000)} min`,
            inline: true
          }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("skip")
          .setLabel("Skip")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("stop")
          .setLabel("Stop")
          .setStyle(ButtonStyle.Danger)
      );

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });
    } catch (err) {
      console.error(err);
      return message.reply(
        "❌ Failed to play song. Lavalink may be offline."
      );
    }
  }

  // ======================
  // QUEUE
  // ======================
  if (cmd === "!queue") {
    const queue = queues.get(message.guild.id);

    if (!queue || queue.tracks.length === 0) {
      return message.reply("📭 Queue is empty.");
    }

    const songs = queue.tracks
      .map((t, i) => `${i + 1}. ${t.info.title}`)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📜 Queue")
      .setDescription(songs);

    return message.reply({
      embeds: [embed]
    });
  }

  // ======================
  // DEMO COMMANDS
  // ======================
  if (cmd === "!247") {
    return message.reply("✅ 24/7 mode enabled (demo)");
  }

  if (cmd === "!autoplay") {
    return message.reply("✅ Autoplay enabled (demo)");
  }

  if (cmd === "!dj") {
    return message.reply("🎧 DJ mode enabled");
  }
});

// =========================
// BUTTONS
// =========================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const queue = queues.get(interaction.guild.id);

  if (!queue) {
    return interaction.reply({
      content: "❌ Nothing is playing.",
      ephemeral: true
    });
  }

  if (interaction.customId === "skip") {
    try {
      queue.player.stopTrack();

      return interaction.reply("⏭️ Song skipped.");
    } catch {
      return interaction.reply({
        content: "❌ Unable to skip.",
        ephemeral: true
      });
    }
  }

  if (interaction.customId === "stop") {
    try {
      shoukaku.leaveVoiceChannel(interaction.guild.id);

      queues.delete(interaction.guild.id);

      return interaction.reply("🛑 Playback stopped.");
    } catch {
      return interaction.reply({
        content: "❌ Unable to stop.",
        ephemeral: true
      });
    }
  }
});

// =========================
// LOGIN
// =========================
client.login(process.env.TOKEN);
