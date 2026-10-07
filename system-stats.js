'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let prevCpuTimes = null;

/**
 * Get raw CPU ticks from /proc/stat (Linux) or os.cpus() (fallback).
 */
function getCpuTimes() {
  try {
    const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);
    return { idle, total };
  } catch {
    const cpus = os.cpus() || [];
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      for (const t of Object.values(cpu.times)) total += t;
    }
    return { idle, total };
  }
}

/**
 * Compute CPU usage percentage (0-100) based on delta since last call.
 */
function getCpuUsage() {
  const current = getCpuTimes();
  if (!prevCpuTimes) {
    prevCpuTimes = current;
    return 0;
  }
  const idleDelta = current.idle - prevCpuTimes.idle;
  const totalDelta = current.total - prevCpuTimes.total;
  prevCpuTimes = current;

  if (totalDelta <= 0) return 0;
  const pct = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  return Math.round(pct * 10) / 10;
}

/**
 * Get CPU temperature in Celsius and Fahrenheit.
 * Probes Linux hwmon (k10temp, coretemp, etc.) and /sys/class/thermal.
 */
function getCpuTemp() {
  try {
    if (fs.existsSync('/sys/class/hwmon')) {
      const hwmonDirs = fs.readdirSync('/sys/class/hwmon');
      let fallbackTemp = null;

      for (const dir of hwmonDirs) {
        const fullDir = path.join('/sys/class/hwmon', dir);
        try {
          const name = fs.readFileSync(path.join(fullDir, 'name'), 'utf8').trim().toLowerCase();
          const files = fs.readdirSync(fullDir);
          const inputs = files.filter(f => /^temp\d+_input$/.test(f));

          for (const input of inputs) {
            const raw = fs.readFileSync(path.join(fullDir, input), 'utf8').trim();
            const val = parseInt(raw, 10);
            if (!isNaN(val) && val > 0) {
              const deg = val > 1000 ? val / 1000 : val;
              if (['k10temp', 'coretemp', 'zenpower', 'cpu_thermal'].includes(name)) {
                const c = Math.round(deg);
                return { celsius: c, fahrenheit: Math.round((c * 9) / 5 + 32), source: name };
              }
              if (fallbackTemp === null) fallbackTemp = deg;
            }
          }
        } catch {}
      }

      if (fallbackTemp !== null) {
        const c = Math.round(fallbackTemp);
        return { celsius: c, fahrenheit: Math.round((c * 9) / 5 + 32), source: 'hwmon-fallback' };
      }
    }
  } catch {}

  try {
    if (fs.existsSync('/sys/class/thermal')) {
      const zones = fs.readdirSync('/sys/class/thermal');
      for (const zone of zones) {
        const tempFile = path.join('/sys/class/thermal', zone, 'temp');
        if (fs.existsSync(tempFile)) {
          const val = parseInt(fs.readFileSync(tempFile, 'utf8').trim(), 10);
          if (!isNaN(val) && val > 0) {
            const deg = val > 1000 ? val / 1000 : val;
            const c = Math.round(deg);
            return { celsius: c, fahrenheit: Math.round((c * 9) / 5 + 32), source: zone };
          }
        }
      }
    }
  } catch {}

  return null;
}

/**
 * Get GPU usage percentage (0-100).
 * Probes AMD / Intel DRM sysfs (gpu_busy_percent).
 */
function getGpuUsage() {
  try {
    if (fs.existsSync('/sys/class/drm')) {
      const drmDirs = fs.readdirSync('/sys/class/drm');
      for (const dir of drmDirs) {
        const busyFile = path.join('/sys/class/drm', dir, 'device', 'gpu_busy_percent');
        if (fs.existsSync(busyFile)) {
          const val = parseInt(fs.readFileSync(busyFile, 'utf8').trim(), 10);
          if (!isNaN(val) && val >= 0 && val <= 100) {
            return val;
          }
        }
      }
    }
  } catch {}
  return 0;
}

/**
 * Get RAM usage metrics (used, available, total, percentage).
 * Parses Linux /proc/meminfo to include cache/buffers in available memory.
 */
function getRamStats() {
  let total = os.totalmem() || 0;
  let available = os.freemem() || 0;

  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    let t = 0;
    let a = 0;
    for (const line of meminfo.split('\n')) {
      if (line.startsWith('MemTotal:')) t = parseInt(line.split(/\s+/)[1], 10);
      else if (line.startsWith('MemAvailable:')) a = parseInt(line.split(/\s+/)[1], 10);
    }
    if (t && a) {
      total = t * 1024;
      available = a * 1024;
    }
  } catch {}

  const used = Math.max(0, total - available);
  const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  return {
    totalBytes: total,
    usedBytes: used,
    availableBytes: available,
    usagePercent: percent,
    usedGb: (used / (1024 ** 3)).toFixed(1),
    totalGb: (total / (1024 ** 3)).toFixed(1),
  };
}

/**
 * Get disk usage for the given directory (defaults to application root).
 */
function getDiskStats(targetPath = __dirname) {
  try {
    const s = fs.statfsSync(targetPath);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = Math.max(0, total - free);
    const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
    return {
      path: targetPath,
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      usagePercent: percent,
      usedGb: (used / (1024 ** 3)).toFixed(1),
      totalGb: (total / (1024 ** 3)).toFixed(1),
      freeGb: (free / (1024 ** 3)).toFixed(1),
    };
  } catch {
    return {
      path: targetPath,
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      usagePercent: 0,
      usedGb: '0.0',
      totalGb: '0.0',
      freeGb: '0.0',
    };
  }
}

/**
 * Get combined system stats payload.
 */
function getSystemStats(targetDiskPath = __dirname) {
  const cpuUsage = getCpuUsage();
  const cpuTemp = getCpuTemp();
  const gpuUsage = getGpuUsage();
  const ram = getRamStats();
  const disk = getDiskStats(targetDiskPath);

  return {
    cpu: {
      usage: cpuUsage,
      temp: cpuTemp,
    },
    gpu: {
      usage: gpuUsage,
    },
    ram,
    disk,
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
  };
}

/**
 * Format PC stats as human-readable text for terminal display.
 */
function formatStatsText(stats = getSystemStats()) {
  const lines = [
    '========================================',
    `  PC SYSTEM STATS (${stats.hostname || 'Host'})`,
    '========================================',
    `  CPU USAGE : ${stats.cpu.usage.toFixed(1)}%`,
    `  CPU TEMP  : ${stats.cpu.temp ? `${stats.cpu.temp.celsius}°C / ${stats.cpu.temp.fahrenheit}°F` : 'N/A'}`,
    `  GPU USAGE : ${stats.gpu.usage}%`,
    `  RAM       : ${stats.ram.usedGb} GB / ${stats.ram.totalGb} GB (${stats.ram.usagePercent}%)`,
    `  DISK      : ${stats.disk.usedGb} GB / ${stats.disk.totalGb} GB (${stats.disk.usagePercent}%)`,
    '========================================',
  ];
  return lines.join('\n');
}

// Prime the initial CPU counter
getCpuUsage();

module.exports = {
  getCpuTimes,
  getCpuUsage,
  getCpuTemp,
  getGpuUsage,
  getRamStats,
  getDiskStats,
  getSystemStats,
  formatStatsText,
};

