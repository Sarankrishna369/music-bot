require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Connectors, Shoukaku } = require('shoukaku');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running with LavaLink!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

const Nodes = [
  {
    name: 'G3V',
    url: 'lava.g3v.co.uk:9008',
    auth: 'lavalinklol',
    secure: false
  },
  {
    name: 'Trinium',
    url: 'lavalink.triniumhost.com:4333',
    auth: 'free',
    secure: false
  },
  {
    name: 'Nexcloud',
    url: 'n3.nexcloud.in:2026',
    auth: 'nexcloud',
    secure: false
  },
  {
    name: 'VexaNode',
    url: 'omega.vexanode.cloud:2031',
    auth: 'https://discord.vexanode.cloud',
    secure: false
  }
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);
shoukaku.on('error', (_, error) => console.error('Shoukaku Error:', error));
shoukaku.on('ready', (name) => console.log(`LavaLink Node: ${name} is now connected!`));

const queues = new Map();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();

  if (command === '!play') {
    const query = args.slice(1).join(' ');
    if (!query) return message.reply("❌ Send a song name!");
    if (!message.member.voice.channelId) return message.reply("❌ Join VC first!");

    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) return message.reply("❌ No Lavalink node is currently available. Please try again in a minute!");

    const result = await node.rest.resolve(query.startsWith('http') ? query : `ytsearch:${query}`);
    if (!result || result.loadType === 'empty' || result.loadType === 'NO_MATCHES' || result.loadType === 'LOAD_FAILED') {
      return message.reply("❌ No results found!");
    }

    let track;
    if (result.loadType === 'PLAYLIST_LOADED' || result.loadType === 'playlist') {
      track = result.data.tracks ? result.data.tracks[0] : result.data[0];
    } else if (result.loadType === 'SEARCH_RESULT' || result.loadType === 'search') {
      track = result.data[0];
    } else {
      track = result.data;
    }

    if (!track || !track.encoded) return message.reply("❌ Error loading that specific track.");

    let queue = queues.get(message.guild.id);

    if (!queue) {
      // Join the voice channel
      const player = await shoukaku.joinVoiceChannel({
        guildId: message.guild.id,
        channelId: message.member.voice.channelId,
        shardId: 0
      });

      queue = {
        player,
        songs: [],
        volume: 100
      };
      queues.set(message.guild.id, queue);

      player.on('end', async () => {
        if (queue.songs.length === 0) {
          shoukaku.leaveVoiceChannel(message.guild.id);
          queues.delete(message.guild.id);
          message.channel.send("⏹️ Queue finished. Leaving voice channel!");
        } else {
          const nextTrack = queue.songs.shift();
          await player.playTrack({ track: nextTrack.encoded });
          message.channel.send(`🎵 Now playing: **${nextTrack.info.title}**`);
        }
      });

      await player.playTrack({ track: track.encoded });
      message.reply(`🎵 Now playing: **${track.info.title}**`);
    } else {
      queue.songs.push(track);
      message.reply(`✅ Added to queue: **${track.info.title}**`);
    }
  }

  if (command === '!skip') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("❌ Nothing is playing!");
    if (!message.member.voice.channelId) return message.reply("❌ Join VC first!");

    message.reply("⏭️ Skipped!");
    queue.player.stopTrack(); // Emits 'end' which triggers the next song
  }

  if (command === '!volume') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("❌ Nothing is playing!");
    if (!message.member.voice.channelId) return message.reply("❌ Join VC first!");

    const vol = parseInt(args[1]);
    if (isNaN(vol) || vol < 0 || vol > 200) {
      return message.reply("❌ Provide a volume between 0 and 200!");
    }

    queue.player.setGlobalVolume(vol);
    queue.volume = vol;
    message.reply(`🔊 Volume set to **${vol}%**`);
  }

  if (command === '!queue') {
    const queue = queues.get(message.guild.id);
    if (!queue || queue.songs.length === 0) {
      return message.reply("The queue is currently empty.");
    }

    let qMsg = "**Upcoming Songs:**\n";
    queue.songs.forEach((song, i) => {
      qMsg += `${i + 1}. ${song.info.title}\n`;
    });
    message.reply(qMsg);
  }

  if (command === '!stop' || command === '!leave') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply("❌ Not in a voice channel!");

    queue.songs = [];
    shoukaku.leaveVoiceChannel(message.guild.id);
    queues.delete(message.guild.id);
    message.reply("⏹️ Stopped music and left the channel.");
  }
});

client.login(process.env.TOKEN);
