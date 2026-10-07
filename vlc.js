#!/usr/bin/env node
// =============================================================================
// IntelliSTAR Simulator — Node.js Cross-Platform VLC Stream Launcher
// =============================================================================
const { spawn, execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const config = require('./stream-config');
const logger = require('./console-view');
const { c } = logger;

const port = process.env.PORT || config.port || 7070;
const playlistName = config.hlsPlaylistName || 'index.m3u8';
const streamUrl = process.argv[2] || `http://localhost:${port}/stream/${playlistName}`;

console.log(c.cyan('╔══════════════════════════════════════════════════════════════════════════╗'));
console.log(c.cyan('║  ') + c.bold(c.whiteBright('INTELLISTAR 1')) + c.cyan('  •  ') + c.bold(c.blueBright('VLC MEDIA PLAYER STREAM LAUNCHER')) + c.cyan('              ║'));
console.log(c.cyan('║  ') + c.dim('Low-latency live IPTV / HLS broadcast monitoring') + c.cyan('                       ║'));
console.log(c.cyan('╚══════════════════════════════════════════════════════════════════════════╝'));

logger.stream(`Target Stream URL: ${c.green(streamUrl)}`);

// Print LAN IP
try {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        logger.stream(`Local Network URL: ${c.green(`http://${net.address}:${port}/stream/${playlistName}`)}`);
        break;
      }
    }
  }
} catch (e) {}

// Find VLC binary
function findVlc() {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'VideoLAN', 'VLC', 'vlc.exe'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'VideoLAN', 'VLC', 'vlc.exe'),
    ].filter(Boolean);

    for (const cPath of candidates) {
      if (fs.existsSync(cPath)) return { cmd: cPath, args: [] };
    }
    try {
      execSync('where vlc', { stdio: 'ignore' });
      return { cmd: 'vlc', args: [] };
    } catch (e) {}
  } else if (process.platform === 'darwin') {
    const macPath = '/Applications/VLC.app/Contents/MacOS/VLC';
    if (fs.existsSync(macPath)) return { cmd: macPath, args: [] };
    try {
      execSync('which vlc', { stdio: 'ignore' });
      return { cmd: 'vlc', args: [] };
    } catch (e) {}
  } else {
    // Linux / Steam Deck
    try {
      execSync('which vlc', { stdio: 'ignore' });
      return { cmd: 'vlc', args: [] };
    } catch (e) {}

    // Check Flatpak (common on Steam Deck)
    try {
      execSync('flatpak info org.videolan.VLC', { stdio: 'ignore' });
      return { cmd: 'flatpak', args: ['run', 'org.videolan.VLC'] };
    } catch (e) {}

    const flatpakPaths = [
      '/var/lib/flatpak/exports/bin/org.videolan.VLC',
      path.join(os.homedir(), '.local/share/flatpak/exports/bin/org.videolan.VLC'),
    ];
    for (const fp of flatpakPaths) {
      if (fs.existsSync(fp)) return { cmd: fp, args: [] };
    }
  }
  return null;
}

const vlc = findVlc();
if (!vlc) {
  logger.error('VLC Media Player was not found on your system.');
  if (process.platform === 'linux') {
    console.log(c.dim('    On Steam Deck (Desktop Mode): install via Discover or run:'));
    console.log(c.yellow('      flatpak install flathub org.videolan.VLC'));
    console.log(c.dim('    On Arch / SteamOS: sudo pacman -S vlc'));
    console.log(c.dim('    On Ubuntu / Debian: sudo apt install vlc'));
  } else if (process.platform === 'win32') {
    console.log(c.dim('    Download VLC from: https://www.videolan.org/vlc/'));
  }
  console.log(`\n    You can manually open this stream URL in any media player:\n    ${c.green(streamUrl)}\n`);
  process.exit(1);
}

const vlcArgs = [
  ...vlc.args,
  '--fullscreen',
  '--network-caching=1000',
  '--clock-jitter=0',
  '--clock-synchro=0',
  '--no-video-title-show',
  '--input-repeat=65535',
  '--no-play-and-exit',
  streamUrl,
  ...process.argv.slice(3),
];

logger.stream('Launching VLC with low-latency settings (1000ms caching)...', c.cyan('▶'));
const child = spawn(vlc.cmd, vlcArgs, {
  detached: true,
  stdio: 'ignore',
});
child.unref();

logger.ready('VLC player launched successfully');
process.exit(0);
