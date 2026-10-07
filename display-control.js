'use strict';

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let resolveDesktopEnvironment;
try {
  ({ resolveDesktopEnvironment } = require('./stream-obs'));
} catch {
  resolveDesktopEnvironment = (env = process.env) => ({ ...env });
}

function getDrmOutputs() {
  const drmDir = '/sys/class/drm';
  const outputs = [];
  if (!fs.existsSync(drmDir)) return outputs;

  try {
    for (const entry of fs.readdirSync(drmDir)) {
      if (!entry.includes('-')) continue;
      const statusFile = path.join(drmDir, entry, 'status');
      const dpmsFile = path.join(drmDir, entry, 'dpms');
      const enabledFile = path.join(drmDir, entry, 'enabled');

      let connected = false;
      let dpms = 'unknown';
      let enabled = 'unknown';

      try { connected = fs.readFileSync(statusFile, 'utf8').trim() === 'connected'; } catch {}
      try { dpms = fs.readFileSync(dpmsFile, 'utf8').trim(); } catch {}
      try { enabled = fs.readFileSync(enabledFile, 'utf8').trim(); } catch {}

      if (connected) {
        outputs.push({
          name: entry.replace(/^card\d+-/, ''),
          card: entry,
          connected,
          dpms,
          enabled,
        });
      }
    }
  } catch {}
  return outputs;
}

function resolveEnvironment(env = process.env) {
  try {
    const desktop = resolveDesktopEnvironment(env);
    return {
      ...process.env,
      ...desktop,
      QT_QPA_PLATFORM: desktop.WAYLAND_DISPLAY ? 'wayland' : (desktop.DISPLAY ? 'xcb' : undefined),
    };
  } catch {
    return {
      ...process.env,
      ...env,
      QT_QPA_PLATFORM: env.WAYLAND_DISPLAY ? 'wayland' : (env.DISPLAY ? 'xcb' : undefined),
    };
  }
}

function sleepMonitors(env = process.env, options = {}) {
  const targetEnv = resolveEnvironment(env);
  const methodsTried = [];
  let success = false;
  let lastError = null;

  // Method 1: kscreen-doctor (KDE Plasma Wayland - SteamOS default)
  try {
    const kscreenBin = options.kscreenBin || 'kscreen-doctor';
    execSync(`${kscreenBin} --dpms off`, {
      env: targetEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout || 3000,
    });
    methodsTried.push('kscreen-doctor');
    success = true;
  } catch (err) {
    lastError = err.message;
  }

  // Method 2: xset dpms force off (X11 / Xwayland)
  if (!success && (targetEnv.DISPLAY || options.forceXset)) {
    try {
      const xsetBin = options.xsetBin || 'xset';
      execSync(`${xsetBin} dpms force off`, {
        env: targetEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 3000,
      });
      methodsTried.push('xset');
      success = true;
    } catch (err) {
      if (!lastError) lastError = err.message;
    }
  }

  // Method 3: wlopm (wlroots Wayland)
  if (!success) {
    try {
      execSync('wlopm --off \\*', {
        env: targetEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 2000,
      });
      methodsTried.push('wlopm');
      success = true;
    } catch {}
  }

  const outputs = getDrmOutputs();
  return {
    success,
    action: 'sleep',
    method: methodsTried.join(', ') || 'none',
    outputs,
    error: success ? null : (lastError || 'No supported display management tool found.'),
    timestamp: new Date().toISOString(),
  };
}

function wakeMonitors(env = process.env, options = {}) {
  const targetEnv = resolveEnvironment(env);
  const methodsTried = [];
  let success = false;
  let lastError = null;

  // Method 1: kscreen-doctor (KDE Plasma Wayland - SteamOS default)
  try {
    const kscreenBin = options.kscreenBin || 'kscreen-doctor';
    execSync(`${kscreenBin} --dpms on`, {
      env: targetEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout || 3000,
    });
    methodsTried.push('kscreen-doctor');
    success = true;
  } catch (err) {
    lastError = err.message;
  }

  // Method 2: xset dpms force on (X11 / Xwayland)
  if (!success && (targetEnv.DISPLAY || options.forceXset)) {
    try {
      const xsetBin = options.xsetBin || 'xset';
      execSync(`${xsetBin} dpms force on`, {
        env: targetEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 3000,
      });
      methodsTried.push('xset');
      success = true;
    } catch (err) {
      if (!lastError) lastError = err.message;
    }
  }

  // Method 3: wlopm (wlroots Wayland)
  if (!success) {
    try {
      execSync('wlopm --on \\*', {
        env: targetEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 2000,
      });
      methodsTried.push('wlopm');
      success = true;
    } catch {}
  }

  const outputs = getDrmOutputs();
  return {
    success,
    action: 'wake',
    method: methodsTried.join(', ') || 'none',
    outputs,
    error: success ? null : (lastError || 'No supported display management tool found.'),
    timestamp: new Date().toISOString(),
  };
}

function getDisplayStatus() {
  const outputs = getDrmOutputs();
  const connectedOutputs = outputs.filter(o => o.connected);
  const allAsleep = connectedOutputs.length > 0 && connectedOutputs.every(o => o.dpms.toLowerCase() === 'off' || o.enabled.toLowerCase() === 'disabled');

  return {
    outputs,
    connectedCount: connectedOutputs.length,
    allAsleep,
    summary: outputs.map(o => `${o.name} (DPMS: ${o.dpms}, ${o.enabled})`).join(', ') || 'No displays detected',
  };
}

if (require.main === module) {
  const arg = (process.argv[2] || 'sleep').toLowerCase();
  if (arg === 'wake' || arg === 'on') {
    const res = wakeMonitors();
    console.log(`[DisplayControl] Monitors woken up via ${res.method}.`);
  } else if (arg === 'status') {
    const status = getDisplayStatus();
    console.log(`[DisplayControl] Displays: ${status.summary} (All asleep: ${status.allAsleep})`);
  } else {
    const res = sleepMonitors();
    if (res.success) {
      console.log(`[DisplayControl] All monitors put to sleep via ${res.method}. (Tap screen or press any key to wake)`);
    } else {
      console.error(`[DisplayControl] Failed to sleep monitors: ${res.error}`);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  sleepMonitors,
  wakeMonitors,
  getDrmOutputs,
  getDisplayStatus,
  resolveEnvironment,
};
