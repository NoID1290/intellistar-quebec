'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const ini = require('ini');
const { randomUUID } = require('node:crypto');
const { hlsOptions, hlsArgs, hlsReady, requireFreePort } = require('./stream-hls');
const { validateHlsProfile, validateYouTubeProfile, ensureYouTubeProfile, getResolvedStreamKey, YOUTUBE_DEFAULT_SERVER } = require('./obs-hls-profile');

const OBS_APP = 'com.obsproject.Studio';

function obsOptions(env = process.env) {
  const output = env.OBS_OUTPUT || 'ndi';
  if (!['ndi', 'hls', 'youtube', 'dual'].includes(output)) throw new Error('OBS_OUTPUT must be ndi, hls, youtube or dual.');
  const port = Number(env.PORT || 7070);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const installation = env.OBS_INSTALLATION || 'auto';
  if (!['auto', 'native', 'flatpak'].includes(installation)) {
    throw new Error('OBS_INSTALLATION must be auto, native or flatpak.');
  }
  const names = {};
  for (const key of ['PROFILE', 'COLLECTION', 'SCENE']) {
    const value = env[`OBS_${key}`] ?? (
      key === 'PROFILE' && (output === 'hls' || output === 'dual') ? 'IntelliSTAR HLS' :
      key === 'PROFILE' && output === 'youtube' ? (env.OBS_YOUTUBE_PROFILE || 'IntelliSTAR YouTube') :
      'IntelliSTAR'
    );
    if (!value.trim() || value !== value.trim() || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) {
      throw new Error(`OBS_${key} must be a nonempty name without control characters (maximum 100 characters).`);
    }
    names[key.toLowerCase()] = value;
  }
  const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
  return { ...names, port, installation, output, url: `http://127.0.0.1:${port}/?iptv`,
    socketPath: path.join(runtimeDir, 'intellistar-obs', 'control.sock') };
}

function selectInstallation(requested, { native, flatpak }) {
  if (requested === 'auto') {
    if (native && flatpak) throw new Error('Both OBS installations exist; select OBS_INSTALLATION=native or flatpak.');
    if (native) return 'native';
    if (flatpak) return 'flatpak';
  } else if ((requested === 'native' && native) || (requested === 'flatpak' && flatpak)) return requested;
  throw new Error(`OBS installation unavailable (${requested}). Install OBS with Browser Source and DistroAV first.`);
}

function obsCommand(options, installation) {
  const args = ['--profile', options.profile, '--collection', options.collection,
    '--scene', options.scene, '--minimize-to-tray'];
  if (options.output === 'hls' || options.output === 'youtube' || options.output === 'dual') args.push('--startstreaming');
  return installation === 'flatpak'
    ? { command: 'flatpak', args: ['run', '--die-with-parent', '--instance-id-fd=3', OBS_APP, ...args] }
    : { command: 'obs', args };
}

function requireDesktop(env = process.env) {
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
    throw new Error('OBS needs your logged-in desktop session. Run from its terminal, or export its actual DISPLAY/WAYLAND_DISPLAY and session environment over SSH.');
  }
}

const desktopEnvironmentKeys = ['DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR',
  'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY', 'XDG_SESSION_TYPE'];

function desktopEnvironments(procRoot = '/proc', uid = process.getuid()) {
  const environments = [];
  for (const entry of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const directory = path.join(procRoot, entry);
      if (fs.statSync(directory).uid !== uid) continue;
      const name = fs.readFileSync(path.join(directory, 'comm'), 'utf8').trim();
      if (!['plasmashell', 'gnome-shell', 'xfce4-session', 'cinnamon', 'mate-session'].includes(name)) continue;
      const environment = {};
      for (const item of fs.readFileSync(path.join(directory, 'environ'), 'utf8').split('\0')) {
        const separator = item.indexOf('=');
        const key = item.slice(0, separator);
        if (separator > 0 && desktopEnvironmentKeys.includes(key)) environment[key] = item.slice(separator + 1);
      }
      environments.push(environment);
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) throw error;
    }
  }
  return environments;
}

function desktopAvailable(env, uid = process.getuid()) {
  try {
    if (!path.isAbsolute(env.XDG_RUNTIME_DIR || '')) return false;
    const runtime = fs.lstatSync(env.XDG_RUNTIME_DIR);
    if (!runtime.isDirectory() || runtime.uid !== uid) return false;
    if (env.WAYLAND_DISPLAY) {
      const socketPath = path.resolve(env.XDG_RUNTIME_DIR, env.WAYLAND_DISPLAY);
      const socket = fs.lstatSync(socketPath);
      return path.dirname(socketPath) === env.XDG_RUNTIME_DIR && socket.isSocket() && socket.uid === uid;
    }
    const display = /^:(\d+)(?:\.\d+)?$/.exec(env.DISPLAY || '');
    return Boolean(display && fs.lstatSync(`/tmp/.X11-unix/X${display[1]}`).isSocket());
  } catch { return false; }
}

function resolveDesktopEnvironment(env = process.env, { discover = desktopEnvironments, available = desktopAvailable } = {}) {
  if (env.DISPLAY || env.WAYLAND_DISPLAY) return { ...env };
  const sessions = new Map();
  for (const candidate of discover()) {
    if (!available(candidate)) continue;
    if (env.XDG_RUNTIME_DIR && env.XDG_RUNTIME_DIR !== candidate.XDG_RUNTIME_DIR) continue;
    const key = JSON.stringify([candidate.XDG_RUNTIME_DIR, candidate.WAYLAND_DISPLAY, candidate.DISPLAY]);
    sessions.set(key, candidate);
  }
  if (sessions.size > 1) throw new Error('Multiple desktop sessions found. Export the intended DISPLAY/WAYLAND_DISPLAY and session environment explicitly.');
  if (!sessions.size) {
    throw new Error('OBS needs your logged-in desktop session. No accessible desktop was found for this user; log into Desktop Mode or export its actual DISPLAY/WAYLAND_DISPLAY and session environment over SSH.');
  }
  const resolved = { ...env };
  const desktop = sessions.values().next().value;
  for (const key of desktopEnvironmentKeys) {
    delete resolved[key];
    if (desktop[key]) resolved[key] = desktop[key];
  }
  return resolved;
}

const probeOptions = { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 };

function detectInstallation(options, run = spawnSync) {
  return selectInstallation(options.installation, {
    native: run('obs', ['--version'], probeOptions).status === 0,
    flatpak: run('flatpak', ['info', OBS_APP], probeOptions).status === 0,
  });
}

function obsConfigDirectory(installation, env = process.env) {
  const home = env.HOME || os.homedir();
  return installation === 'flatpak'
    ? path.join(home, '.var', 'app', OBS_APP, 'config', 'obs-studio')
    : path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obs-studio');
}

function validateSavedSetup(options, profiles, collections) {
  if (!profiles.some(profile => profile.General?.Name === options.profile)) {
    throw new Error(`Create the OBS profile "${options.profile}" first. See OBS_SETUP.md.`);
  }
  const collection = collections.find(item => item.name === options.collection);
  const scene = collection?.sources?.find(source => source.id === 'scene' && source.name === options.scene);
  if (!scene) throw new Error(`Create scene "${options.scene}" in collection "${options.collection}" first. See OBS_SETUP.md.`);
  const visited = new Set();
  const hasBrowser = source => {
    if (!source || visited.has(source)) return false;
    visited.add(source);
    if (source.id === 'browser_source') {
      try {
        const url = new URL(source.settings?.url);
        const expected = new URL(options.url);
        return ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === expected.protocol &&
          url.port === expected.port && !url.username && !url.password && url.pathname === '/' &&
          url.searchParams.has('iptv') && !source.settings.is_local_file;
      } catch { return false; }
    }
    return (source.settings?.items || []).some(item => item.visible !== false && hasBrowser(
      collection.sources.find(candidate => item.source_uuid ? candidate.uuid === item.source_uuid : candidate.name === item.name)));
  };
  if (!hasBrowser(scene)) throw new Error(`Scene "${options.scene}" needs a visible Browser Source for ${options.url}. See OBS_SETUP.md.`);
}

function readSavedSetup(options, installation, env = process.env) {
  const root = obsConfigDirectory(installation, env);
  const entries = directory => fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  const profilesDir = path.join(root, 'basic', 'profiles');
  const scenesDir = path.join(root, 'basic', 'scenes');
  const profiles = entries(profilesDir).filter(entry => entry.isDirectory()).map(entry => {
    const file = path.join(profilesDir, entry.name, 'basic.ini');
    return fs.existsSync(file) ? ini.parse(fs.readFileSync(file, 'utf8')) : {};
  });
  const collections = entries(scenesDir).filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => JSON.parse(fs.readFileSync(path.join(scenesDir, entry.name), 'utf8')));
  validateSavedSetup(options, profiles, collections);
  return root;
}

function archiveShutdownMarkers(root) {
  if (runningCaptureProcesses().length) throw new Error('OBS started during preflight; refusing to change recovery markers.');
  const directory = path.join(root, '.sentinel');
  if (!fs.existsSync(directory)) return null;
  const markers = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^run_[a-f0-9-]+$/i.test(entry.name));
  if (!markers.length) return null;
  const archive = path.join(root, 'intellistar-recovery', randomUUID());
  fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
  for (const marker of markers) fs.renameSync(path.join(directory, marker.name), path.join(archive, marker.name));
  return archive;
}

function runningCaptureProcesses(procRoot = '/proc') {
  const found = [];
  for (const entry of fs.readdirSync(procRoot)) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    try {
      const directory = path.join(procRoot, entry);
      if (fs.statSync(directory).uid !== process.getuid()) continue;
      const args = fs.readFileSync(path.join(directory, 'cmdline'), 'utf8').split('\0').filter(Boolean);
      const command = path.basename(args[0] || '');
      if (['obs', 'obs-studio'].includes(command) ||
          (['node', 'nodejs'].includes(command) && args.slice(1).some(arg => path.basename(arg) === 'start-iptv.js'))) {
        found.push({ pid: Number(entry), command });
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) throw error;
    }
  }
  return found;
}

function preflight(options, env = process.env) {
  if (process.platform !== 'linux') throw new Error('The OBS launcher currently supports Linux desktop sessions only.');
  env = resolveDesktopEnvironment(env);
  requireDesktop(env);
  if (env.WAYLAND_DISPLAY) {
    const socket = path.isAbsolute(env.WAYLAND_DISPLAY) ? env.WAYLAND_DISPLAY : path.join(env.XDG_RUNTIME_DIR || '', env.WAYLAND_DISPLAY);
    if (!fs.existsSync(socket) && !env.DISPLAY) throw new Error(`Wayland socket unavailable: ${socket}`);
  }
  const running = runningCaptureProcesses();
  if (running.length) throw new Error(`OBS or legacy capture is already running (PID ${running.map(item => item.pid).join(', ')}). Close it yourself before starting this backend.`);
  const installation = detectInstallation(options);
  if (options.output === 'ndi' && installation === 'flatpak' && spawnSync('flatpak', ['info', `${OBS_APP}.Plugin.DistroAV`], probeOptions).status !== 0) {
    throw new Error('DistroAV Flatpak plugin is missing. Install the compatible plugin and complete OBS_SETUP.md first.');
  }
  if (options.output === 'youtube') {
    const root = obsConfigDirectory(installation, env);
    ensureYouTubeProfile(root, options.profile, env);
  }
  const configDirectory = readSavedSetup(options, installation, env);
  let hls = null;
  if (options.output === 'hls' || options.output === 'dual') {
    let extra = {};
    if (options.output === 'dual') {
      const streamKey = getResolvedStreamKey(env);
      const server = env.YOUTUBE_RTMP_URL || YOUTUBE_DEFAULT_SERVER;
      extra.youtubeRtmpUrl = `${server.replace(/\/+$/, '')}/${streamKey}`;
    }
    hls = hlsOptions(env, undefined, extra);
    validateHlsProfile(configDirectory, options.profile, hls);
    if (spawnSync(hls.ffmpegPath, ['-version'], probeOptions).status !== 0) throw new Error('FFmpeg is required to package OBS output as HLS.');
  }
  if (options.output === 'youtube') {
    validateYouTubeProfile(configDirectory, options.profile);
  }
  return { installation, configDirectory, env, hls };
}

function probeApp(port, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/health', agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 4096) request.destroy(new Error(`Port ${port} is not an IntelliSTAR health endpoint.`));
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (response.statusCode !== 200 || data.service !== 'intellistar' || data.version !== 1) throw new Error('Unexpected health response');
          resolve(true);
        } catch {
          reject(new Error(`Port ${port} is occupied by an unrecognized server. Stop it yourself or choose PORT; older IntelliSTAR servers need restarting.`));
        }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error(`Timed out checking port ${port}.`)), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', error => error.code === 'ECONNREFUSED' ? resolve(false) : reject(error));
  });
}

function childAlive(child) {
  return Boolean(child?.pid && child.exitCode === null && !child.signalCode);
}

function stopChild(child, { timeout = 3000, force = () => {} } = {}) {
  if (!childAlive(child)) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); child.removeListener('exit', finish); resolve(); };
    const timer = setTimeout(() => {
      try { force(); } catch {}
      try { child.kill('SIGKILL'); } catch {}
      finish();
    }, timeout);
    child.once('exit', finish);
    try { child.kill('SIGINT'); } catch { finish(); }
  });
}

function createBackend(options, overrides = {}) {
  const dependencies = { spawn, probeApp, stopChild, preflight,
    archiveShutdownMarkers,
    hlsReady, requireFreePort, hlsTimeout: 45000,
    verifyHls: async (port, playlistName, session) => {
      const response = await fetch(`http://127.0.0.1:${port}/stream/${playlistName}`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok || !(await response.text()).includes(`obs-${session}-`)) {
        throw new Error('Web server is serving a different HLS directory. Restart the app with the same HLS settings.');
      }
    },
    delay: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    now: Date.now, log: () => {}, onExit: () => {},
    killFlatpak: instance => spawnSync('flatpak', ['kill', instance], probeOptions),
    startupTimeout: 15000, obsGraceTime: 2000, env: process.env, ...overrides };
  let phase = 'idle';
  let failure = null;
  let appChild = null;
  let obsChild = null;
  let hlsChild = null;
  let hls = null;
  const session = randomUUID();
  let installation = null;
  let flatpakInstance = '';
  let stopping = null;
  const status = () => ({ phase, error: failure, url: options.url, installation, output: options.output,
    app: { owned: Boolean(appChild), pid: appChild?.pid || null, processAlive: childAlive(appChild) },
    obs: { pid: obsChild?.pid || null, processAlive: childAlive(obsChild) },
    ndi: options.output === 'ndi' ? 'unverified: confirm output at the receiver' : 'plugin output is independent; disable it in OBS if not wanted',
    hls: hls ? { url: `http://127.0.0.1:${options.port}/stream/${hls.playlistName}`,
      processAlive: childAlive(hlsChild), ready: phase === 'running' && childAlive(hlsChild) && dependencies.hlsReady(hls, session) } : null,
    youtube: (options.output === 'youtube' || options.output === 'dual') ? { destination: 'rtmp://a.rtmp.youtube.com/live2',
      processAlive: childAlive(obsChild), ready: phase === 'running' && childAlive(obsChild) } : null });

  const stop = (error = null) => {
    if (stopping) return stopping;
    failure = error ? String(error.message || error) : failure;
    phase = 'stopping';
    stopping = (async () => {
      await dependencies.stopChild(obsChild);
      if (installation === 'flatpak' && /^\d+$/.test(flatpakInstance.trim())) dependencies.killFlatpak(flatpakInstance.trim());
      await dependencies.stopChild(hlsChild);
      await dependencies.stopChild(appChild);
      phase = failure ? 'failed' : 'stopped';
      dependencies.onExit(failure);
    })();
    return stopping;
  };

  const watch = (child, label) => {
    child.once('error', error => { void stop(new Error(`${label}: ${error.message}`)); });
    child.once('exit', (code, signal) => {
      if (!['stopping', 'stopped', 'failed'].includes(phase)) {
        void stop(new Error(`${label} exited (${signal || code}).`));
      }
    });
    return child;
  };
  const assertStarting = () => {
    if (phase !== 'starting') throw new Error(failure || 'OBS startup cancelled.');
  };

  const start = async () => {
    if (phase !== 'idle') throw new Error('This OBS backend has already been started or stopped.');
    phase = 'starting';
    try {
      const ready = dependencies.preflight(options, dependencies.env);
      installation = ready.installation;
      dependencies.env = ready.env || dependencies.env;
      if (ready.configDirectory) {
        const archive = dependencies.archiveShutdownMarkers(ready.configDirectory);
        if (archive) dependencies.log(`Archived stale OBS shutdown markers to ${archive}; crash logs were preserved.`);
      }
      hls = ready.hls || null;
      if (hls) {
        await dependencies.requireFreePort(hls.ingestPort);
        assertStarting();
        fs.mkdirSync(hls.directory, { recursive: true });
        hlsChild = watch(dependencies.spawn(hls.ffmpegPath, hlsArgs(hls, session), {
          cwd: __dirname, env: dependencies.env, stdio: ['ignore', 'inherit', 'inherit'],
        }), 'HLS packager');
      }
      const existing = await dependencies.probeApp(options.port);
      assertStarting();
      if (!existing) {
        appChild = watch(dependencies.spawn(process.execPath, [path.join(__dirname, 'app.js')], {
          cwd: __dirname, env: { ...dependencies.env, PORT: String(options.port), INTELLISTAR_IPTV_RUNNER: '1' }, stdio: 'inherit',
        }), 'IntelliSTAR server');
        const deadline = dependencies.now() + dependencies.startupTimeout;
        while (!(await dependencies.probeApp(options.port))) {
          assertStarting();
          if (dependencies.now() >= deadline) throw new Error('IntelliSTAR server startup timed out.');
          await dependencies.delay(100);
        }
      }
      assertStarting();
      const launch = obsCommand(options, installation);
      obsChild = watch(dependencies.spawn(launch.command, launch.args, {
        cwd: __dirname, env: dependencies.env, stdio: installation === 'flatpak' ? ['ignore', 'inherit', 'inherit', 'pipe'] : 'inherit',
      }), 'OBS');
      if (installation === 'flatpak') {
        obsChild.stdio[3].on('data', chunk => {
          if (flatpakInstance.length < 128) flatpakInstance += chunk.toString();
        });
        obsChild.stdio[3].on('error', error => { void stop(error); });
      }
      await dependencies.delay(dependencies.obsGraceTime);
      assertStarting();
      if (!childAlive(obsChild)) throw new Error('OBS did not remain running. Check its startup log.');
      if (hls) {
        const deadline = dependencies.now() + dependencies.hlsTimeout;
        while (!dependencies.hlsReady(hls, session)) {
          assertStarting();
          if (dependencies.now() >= deadline) throw new Error('OBS HLS startup timed out. Check OBS encoder, audio track and local RTMP profile settings.');
          await dependencies.delay(200);
        }
        await dependencies.verifyHls(options.port, hls.playlistName, session);
        assertStarting();
      }
      phase = 'running';
      const logMsg = options.output === 'dual'
        ? `OBS Dual streaming live: YouTube RTMP (rtmp://a.rtmp.youtube.com/live2) & HLS (http://127.0.0.1:${options.port}/stream/${hls.playlistName})`
        : (options.output === 'youtube'
          ? 'OBS YouTube RTMP streaming live: rtmp://a.rtmp.youtube.com/live2'
          : (hls ? `OBS HLS ready: http://127.0.0.1:${options.port}/stream/${hls.playlistName}` :
            `OBS process running; Browser Source: ${options.url}. NDI delivery is not verified.`));
      dependencies.log(logMsg);
      return status();
    } catch (error) {
      await stop(error);
      throw error;
    }
  };
  return { start, stop, status };
}

module.exports = { OBS_APP, obsOptions, selectInstallation, obsCommand, requireDesktop,
  desktopEnvironments, desktopAvailable, resolveDesktopEnvironment,
  detectInstallation, obsConfigDirectory, validateSavedSetup, readSavedSetup,
  archiveShutdownMarkers,
  runningCaptureProcesses, preflight, probeApp, childAlive, stopChild, createBackend };