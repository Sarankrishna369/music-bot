
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} = require('discord.js');

const { Connectors, Shoukaku } = require('shoukaku');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Premium Music Bot Running'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const Nodes = [{
  name: 'PremiumNode',
  url: process.env.LAVALINK_HOST,
  auth: process.env.LAVALINK_PASSWORD,
  secure: true
}];

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  Nodes
);

const queues = new Map();

client.once('ready', () => {
  console.log(`${client.user.tag} online`);
  client.user.setActivity('/play music', {
    type: ActivityType.Listening
  });
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const args = message.content.split(' ');
  const cmd = args.shift().toLowerCase();

  if (cmd === '!play') {
    const query = args.join(' ');
    if (!query) return message.reply('❌ Give a song name');

    const vc = message.member.voice.channel;
    if (!vc) return message.reply('❌ Join VC first');

    const node = shoukaku.options.nodeResolver(shoukaku.nodes);

    try {
      const result = await node.rest.resolve(`ytsearch:${query}`);
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

        player.on('end', async () => {
          if (queue.tracks.length === 0) return;

          const next = queue.tracks.shift();

          await player.playTrack({
            track: { encoded: next.encoded }
          });
        });

        await player.playTrack({
          track: { encoded: track.encoded }
        });

      } else {
        queue.tracks.push(track);
      }

      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`**${track.info.title}**`)
        .setThumbnail(track.info.artworkUrl || null)
        .setColor('Purple')
        .addFields(
          { name: 'Author', value: track.info.author || 'Unknown', inline: true },
          { name: 'Duration', value: `${Math.floor(track.info.length / 60000)} min`, inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('skip')
          .setLabel('Skip')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('stop')
          .setLabel('Stop')
          .setStyle(ButtonStyle.Danger)
      );

      message.channel.send({
        embeds: [embed],
        components: [row]
      });

    } catch (e) {
      console.error(e);
      message.reply('❌ Error while playing');
    }
  }

  if (cmd === '!queue') {
    const queue = queues.get(message.guild.id);

    if (!queue || queue.tracks.length === 0)
      return message.reply('Queue empty');

    const songs = queue.tracks
      .map((t, i) => `${i + 1}. ${t.info.title}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📜 Queue')
      .setDescription(songs)
      .setColor('Blue');

    message.reply({ embeds: [embed] });
  }

  if (cmd === '!247') {
    return message.reply('✅ 24/7 mode enabled (demo)');
  }

  if (cmd === '!autoplay') {
    return message.reply('✅ Autoplay enabled (demo)');
  }

  if (cmd === '!dj') {
    return message.reply('🎧 DJ mode enabled');
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const queue = queues.get(interaction.guild.id);
  if (!queue) return interaction.reply({
    content: 'Nothing playing',
    ephemeral: true
  });

  if (interaction.customId === 'skip') {
    queue.player.stopTrack();
    return interaction.reply('⏭️ Skipped');
  }

  if (interaction.customId === 'stop') {
    shoukaku.leaveVoiceChannel(interaction.guild.id);
    queues.delete(interaction.guild.id);
    return interaction.reply('🛑 Stopped');
  }
});

client.login(process.env.TOKEN);
