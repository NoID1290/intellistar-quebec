'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

function resolveHlsDirectory(config) {
  if (config.useRamCache) {
    const rawRam = config.ramCacheDirectory || (process.platform === 'linux' ? '/dev/shm/intelli-stream' : 'R:/intelli-cache');
    const cleanedRam = `${rawRam}`.trim().replace(/^['"]+|['"]+$/g, '');
    if (process.platform === 'win32') {
      const root = path.parse(cleanedRam).root;
      if (root && fs.existsSync(root)) return path.normalize(cleanedRam);
    } else if (process.platform === 'linux' && fs.existsSync('/dev/shm')) {
      return path.normalize(cleanedRam);
    }
  }
  const rawDir = `${config.hlsDirectory || ''}`.trim() || './stream-cache';
  const cleanedDir = rawDir.replace(/^['"]+|['"]+$/g, '');
  const resolved = path.isAbsolute(cleanedDir) ? path.normalize(cleanedDir) : path.resolve(__dirname, cleanedDir);
  if (process.platform === 'win32') {
    const root = path.parse(resolved).root;
    if (root && /^[a-zA-Z]:\\$/.test(root) && !fs.existsSync(root)) return path.resolve(__dirname, './stream-cache');
  }
  return resolved;
}

function hlsOptions(env = process.env, config = require('./stream-config'), extraOptions = {}) {
  const ingestPort = Number(env.OBS_RTMP_PORT || 19350);
  if (!Number.isInteger(ingestPort) || ingestPort < 1024 || ingestPort > 65535) {
    throw new Error('OBS_RTMP_PORT must be between 1024 and 65535.');
  }
  if (ingestPort === Number(env.PORT || 7070)) throw new Error('OBS_RTMP_PORT and PORT must differ.');
  const segmentTime = Number(config.hlsSegmentTime);
  const listSize = Number(config.hlsListSize);
  if (!Number.isInteger(segmentTime) || segmentTime < 1 || segmentTime > 10) throw new Error('HLS segment time must be 1-10 seconds.');
  if (!Number.isInteger(listSize) || listSize < 3 || listSize > 60) throw new Error('HLS playlist size must be 3-60 segments.');
  const playlistName = config.hlsPlaylistName || 'index.m3u8';
  if (!/^[A-Za-z0-9_-]+\.m3u8$/.test(playlistName)) throw new Error('HLS playlist name must be a simple .m3u8 filename.');
  const youtubeRtmpUrl = env.HLS_YOUTUBE_RTMP_URL || extraOptions.youtubeRtmpUrl || null;
  return { ingestPort, ingestUrl: `rtmp://127.0.0.1:${ingestPort}/live/intellistar`,
    directory: resolveHlsDirectory(config), playlistName, segmentTime, listSize,
    ffmpegPath: env.STREAM_FFMPEG_PATH || 'ffmpeg', youtubeRtmpUrl };
}

function hlsArgs(options, session) {
  if (!/^[a-zA-Z0-9-]+$/.test(session)) throw new Error('Invalid HLS session identifier.');
  const hlsSegmentPattern = path.join(options.directory, `obs-${session}-%06d.ts`);
  const hlsPlaylist = path.join(options.directory, options.playlistName);
  const hlsFlags = 'delete_segments+temp_file+independent_segments';

  if (options.youtubeRtmpUrl) {
    const teeOutput = `[f=hls:hls_time=${options.segmentTime}:hls_list_size=${options.listSize}:hls_flags=${hlsFlags}:hls_segment_filename=${hlsSegmentPattern}]${hlsPlaylist}|[f=flv:onfail=ignore]${options.youtubeRtmpUrl}`;
    return ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
      '-listen', '1', '-timeout', '30', '-i', options.ingestUrl,
      '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
      '-f', 'tee', teeOutput];
  }

  return ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y',
    '-listen', '1', '-timeout', '30', '-i', options.ingestUrl,
    '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-f', 'hls',
    '-hls_time', String(options.segmentTime), '-hls_list_size', String(options.listSize),
    '-hls_flags', hlsFlags,
    '-hls_segment_filename', hlsSegmentPattern,
    hlsPlaylist];
}

function hlsReady(options, session) {
  try {
    const playlistPath = path.join(options.directory, options.playlistName);
    if (Date.now() - fs.statSync(playlistPath).mtimeMs > Math.max(15000, options.segmentTime * 3000)) return false;
    const playlist = fs.readFileSync(playlistPath, 'utf8');
    const segments = playlist.split('\n').filter(line => line.startsWith(`obs-${session}-`) && line.endsWith('.ts'));
    return segments.length > 0 && segments.every(segment => path.basename(segment) === segment && fs.statSync(path.join(options.directory, segment)).size > 0);
  } catch { return false; }
}

module.exports = { resolveHlsDirectory, hlsOptions, hlsArgs, hlsReady };

function requireFreePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Local RTMP port ${port} is unavailable. No existing service was stopped.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

module.exports.requireFreePort = requireFreePort;