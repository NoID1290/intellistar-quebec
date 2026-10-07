#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const readline = require('node:readline/promises');
const { obsOptions, resolveDesktopEnvironment, stopChild } = require('./stream-obs');
const { controlRequest } = require('./obs-control');
const { getSystemStats, formatStatsText } = require('./system-stats');
const {
  getEncodingPreset,
  setEncodingPreset,
  formatEncodingText,
  normalizeResolution,
  normalizeFps,
  RESOLUTIONS,
  FRAME_RATES,
  syncActiveIcons,
  getIconStatus,
} = require('./encoding-presets');
const {
  sleepMonitors,
  wakeMonitors,
  getDisplayStatus,
} = require('./display-control');

//const YOUTUBE_STREAM_KEY = '0bwt-p2gw-q02k-0y0q-7vph'; // DEFAULT INTELLISTAR
const YOUTUBE_STREAM_KEY = 'qk67-qxtb-rq1t-3aj2-525a'; // CUSTOM INTELLISTAR 4K TEST

function syncYouTubeProfile(key = YOUTUBE_STREAM_KEY) {
  try {
    const { ensureYouTubeProfile } = require('./obs-hls-profile');
    const { getObsConfigDirectories } = require('./encoding-presets');
    for (const root of getObsConfigDirectories()) {
      ensureYouTubeProfile(root, 'IntelliSTAR YouTube', { YOUTUBE_STREAM_KEY: key });
    }
  } catch (e) {}
}
syncYouTubeProfile(YOUTUBE_STREAM_KEY);

const commands = [
  ['1', 'Start OBS - HLS (VLC / browser)', 'hls'],
  ['2', 'Start OBS - NDI', 'ndi'],
  ['3', 'Start OBS - YouTube (RTMP)', 'youtube'],
  ['4', 'Start OBS - Dual (YouTube RTMP + HLS)', 'dual'],
  ['5', 'Stop OBS broadcast', 'stop'],
  ['6', 'Broadcast status', 'status'],
  ['7', 'Start forecast', 'forecast-start'],
  ['8', 'Stop forecast / color bars', 'forecast-stop'],
  ['9', 'Forecast status', 'forecast-status'],
  ['10', 'Send message', 'message'],
  ['11', 'Alert controls', 'alert'],
  ['12', 'Refresh forecast page', 'refresh'],
  ['13', 'Open editor', 'editor'],
  ['14', 'Open HLS in VLC', 'vlc'],
  ['15', 'Create OBS HLS profile (once)', 'setup'],
  ['16', 'Create OBS YouTube profile (once)', 'setup-youtube'],
  ['17', 'Check OBS setup', 'check'],
  ['18', 'Show latest broadcast log', 'logs'],
  ['19', 'All other project commands', 'other'],
  ['20', 'Launch Touch Screen UI launcher', 'ui'],
  ['21', 'Show PC stats (CPU, GPU, RAM, Disk)', 'pc-stats'],
  ['22', 'Change encoding preset (720p / 1080p / 4K @ 24/30/60 fps)', 'encoding'],
  ['23', 'Put monitors to sleep (turn off Steam Deck displays)', 'sleep-monitors'],
  ['0', 'Exit menu (broadcast keeps running)', 'exit'],
];

function logPath(env = process.env) {
  return path.join(env.XDG_STATE_HOME || path.join(env.HOME || os.homedir(), '.local', 'state'), 'intellistar', 'obs.log');
}

function run(command, args, env = process.env, output = 'inherit') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: __dirname, env, stdio: output });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Command ended (${signal || code}).`)));
  });
}

async function startBackground(output, env = process.env, dependencies = {}) {
  const streamKey = env.YOUTUBE_STREAM_KEY || YOUTUBE_STREAM_KEY;
  if (output === 'youtube') {
    syncYouTubeProfile(streamKey);
  }
  const selected = resolveDesktopEnvironment({ ...env, OBS_OUTPUT: output, YOUTUBE_STREAM_KEY: streamKey });
  const options = obsOptions(selected);
  const request = dependencies.request || controlRequest;
  if (await request(options.socketPath, 'status', __dirname)) throw new Error('A broadcast is already running. Stop it before switching output.');
  const file = logPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const descriptor = fs.openSync(file, 'a', 0o600);
  fs.writeSync(descriptor, `\n--- ${new Date().toISOString()} OBS ${output} ---\n`);
  let child;
  try {
    child = (dependencies.spawn || spawn)(process.execPath, [path.join(__dirname, 'start-obs.js'), 'start', output], {
      cwd: __dirname, env: selected, detached: true, stdio: ['ignore', descriptor, descriptor],
    });
  } finally { fs.closeSync(descriptor); }
  let failure = null;
  child.once('error', error => { failure = error; });
  const deadline = Date.now() + 65000;
  try {
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode) throw new Error(`OBS startup failed. See ${file}.`);
      const status = await request(options.socketPath, 'status', __dirname);
      if (status?.phase === 'running') {
        child.unref();
        return { status, log: file };
      }
      if (status?.error) throw new Error(status.error);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`OBS startup timed out. See ${file}.`);
  } catch (error) {
    await stopChild(child, { timeout: 12000 });
    throw error;
  }
}

function tailLog(file, maxBytes = 16000) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(descriptor).size;
    const buffer = Buffer.alloc(Math.min(size, maxBytes));
    fs.readSync(descriptor, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    return buffer.toString('utf8');
  } finally { fs.closeSync(descriptor); }
}

async function main() {
  const cliAction = process.argv[2];
  if (['encoding', 'set-encoding'].includes(cliAction)) {
    const resArg = process.argv[3];
    const fpsArg = process.argv[4];
    if (resArg || fpsArg) {
      const result = setEncodingPreset({ resolution: resArg, fps: fpsArg }, __dirname);
      console.log(`Encoding preset updated: ${formatEncodingText(result)}`);
      return;
    }
    const current = getEncodingPreset(__dirname);
    console.log(`Current encoding preset: ${formatEncodingText(current)}`);
    return;
  }

  if (['sleep', 'sleep-monitors', 'display-sleep'].includes(cliAction)) {
    const res = sleepMonitors();
    if (res.success) {
      console.log(`All monitors put to sleep via ${res.method}. (Tap screen, trackpad, or press any key to wake)`);
    } else {
      console.error(`Failed to sleep monitors: ${res.error}`);
      process.exitCode = 1;
    }
    return;
  }

  if (['wake', 'wake-monitors', 'display-wake'].includes(cliAction)) {
    const res = wakeMonitors();
    console.log(`Monitors woken up via ${res.method}.`);
    return;
  }

  if (['youtube', 'start-youtube', 'obs-youtube'].includes(cliAction)) {
    console.log('Starting OBS YouTube (RTMP) in background...');
    const result = await startBackground('youtube');
    console.log(`Running. Log: ${result.log}`);
    console.log('YouTube RTMP: Streaming live to rtmp://a.rtmp.youtube.com/live2');
    console.log('Use Start forecast when ready. Closing this terminal will not stop the broadcast.');
    return;
  }

  if (['dual', 'start-dual', 'obs-dual'].includes(cliAction)) {
    console.log('Starting OBS Dual (YouTube RTMP + HLS) in background...');
    const result = await startBackground('dual');
    console.log(`Running. Log: ${result.log}`);
    console.log(`Dual broadcast live: YouTube RTMP & HLS (${result.status.hls?.url})`);
    console.log('Use Start forecast when ready. Closing this terminal will not stop the broadcast.');
    return;
  }

  if (!process.stdin.isTTY) {
    console.log('Run npm run launcher in an interactive terminal. Commands:');
    for (const [, label] of commands) console.log(`  ${label}`);
    return;
  }
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const node = args => run(process.execPath, args);
  const ask = prompt => input.question(prompt);
  let done = false;
  input.on('close', () => { done = true; });
  input.on('SIGINT', () => { done = true; input.close(); });
  try {
    while (!done) {
      const currentEncoding = getEncodingPreset(__dirname);
      console.log(`\nIntelliSTAR Control [Encoding: ${formatEncodingText(currentEncoding)}]\n`);
      for (const [key, label, act] of commands) {
        if (act === 'encoding' || key === '22' || key === '20') {
          console.log(` ${key.padStart(2)}  ${label} [Current: ${currentEncoding.resolution} @ ${currentEncoding.fps}fps]`);
        } else {
          console.log(` ${key.padStart(2)}  ${label}`);
        }
      }
      const choice = await ask('\nCommand: ');
      const action = commands.find(([key]) => key === choice.trim())?.[2];
      try {
        if (action === 'exit') break;
        if (['ndi', 'hls', 'youtube', 'dual'].includes(action)) {
          console.log(`Starting OBS ${action.toUpperCase()} in background...`);
          const result = await startBackground(action);
          console.log(`Running. Log: ${result.log}`);
          if (action === 'hls') console.log(result.status.hls?.url);
          else if (action === 'youtube') console.log('YouTube RTMP: Streaming live to rtmp://a.rtmp.youtube.com/live2');
          else if (action === 'dual') console.log(`Dual output: YouTube RTMP (rtmp://a.rtmp.youtube.com/live2) + HLS (${result.status.hls?.url})`);
          else console.log('NDI: confirm output on your receiver.');
          console.log('Use Start forecast when ready. Closing this menu or SSH will not stop the broadcast.');
        } else if (['stop', 'status'].includes(action)) await node(['start-obs.js', action]);
        else if (action?.startsWith('forecast-')) await node(['forecast.js', action.slice('forecast-'.length)]);
        else if (action === 'message') {
          const message = await ask('Message (blank cancels): ');
          if (message.trim()) await node(['message.js', message]);
        } else if (action === 'alert') {
          const alert = (await ask('Alert type: tornado / severe / winter / quebec / all / clear (blank cancels): ')).trim();
          if (alert) await node(['alert.js', alert]);
        } else if (action === 'refresh') await node(['refresh.js']);
        else if (action === 'editor') {
          const url = `http://127.0.0.1:${obsOptions().port}/editor.html`;
          console.log(`Editor: ${url} (for a remote browser, replace 127.0.0.1 with the Deck address).`);
          await run('xdg-open', [url], resolveDesktopEnvironment());
        } else if (action === 'vlc') {
          const active = await controlRequest(obsOptions().socketPath, 'status', __dirname);
          if (!active?.hls?.url) throw new Error('Start an HLS broadcast first. NDI is not directly playable in VLC.');
          await run(process.execPath, ['vlc.js', active.hls.url], resolveDesktopEnvironment());
        }
        else if (action === 'setup') await node(['start-obs.js', 'setup-hls']);
        else if (action === 'setup-youtube') await node(['start-obs.js', 'setup-youtube']);
        else if (action === 'check') {
          const output = (await ask('Output: hls, ndi or youtube [hls]: ')).trim() || 'hls';
          if (!['ndi', 'hls', 'youtube'].includes(output)) throw new Error('Choose hls, ndi or youtube.');
          await node(['start-obs.js', 'check', output]);
        } else if (action === 'logs') console.log(tailLog(logPath()));
        else if (action === 'pc-stats') console.log(formatStatsText());
        else if (action === 'encoding') {
          const current = getEncodingPreset(__dirname);
          console.log(`\nCurrent Encoding: ${formatEncodingText(current)}`);
          console.log('\nSelect Resolution Preset:');
          console.log('  1  720p   (1280x720  - HD, lower APU/CPU load)');
          console.log('  2  1080p  (1920x1080 - Full HD standard)');
          console.log('  3  4k     (3840x2160 - 4K Ultra HD)');
          const resInput = (await ask(`Resolution [1-3 / name, Enter keeps ${current.resolution}]: `)).trim();

          console.log('\nSelect Frame Rate (FPS):');
          console.log('  1  24 fps (Cinematic, lowest CPU load)');
          console.log('  2  30 fps (Broadcast standard, balanced)');
          console.log('  3  60 fps (Smooth motion)');
          const fpsInput = (await ask(`Frame Rate [1-3 / value, Enter keeps ${current.fps} fps]: `)).trim();

          const newRes = resInput ? resInput : current.resolution;
          const newFps = fpsInput ? fpsInput : current.fps;

          const result = setEncodingPreset({ resolution: newRes, fps: newFps }, __dirname);
          console.log(`\nEncoding preset set to: ${formatEncodingText(result)}.`);
          console.log(`Updated files: ${result.filesUpdated.length} OBS config(s) and encoding-preset.json.`);

          const active = await controlRequest(obsOptions().socketPath, 'status', __dirname).catch(() => null);
          if (active?.phase === 'running') {
            console.log('\n[NOTICE] An OBS broadcast is currently active. The new encoding settings will take effect on the next broadcast start. (Use "Stop OBS broadcast" and then start again to apply.)');
          } else {
            console.log('\nReady! The next broadcast will launch with this encoding preset.');
          }
        } else if (action === 'sleep-monitors') {
          const res = sleepMonitors();
          if (res.success) {
            console.log(`\nAll monitors put to sleep via ${res.method}.\nTap screen, trackpad, or press any key to wake.`);
          } else {
            console.error(`\nFailed to sleep monitors: ${res.error}`);
          }
        } else if (action === 'ui') {
          console.log('Starting Touch Screen UI Launcher (port 7080)...');
          await run(process.execPath, ['launcher-ui.js'], resolveDesktopEnvironment());
        } else if (action === 'other') {
          const scripts = Object.keys(require('./package.json').scripts).filter(name => name !== 'launcher');
          scripts.forEach((name, index) => console.log(` ${index + 1}  ${name}`));
          const selected = Number(await ask('Command number (blank cancels): '));
          if (Number.isInteger(selected) && selected > 0 && selected <= scripts.length) {
            console.log(`Running npm run ${scripts[selected - 1]} in foreground. Legacy stop commands may stop other app processes.`);
            input.pause();
            try { await run('npm', ['run', scripts[selected - 1]]); } finally { input.resume(); }
          }
        } else console.log('Choose a command number from the menu.');
      } catch (error) { console.error(error.message); }
      if (!done) await ask('\nEnter to return to menu...');
    }
  } finally { input.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {
  commands,
  logPath,
  tailLog,
  startBackground,
  getSystemStats,
  formatStatsText,
  getEncodingPreset,
  setEncodingPreset,
  formatEncodingText,
  normalizeResolution,
  normalizeFps,
  RESOLUTIONS,
  FRAME_RATES,
  syncActiveIcons,
  getIconStatus,
  sleepMonitors,
  wakeMonitors,
  getDisplayStatus,
  YOUTUBE_STREAM_KEY,
  syncYouTubeProfile,
};