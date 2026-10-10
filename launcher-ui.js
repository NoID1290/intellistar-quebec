#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, execSync } = require('node:child_process');
const express = require('express');
const compression = require('compression');

const { obsOptions, resolveDesktopEnvironment, probeApp } = require('./stream-obs');
const { controlRequest } = require('./obs-control');
const { startBackground, logPath, tailLog, getEncodingPreset, setEncodingPreset, formatEncodingText } = require('./launcher');
const { getSystemStats } = require('./system-stats');
const { sleepMonitors, wakeMonitors, getDisplayStatus } = require('./display-control');
const logger = require('./console-view');

const app = express();
const port = parseInt(process.env.LAUNCHER_PORT || '7080', 10);
const obsPort = parseInt(process.env.PORT || '7070', 10);

app.use(compression());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper: fetch JSON from local server
function fetchLocal(urlPath) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${obsPort}${urlPath}`, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Helper: run a node CLI script in app directory
function runNodeScript(scriptArgs, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, scriptArgs, { cwd: __dirname, env, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Script exited with code ${code || signal}`));
    });
  });
}

// Helper: get IPv4 LAN addresses
function getLanIps() {
  const ips = [];
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
  } catch (e) {}
  return ips;
}

// -----------------------------------------------------------------------------
// API Router
// -----------------------------------------------------------------------------
function createLauncherRouter(targetObsPort = obsPort) {
  const router = express.Router();

  // Comprehensive Status
  router.get('/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const options = obsOptions();
    let obs = null;
    try {
      obs = await controlRequest(options.socketPath, 'status', __dirname);
    } catch (e) {}

    let isAppAlive = false;
    try {
      isAppAlive = await probeApp(targetObsPort);
    } catch (e) {}

    const [forecast, alert, message] = await Promise.all([
      fetchLocal('/api/forecast'),
      fetchLocal('/api/alert'),
      fetchLocal('/api/message'),
    ]);

    let interpolation = true;
    try {
      const myCfgPath = path.join(__dirname, 'MYCONFIG.json');
      if (fs.existsSync(myCfgPath)) {
        const raw = JSON.parse(fs.readFileSync(myCfgPath, 'utf8'));
        if (raw.smoothRadar !== undefined) interpolation = !!raw.smoothRadar;
        else if (raw.appearanceSettings && raw.appearanceSettings.smoothRadar !== undefined) interpolation = !!raw.appearanceSettings.smoothRadar;
      }
    } catch (e) {}

    res.json({
      obs: obs || { phase: 'stopped', error: null, processAlive: false },
      app: { health: isAppAlive ? 'ready' : 'unavailable', port: targetObsPort },
      forecast: forecast || { state: 'idle' },
      alert: alert || { action: 'none' },
      message: message || { action: 'none' },
      system: getSystemStats(__dirname),
      encoding: getEncodingPreset(__dirname),
      interpolation,
      displays: getDisplayStatus(),
      ips: getLanIps(),
      launcherPort: port,
    });
  });

  // Action Dispatcher
  router.post('/action', async (req, res) => {
    const { action, output, text, type, duration, script, resolution, fps, enabled } = req.body || {};
    const options = obsOptions();

    try {
      switch (action) {
        case 'set-encoding': {
          const result = setEncodingPreset({ resolution, fps }, __dirname);
          return res.json({
            success: true,
            message: `Encoding set to ${formatEncodingText(result)}.`,
            encoding: result,
          });
        }

        case 'set-interpolation': {
          const isEnabled = enabled === true || enabled === 'true';
          const myCfgPath = path.join(__dirname, 'MYCONFIG.json');
          try {
            if (fs.existsSync(myCfgPath)) {
              const raw = JSON.parse(fs.readFileSync(myCfgPath, 'utf8'));
              raw.smoothRadar = isEnabled;
              if (raw.appearanceSettings) raw.appearanceSettings.smoothRadar = isEnabled;
              fs.writeFileSync(myCfgPath, JSON.stringify(raw, null, '\t'), 'utf8');
            }
          } catch (e) {}

          try {
            await fetchLocal(`/api/interpolation?enabled=${isEnabled}`);
          } catch (e) {}

          return res.json({
            success: true,
            message: `Radar/satellite interpolation ${isEnabled ? 'enabled' : 'disabled'}.`,
            interpolation: isEnabled,
          });
        }

        case 'close-instance': {
          try {
            await controlRequest(options.socketPath, 'stop', __dirname);
          } catch (e) {}
          try {
            execSync("pkill -f 'launcher\\.html' || true");
          } catch (e) {}
          res.json({ success: true, message: 'IntelliSTAR instance is closing completely...' });
          setTimeout(() => {
            console.log('Shutting down IntelliSTAR Touch UI instance completely...');
            if (process.env.NODE_ENV !== 'test') {
              process.exit(0);
            }
          }, 500);
          return;
        }

        case 'sleep-monitors': {
          const fn = options.sleepMonitors || (process.env.NODE_ENV === 'test' ? () => ({ success: true, action: 'sleep', method: 'test-stub', outputs: [] }) : sleepMonitors);
          const result = fn();
          return res.json({
            success: result.success,
            message: result.success
              ? 'All Steam Deck monitors put to sleep. Tap screen or press any key to wake.'
              : `Failed to sleep monitors: ${result.error}`,
            displays: result,
          });
        }

        case 'wake-monitors': {
          const fn = options.wakeMonitors || (process.env.NODE_ENV === 'test' ? () => ({ success: true, action: 'wake', method: 'test-stub', outputs: [] }) : wakeMonitors);
          const result = fn();
          return res.json({
            success: result.success,
            message: 'Steam Deck monitors woken up.',
            displays: result,
          });
        }

        case 'start-obs': {
          const selectedOutput = ['ndi', 'youtube', 'dual'].includes(output) ? output : 'hls';
          const result = await startBackground(selectedOutput);
          return res.json({
            success: true,
            message: `OBS ${selectedOutput.toUpperCase()} started in background.`,
            status: result.status,
          });
        }

        case 'stop-obs': {
          const response = await controlRequest(options.socketPath, 'stop', __dirname);
          if (!response) {
            return res.json({ success: true, message: 'Broadcast was not running.' });
          }
          return res.json({ success: true, message: 'Broadcast stop signal sent.' });
        }

        case 'forecast-start': {
          const resp = await fetchLocal('/api/forecast/start');
          return res.json({ success: true, message: resp?.message || 'Forecast presentation started.' });
        }

        case 'forecast-stop': {
          const resp = await fetchLocal('/api/forecast/stop');
          return res.json({ success: true, message: resp?.message || 'Returned to standby color bars.' });
        }

        case 'refresh': {
          const resp = await fetchLocal('/api/refresh?trigger=1');
          return res.json({ success: true, message: resp?.message || 'Frontend JavaScript hot-reloaded.' });
        }

        case 'alert': {
          let endpoint = '';
          const durParam = (Number(duration) > 0) ? `duration=${duration}` : '';
          if (req.body.action === 'quebec' || type === 'quebec') {
            endpoint = `/api/alert/quebec${durParam ? '?' + durParam : ''}`;
          } else if (req.body.action === 'all' || type === 'all') {
            endpoint = `/api/alert/all${durParam ? '?' + durParam : ''}`;
          } else {
            endpoint = `/api/alert/trigger?type=${encodeURIComponent(type || 'tornado')}${durParam ? '&' + durParam : ''}`;
          }
          const resp = await fetchLocal(endpoint);
          return res.json({ success: true, message: resp?.message || `Alert triggered: ${type}` });
        }

        case 'alert-clear': {
          const resp = await fetchLocal('/api/alert/clear');
          return res.json({ success: true, message: resp?.message || 'Alert test cleared.' });
        }

        case 'message': {
          if (!text) return res.status(400).json({ error: 'Message text is required' });
          const resp = await fetchLocal(`/api/message/send?text=${encodeURIComponent(text)}`);
          return res.json({ success: true, message: resp?.message || 'LDL crawl message sent.' });
        }

        case 'message-clear': {
          const resp = await fetchLocal('/api/message/clear');
          return res.json({ success: true, message: resp?.message || 'LDL crawl message cleared.' });
        }

        case 'open-editor': {
          const url = `http://127.0.0.1:${targetObsPort}/editor.html`;
          const desktop = resolveDesktopEnvironment();
          spawn('xdg-open', [url], { env: desktop, detached: true, stdio: 'ignore' }).unref();
          return res.json({ success: true, message: 'Studio editor opened.' });
        }

        case 'open-vlc': {
          const active = await controlRequest(options.socketPath, 'status', __dirname);
          if (!active?.hls?.url) {
            throw new Error('Start an HLS broadcast first. NDI is not directly playable in VLC.');
          }
          const desktop = resolveDesktopEnvironment();
          spawn(process.execPath, [path.join(__dirname, 'vlc.js'), active.hls.url], {
            env: desktop,
            detached: true,
            stdio: 'ignore',
          }).unref();
          return res.json({ success: true, message: 'VLC Player launched.' });
        }

        case 'setup-hls': {
          await runNodeScript([path.join(__dirname, 'start-obs.js'), 'setup-hls']);
          return res.json({ success: true, message: 'HLS profile created successfully.' });
        }

        case 'setup-youtube': {
          await runNodeScript([path.join(__dirname, 'start-obs.js'), 'setup-youtube']);
          return res.json({ success: true, message: 'YouTube profile created successfully.' });
        }

        case 'check-setup': {
          const checkOutput = ['ndi', 'youtube'].includes(output) ? output : 'hls';
          const { stdout } = await runNodeScript([path.join(__dirname, 'start-obs.js'), 'check', checkOutput]);
          return res.json({ success: true, message: stdout.trim() || 'OBS setup check passed.' });
        }

        case 'run-script': {
          if (!script) return res.status(400).json({ error: 'Script name is required' });
          const child = spawn('npm', ['run', script], { cwd: __dirname, detached: true, stdio: 'ignore' });
          child.unref();
          return res.json({ success: true, message: `Started npm run ${script} in background.` });
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Operation failed' });
    }
  });

  // Logs Endpoint
  router.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const file = logPath();
      if (!fs.existsSync(file)) return res.send('No broadcast log file found.');
      res.send(tailLog(file, 24000));
    } catch (e) {
      res.send(`Could not read log file: ${e.message}`);
    }
  });

  // Available scripts from package.json
  router.get('/scripts', (req, res) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
      const scripts = Object.keys(pkg.scripts || {}).filter(name => !['launcher', 'launcher:ui', 'ui'].includes(name));
      res.json({ scripts });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

app.use('/api/launcher', createLauncherRouter(obsPort));

// Root route redirect to launcher UI
app.get('/', (req, res) => {
  res.redirect('/launcher.html');
});

// Serve webroot static files (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'webroot')));

// -----------------------------------------------------------------------------
// Desktop App Window Launcher for Steam Deck
// -----------------------------------------------------------------------------
function launchTouchWindow(targetUrl) {
  try {
    let env = {};
    try {
      env = resolveDesktopEnvironment();
    } catch (e) {
      env = { ...process.env };
    }

    if (!env || (!env.DISPLAY && !env.WAYLAND_DISPLAY)) {
      env.WAYLAND_DISPLAY = process.env.WAYLAND_DISPLAY || 'wayland-0';
      env.DISPLAY = process.env.DISPLAY || ':0';
      env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid ? process.getuid() : 1000}`;
    }

    // Check if flatpak Google Chrome exists (common on Steam Deck)
    let hasChrome = false;
    try {
      execSync('flatpak info com.google.Chrome', { stdio: 'ignore', env });
      hasChrome = true;
    } catch (e) {}

    if (hasChrome) {
      // Launch Chrome in standalone web app mode with Steam Deck resolution
      const chrome = spawn('flatpak', [
        'run', 'com.google.Chrome',
        `--app=${targetUrl}`,
        '--window-size=1280,800',
        '--no-first-run',
        '--disable-default-apps',
      ], { env, detached: true, stdio: 'ignore' });
      chrome.unref();
      return;
    }

    // Check if flatpak Firefox exists
    let hasFirefox = false;
    try {
      execSync('flatpak info org.mozilla.firefox', { stdio: 'ignore', env });
      hasFirefox = true;
    } catch (e) {}

    if (hasFirefox) {
      const ff = spawn('flatpak', ['run', 'org.mozilla.firefox', '--new-window', targetUrl], {
        env, detached: true, stdio: 'ignore',
      });
      ff.unref();
      return;
    }

    // Default fallback
    spawn('xdg-open', [targetUrl], { env, detached: true, stdio: 'ignore' }).unref();
  } catch (e) {
    console.error('Could not launch touch window:', e.message);
  }
}

// Helper: Check if launcher service is already active on port
function checkIfRunning(checkPort) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${checkPort}/api/launcher/status`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// -----------------------------------------------------------------------------
// Start Server
// -----------------------------------------------------------------------------
async function startServer() {
  const url = `http://127.0.0.1:${port}/launcher.html`;
  const shouldOpen = !process.argv.includes('--no-open') && !process.argv.includes('--headless');

  // If launcher server is already running, simply focus/open the UI window!
  const alreadyRunning = await checkIfRunning(port);
  if (alreadyRunning) {
    console.log(`IntelliSTAR Touch UI Launcher is already active on port ${port}.`);
    if (shouldOpen) {
      console.log('Focusing UI window on Steam Deck...');
      launchTouchWindow(url);
    }
    return;
  }

  const server = app.listen(port, '0.0.0.0', () => {
    const ips = getLanIps();

    console.log('\n=================================================================');
    console.log('  INTELLISTAR TOUCH UI LAUNCHER');
    console.log('=================================================================');
    console.log(`  Local Steam Deck: ${url}`);
    if (ips.length) {
      console.log(`  Network (Mobile): http://${ips[0]}:${port}/launcher.html`);
    }
    console.log('=================================================================\n');

    if (shouldOpen) {
      setTimeout(() => launchTouchWindow(url), 400);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use. Opening UI window...`);
      if (shouldOpen) {
        launchTouchWindow(url);
      }
    } else {
      console.error(`Launcher server error: ${err.message}`);
      process.exit(1);
    }
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, launchTouchWindow, createLauncherRouter };
