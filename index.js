require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Connectors, Shoukaku } = require('shoukaku');
const express = require('express');

// =========================
// KEEP RENDER ALIVE
// =========================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is running with Lavalink!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// =========================
// LAVALINK NODE
// =========================
const Nodes = [
  {
    name: 'OptikLinkNode',
    url: process.env.LAVALINK_HOST,
    auth: process.env.LAVALINK_PASSWORD,
    secure: false
  }
];

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  Nodes
);

shoukaku.on('ready', (name) => {
  console.log(`[LAVALINK] Node connected: ${name}`);
});

shoukaku.on('error', (name, error) => {
  console.error(`[LAVALINK ERROR] ${name}`, error);
});

// =========================
// QUEUES
// =========================
const queues = new Map();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =========================
// COMMANDS
// =========================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  // =========================
  // PLAY
  // =========================
  if (command === '!play') {
    const query = args.join(' ');

    if (!query)
      return message.reply('❌ Please provide a song name or URL!');

    const voiceChannel = message.member.voice.channel;

    if (!voiceChannel)
      return message.reply('❌ Join a voice channel first!');

    const node = shoukaku.options.nodeResolver(shoukaku.nodes);

    if (!node)
      return message.reply('❌ Lavalink node is offline!');

    try {
      const result = await node.rest.resolve(
        query.startsWith('http')
          ? query
          : `ytsearch:${query}`
      );

      if (!result || !result.data || result.data.length === 0) {
        return message.reply('❌ No song found!');
      }

      const track = Array.isArray(result.data)
        ? result.data[0]
        : result.data;

      let queue = queues.get(message.guild.id);

      // =========================
      // CREATE PLAYER
      // =========================
      if (!queue) {
        const player = await shoukaku.joinVoiceChannel({
          guildId: message.guild.id,
          channelId: voiceChannel.id,
          shardId: 0
        });

        queue = {
          player,
          songs: []
        };

        queues.set(message.guild.id, queue);

        player.on('end', async () => {
          if (queue.songs.length === 0) {
            shoukaku.leaveVoiceChannel(message.guild.id);
            queues.delete(message.guild.id);
            return message.channel.send('👋 Left voice channel');
          }

          const next = queue.songs.shift();

          await player.playTrack({
            track: {
              encoded: next.encoded
            }
          });

          message.channel.send(`🎵 Now playing: ${next.info.title}`);
        });

        await player.playTrack({
          track: {
            encoded: track.encoded
          }
        });

        return message.reply(`🎵 Now playing: ${track.info.title}`);
      }

      // =========================
      // ADD TO QUEUE
      // =========================
      queue.songs.push(track);
      return message.reply(`✅ Added to queue: ${track.info.title}`);
    } catch (err) {
      console.error(err);
      return message.reply(`❌ Error: ${err.message}`);
    }
  }

  // =========================
  // LEAVE / STOP
  // =========================
  if (command === '!leave' || command === '!stop') {
    const queue = queues.get(message.guild.id);

    if (!queue)
      return message.reply('❌ Nothing is playing!');

    shoukaku.leaveVoiceChannel(message.guild.id);
    queues.delete(message.guild.id);

    return message.reply('👋 Disconnected from VC');
  }

  // =========================
  // SKIP
  // =========================
  if (command === '!skip') {
    const queue = queues.get(message.guild.id);

    if (!queue)
      return message.reply('❌ Nothing is playing!');

    queue.player.stopTrack();

    return message.reply('⏭️ Skipped');
  }
});

client.login(process.env.TOKEN);
