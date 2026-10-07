// =============================================================================
// IntelliSTAR 1 — Professional Console & Broadcast Telemetry View
// Provides rich ANSI styling, visual hierarchy, browser log parsing,
// deduplication, and an optional dynamic TTY dashboard.
// =============================================================================

// Determine color support
const isColorSupported = (() => {
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '0') return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  if (process.platform === 'win32') return true;
  if (process.stdout && process.stdout.isTTY) return true;
  return false;
})();

// ANSI escape sequences with no-op fallback
const esc = (open, close) => isColorSupported
  ? (str) => `${open}${str}${close}`
  : (str) => `${str}`;

const c = {
  reset: esc('\x1b[0m', '\x1b[0m'),
  bold: esc('\x1b[1m', '\x1b[22m'),
  dim: esc('\x1b[2m', '\x1b[22m'),
  italic: esc('\x1b[3m', '\x1b[23m'),
  underline: esc('\x1b[4m', '\x1b[24m'),
  inverse: esc('\x1b[7m', '\x1b[27m'),
  black: esc('\x1b[30m', '\x1b[39m'),
  red: esc('\x1b[31m', '\x1b[39m'),
  green: esc('\x1b[32m', '\x1b[39m'),
  yellow: esc('\x1b[33m', '\x1b[39m'),
  blue: esc('\x1b[34m', '\x1b[39m'),
  magenta: esc('\x1b[35m', '\x1b[39m'),
  cyan: esc('\x1b[36m', '\x1b[39m'),
  white: esc('\x1b[37m', '\x1b[39m'),
  gray: esc('\x1b[90m', '\x1b[39m'),
  redBright: esc('\x1b[91m', '\x1b[39m'),
  greenBright: esc('\x1b[92m', '\x1b[39m'),
  yellowBright: esc('\x1b[93m', '\x1b[39m'),
  blueBright: esc('\x1b[94m', '\x1b[39m'),
  magentaBright: esc('\x1b[95m', '\x1b[39m'),
  cyanBright: esc('\x1b[96m', '\x1b[39m'),
  whiteBright: esc('\x1b[97m', '\x1b[39m'),
  bgBlue: esc('\x1b[44m', '\x1b[49m'),
  bgMagenta: esc('\x1b[45m', '\x1b[49m'),
  bgCyan: esc('\x1b[46m', '\x1b[49m'),
  bgYellow: esc('\x1b[43m', '\x1b[49m'),
  bgGreen: esc('\x1b[42m', '\x1b[49m'),
};

// Strip ANSI codes to measure exact visible string width
function stripAnsi(str) {
  return `${str}`.replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(str) {
  return stripAnsi(str).length;
}

function padEndVisible(str, targetLen) {
  const diff = targetLen - visibleLength(str);
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function padStartVisible(str, targetLen) {
  const diff = targetLen - visibleLength(str);
  return diff > 0 ? ' '.repeat(diff) + str : str;
}

function truncateVisible(str, maxLen) {
  if (visibleLength(str) <= maxLen) return str;
  let out = '';
  let i = 0;
  let visible = 0;
  while (i < str.length && visible < Math.max(0, maxLen - 1)) {
    const ch = str[i];
    if (ch === '\x1b') {
      const end = str.indexOf('m', i);
      if (end === -1) break;
      out += str.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    out += ch;
    visible += 1;
    i += 1;
  }
  return `${out}${c.dim('…')}`;
}

// Timestamp string: "14:40:15"
function getTimestamp() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return c.dim(`${h}:${m}:${s}`);
}

// Badge color definitions
const BADGE_COLORS = {
  SERVER: c.cyan,
  STREAM: c.magenta,
  BROWSER: c.blueBright,
  CAPTURE: c.cyanBright,
  AUDIO: c.green,
  CONFIG: c.yellow,
  STANDBY: c.yellowBright,
  WEATHER: c.blueBright,
  RADAR: c.magentaBright,
  READY: c.greenBright,
  FORECAST: c.cyanBright,
  ALERT: c.redBright,
  MESSAGE: c.magentaBright,
  REFRESH: c.cyan,
  FFMPEG: c.yellow,
  SYSTEM: c.white,
  WARN: c.yellowBright,
  ERROR: c.redBright,
  INFO: c.blueBright,
};

function formatBadge(name, colorFn) {
  const color = colorFn || BADGE_COLORS[name] || c.cyan;
  const paddedName = name.padEnd(8).slice(0, 8);
  return color(c.bold(`[${paddedName}]`));
}

const dashboard = {
  mode: 'lines',
  enabled: false,
  configured: false,
  refreshMs: 250,
  eventLimit: 10,
  ttyOnly: true,
  progressIntervalMs: 30000,
  lastRenderAt: 0,
  timer: null,
  renderedOnce: false,
  handlersInstalled: false,
};

const state = {
  startedAt: Date.now(),
  pipeline: {
    webServer: '-',
    streamOutput: '-',
    preset: '-',
    resolution: '-',
    fps: 30,
    encoder: '-',
    captureMode: '-',
    audioMode: '-',
    hardware: '-',
    videoBitrate: '-',
    x264Preset: '-',
  },
  capture: {
    status: 'idle',
    mode: 'puppeteer-stream',
    decoder: '-',
    frames: '0',
    avgFps: '-',
    repeatedPct: '-',
    chunks: 0,
    bytes: 0,
    throughput: '-',
  },
  ffmpeg: {
    status: 'idle',
    frame: '-',
    fps: '-',
    bitrate: '-',
    speed: '-',
    time: '-',
    target: '-',
    q: '-',
    drop: 0,
    dup: 0,
    size: '-',
  },
  audio: {
    mode: '-',
    playlist: '-',
    nowPlaying: '-',
  },
  forecastState: 'standby',
  lastWarn: '-',
  lastError: '-',
  events: [],
  spinnerIndex: 0,
};

function isInteractiveTerminal() {
  return !!(process.stdout && process.stdout.isTTY && process.env.TERM !== 'dumb');
}

function normalizeMode(mode) {
  const raw = `${mode || 'auto'}`.toLowerCase().trim();
  if (raw === 'dashboard') return 'dashboard';
  if (raw === 'lines' || raw === 'line') return 'lines';
  return 'auto';
}

function clearDashboardScreen() {
  if (!dashboard.enabled) return;
  process.stdout.write('\x1b[2J\x1b[H');
}

function restoreCursor() {
  if (!dashboard.enabled) return;
  process.stdout.write('\x1b[?25h');
}

function installDashboardCleanupHandlers() {
  if (dashboard.handlersInstalled) return;
  dashboard.handlersInstalled = true;
  process.once('exit', () => {
    restoreCursor();
    if (dashboard.renderedOnce) process.stdout.write('\n');
  });
}

function addEvent(level, category, text) {
  const clean = stripAnsi(`${text}`.trim());
  if (!clean) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  state.events.push({
    time: `${hh}:${mm}:${ss}`,
    level,
    category,
    text: clean,
  });
  if (state.events.length > dashboard.eventLimit) {
    state.events.splice(0, state.events.length - dashboard.eventLimit);
  }
}

function updateStateFromMessage(category, message) {
  const text = stripAnsi(`${message}`);

  if (category === 'BROWSER') {
    const targetMatch = text.match(/^Target URL:\s*(.*)$/i);
    if (targetMatch) state.pipeline.webServer = targetMatch[1];
  }

  if (category === 'STREAM') {
    const ffStart = text.match(/^Starting FFmpeg process \(([^,]+),\s*([^\)]+)\)\s*->\s*(.*)$/i);
    if (ffStart) {
      state.ffmpeg.status = 'running';
      state.ffmpeg.target = ffStart[3];
      state.pipeline.encoder = ffStart[2];
    }
    if (/FFmpeg exited with code/i.test(text)) state.ffmpeg.status = text;
  }

  if (category === 'CAPTURE') {
    if (/Live capture active/i.test(text)) state.capture.status = 'live';
    const decoderMatch = text.match(/^Tab decoder:\s*(.*)$/i);
    if (decoderMatch) state.capture.decoder = decoderMatch[1];
    const healthMatch = text.match(/^Health:\s*([\d,]+)\s*frames\s*\|\s*([\d.]+)\s*fps avg\s*\|\s*(\d+)%\s*repeated/i);
    if (healthMatch) {
      state.capture.frames = healthMatch[1];
      state.capture.avgFps = healthMatch[2];
      state.capture.repeatedPct = `${healthMatch[3]}%`;
    }
  }

  if (category === 'AUDIO') {
    const playlistMatch = text.match(/playlist synchronized \((\d+) tracks\)/i);
    if (playlistMatch) state.audio.playlist = playlistMatch[1];
    const loadedMatch = text.match(/Loaded\s*(\d+)\s*tracks/i);
    if (loadedMatch) state.audio.playlist = `${loadedMatch[1]} tracks`;
    const playingMatch = text.match(/^Now playing:\s*(.*)$/i);
    if (playingMatch) state.audio.nowPlaying = playingMatch[1];
  }

  if (category === 'FORECAST') {
    if (/started/i.test(text)) state.forecastState = 'running';
    if (/stopped/i.test(text)) state.forecastState = 'standby';
  }

  if (category === 'STANDBY') state.forecastState = 'standby';
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function colorFps(fpsStr, targetFps) {
  const fps = parseFloat(fpsStr);
  if (!Number.isFinite(fps)) return c.gray(`${fpsStr || '-'} fps`);
  const target = parseFloat(targetFps) || 30;
  if (fps >= target - 1.5) return c.greenBright(`${fpsStr} fps`);
  if (fps >= target - 5.5) return c.yellowBright(`${fpsStr} fps`);
  return c.redBright(`${fpsStr} fps`);
}

function colorSpeed(speedStr) {
  if (!speedStr) return c.gray('-');
  const val = parseFloat(speedStr);
  if (!Number.isFinite(val)) return c.yellow(speedStr);
  if (val >= 1.0) return c.greenBright(`${speedStr} (live)`);
  if (val >= 0.95) return c.yellowBright(`${speedStr} (near live)`);
  return c.redBright(`${speedStr} (lagging)`);
}

function colorBitrate(bitrateStr, targetBitrate) {
  if (bitrateStr && bitrateStr !== '-' && bitrateStr !== 'N/A' && bitrateStr !== '0.0kbits/s') {
    return c.magentaBright(bitrateStr);
  }
  if (targetBitrate && targetBitrate !== '-') {
    return c.magenta(`${targetBitrate} (target)`);
  }
  return c.gray('-');
}

function formatPresetPills(presetList, activeName) {
  const normActive = `${activeName || ''}`.toLowerCase().trim();
  return presetList.map((p) => {
    const isAct = p.toLowerCase() === normActive;
    if (isAct) {
      return c.bold(c.bgYellow(c.black(` ${p} `))) + c.yellowBright('★');
    }
    return c.dim(p);
  }).join('  ');
}

function parseFfmpegProgress(rawLine) {
  const frameMatch = rawLine.match(/frame=\s*(\d+)/);
  const fpsMatch = rawLine.match(/fps=\s*([\d.]+)/);
  const timeMatch = rawLine.match(/time=\s*([\d:.]+)/);
  const bitrateMatch = rawLine.match(/bitrate=\s*([^\s]+)/);
  const speedMatch = rawLine.match(/speed=\s*([\d.]+x)/);
  const qMatch = rawLine.match(/q=\s*([-\d.]+)/);
  const dropMatch = rawLine.match(/drop=\s*(\d+)/);
  const dupMatch = rawLine.match(/dup=\s*(\d+)/);
  const sizeMatch = rawLine.match(/(?:size|Lsize)=\s*([^\s]+)/);

  const rawBitrate = bitrateMatch ? bitrateMatch[1] : '';
  const cleanBitrate = (rawBitrate && rawBitrate !== 'N/A' && rawBitrate !== '0.0kbits/s') ? rawBitrate : '';

  return {
    frame: frameMatch ? Number(frameMatch[1]).toLocaleString() : '',
    fps: fpsMatch ? fpsMatch[1] : '',
    time: timeMatch ? timeMatch[1].split('.')[0] : '',
    bitrate: cleanBitrate,
    speed: speedMatch ? speedMatch[1] : '',
    q: qMatch ? qMatch[1] : '',
    drop: dropMatch ? parseInt(dropMatch[1], 10) : 0,
    dup: dupMatch ? parseInt(dupMatch[1], 10) : 0,
    size: sizeMatch ? sizeMatch[1] : '',
  };
}

function dashboardLine(label, value, width) {
  const lbl = c.dim(`${label}: `);
  const body = truncateVisible(`${value || c.gray('-')}`, Math.max(10, width - visibleLength(lbl) - 2));
  return `  ${lbl}${body}`;
}

function colorForecastState(value) {
  const normalized = `${value || ''}`.toLowerCase();
  if (normalized === 'running') return c.greenBright(`${value}`);
  if (normalized === 'standby') return c.yellowBright(`${value}`);
  return c.cyan(`${value || '-'}`);
}

function colorFfmpegStatus(value) {
  const text = `${value || '-'}`;
  if (/exited with code\s+0/i.test(text)) return c.greenBright(text);
  if (/exited with code\s+[1-9]/i.test(text)) return c.redBright(text);
  if (/running/i.test(text)) return c.magentaBright(text);
  return c.cyan(text);
}

function colorRepeatPct(value) {
  const pct = parseInt(`${value || '0'}`.replace('%', ''), 10);
  if (Number.isNaN(pct)) return c.gray(`${value || '-'}`);
  if (pct >= 30) return c.redBright(`${pct}%`);
  if (pct >= 15) return c.yellowBright(`${pct}%`);
  return c.greenBright(`${pct}%`);
}

function renderDashboard() {
  if (!dashboard.enabled) return;

  const width = Math.max(80, (process.stdout && process.stdout.columns) || 100);
  const usable = width - 2;
  const uptimeSec = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  const uptime = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;
  const modeTag = c.bold(c.bgBlue(c.white(' DASHBOARD ')));

  const borderA = c.cyan;
  const borderB = c.blueBright;
  const borderC = c.magentaBright;
  const borderD = c.yellowBright;

  const deckList = ['deck-quality', 'deck-smooth', 'deck', 'deck-800p', 'deck-uhd', 'deck-uhd-smooth'];
  const stdList = ['1080p', '1080p-60fps', '720p', '720p-60fps', '1440p', '1440p-60fps', '4k', '4k-60fps', '480p'];
  const x264List = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

  const deckPills = formatPresetPills(deckList, state.pipeline.preset);
  const stdPills = formatPresetPills(stdList, state.pipeline.preset);
  const x264Pills = formatPresetPills(x264List, state.pipeline.x264Preset);

  const pipelinePreset = `${c.bold(c.yellowBright(state.pipeline.preset))} ${c.dim('(')}${c.white(state.pipeline.resolution)}${c.dim(' @ ')}${c.cyanBright(`${state.pipeline.fps}fps`)}${c.dim(', ')}${c.magentaBright(state.pipeline.videoBitrate || '-')}${c.dim(')')} ${c.greenBright('● ACTIVE')}`;
  const pipelineEncoder = `${c.magentaBright(state.pipeline.encoder)} ${c.dim('|')} ${c.white(state.pipeline.hardware)}`;
  const pipelineCapture = `${c.cyanBright(state.pipeline.captureMode)} ${c.dim('|')} ${c.blueBright('decoder:')} ${c.white(state.capture.decoder)}`;
  const pipelineAudio = `${c.greenBright(state.pipeline.audioMode)} ${c.dim('|')} ${c.green('playlist:')} ${c.white(state.audio.playlist)}`;

  state.spinnerIndex = (state.spinnerIndex + 1) % SPINNER_FRAMES.length;
  const spinnerChar = SPINNER_FRAMES[state.spinnerIndex];

  let extraStats = '';
  if (state.ffmpeg.q && state.ffmpeg.q !== '-' && state.ffmpeg.q !== '-1.0' && state.ffmpeg.q !== '-0.0') {
    extraStats += ` ${c.dim('|')} ${c.dim('q:')} ${c.cyan(state.ffmpeg.q)}`;
  }
  if (state.ffmpeg.drop > 0) {
    extraStats += ` ${c.dim('|')} ${c.redBright(`drop: ${state.ffmpeg.drop}`)}`;
  }
  if (state.ffmpeg.dup > 0) {
    extraStats += ` ${c.dim('|')} ${c.yellowBright(`dup: ${state.ffmpeg.dup}`)}`;
  }

  const ffmpegTelemetry = `${c.white(state.ffmpeg.frame)} ${c.dim('frames')} ${c.dim('|')} ${colorFps(state.ffmpeg.fps, state.pipeline.fps)} ${c.dim('|')} ${colorBitrate(state.ffmpeg.bitrate, state.pipeline.videoBitrate)} ${c.dim('|')} ${colorSpeed(state.ffmpeg.speed)} ${c.dim('|')} ${c.blueBright(state.ffmpeg.time || '00:00:00')}${extraStats}`;

  let captureTelemetry = '';
  if (state.capture.chunks > 0) {
    captureTelemetry = `${c.greenBright('streaming')} ${c.dim('|')} ${c.white(state.capture.chunks.toLocaleString())} ${c.dim('chunks')} ${c.dim('(')}${c.white(formatBytes(state.capture.bytes))}${c.dim(')')} ${c.dim('|')} ${c.cyanBright(state.capture.throughput || '-')} ${c.dim('|')} ${c.blueBright('decoder:')} ${c.white(state.capture.decoder || '-')}`;
  } else if (state.capture.frames !== '0' && state.capture.frames !== '-') {
    captureTelemetry = `${c.white(state.capture.frames)} ${c.dim('frames')} ${c.dim('|')} ${c.greenBright(state.capture.avgFps)} ${c.dim('fps avg')} ${c.dim('|')} ${c.dim('repeated')} ${colorRepeatPct(state.capture.repeatedPct)}`;
  } else {
    captureTelemetry = `${c.cyanBright(state.capture.status || 'live')} ${c.dim('|')} ${c.dim('mode:')} ${c.white(state.pipeline.captureMode)} ${c.dim('|')} ${c.blueBright('decoder:')} ${c.white(state.capture.decoder || '-')}`;
  }

  const lines = [];
  lines.push(borderA(`┌${'─'.repeat(usable)}┐`));
  lines.push(borderA('│') + padEndVisible(` ${c.bold(c.whiteBright('INTELLISTAR 1'))} ${c.blueBright('LIVE PIPELINE CONSOLE')} ${modeTag}`, usable) + borderA('│'));
  lines.push(borderA('│') + padEndVisible(` ${c.dim('Uptime:')} ${c.whiteBright(uptime)}  ${c.dim('Forecast:')} ${colorForecastState(state.forecastState.toUpperCase())}  ${c.dim('FFmpeg:')} ${colorFfmpegStatus(`${state.ffmpeg.status}`)}`, usable) + borderA('│'));
  lines.push(borderB(`├${'─'.repeat(usable)}┤`));

  lines.push(borderB('│') + padEndVisible(dashboardLine(c.blueBright('Web Server'), c.cyanBright(state.pipeline.webServer), usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.green('Output'), c.greenBright(state.pipeline.streamOutput), usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.yellow('Active Preset'), pipelinePreset, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.yellow('Deck Presets'), deckPills, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.yellow('Std Presets'), stdPills, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.magenta('Encoder'), pipelineEncoder, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.magenta('x264 Presets'), x264Pills, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.cyan('Capture'), pipelineCapture, usable), usable) + borderB('│'));
  lines.push(borderB('│') + padEndVisible(dashboardLine(c.green('Audio'), pipelineAudio, usable), usable) + borderB('│'));
  lines.push(borderC(`├${'─'.repeat(usable)}┤`));

  const liveHeader = ` ${c.bold(c.bgMagenta(c.white(' LIVE TELEMETRY ')))} ${c.bold(c.magentaBright(spinnerChar))} ${c.dim('• real-time stream stats')}`;
  lines.push(borderC('│') + padEndVisible(liveHeader, usable) + borderC('│'));
  lines.push(borderC('│') + padEndVisible(dashboardLine(c.magentaBright('FFmpeg'), ffmpegTelemetry, usable), usable) + borderC('│'));
  lines.push(borderC('│') + padEndVisible(dashboardLine(c.cyanBright('Capture'), captureTelemetry, usable), usable) + borderC('│'));
  lines.push(borderC('│') + padEndVisible(dashboardLine(c.greenBright('Now Playing'), c.whiteBright(state.audio.nowPlaying), usable), usable) + borderC('│'));
  lines.push(borderC('│') + padEndVisible(dashboardLine(c.yellowBright('Last Warning'), state.lastWarn === '-' ? c.gray('-') : c.yellow(state.lastWarn), usable), usable) + borderC('│'));
  lines.push(borderC('│') + padEndVisible(dashboardLine(c.redBright('Last Error'), state.lastError === '-' ? c.gray('-') : c.redBright(state.lastError), usable), usable) + borderC('│'));
  lines.push(borderD(`├${'─'.repeat(usable)}┤`));
  lines.push(borderD('│') + padEndVisible(` ${c.bold(c.bgCyan(c.black(' RECENT EVENTS ')))}`, usable) + borderD('│'));

  const feed = state.events.slice(-dashboard.eventLimit);
  const feedRows = Math.max(8, dashboard.eventLimit);
  for (let i = 0; i < feedRows; i++) {
    const evt = feed[feed.length - feedRows + i];
    if (!evt) {
      lines.push(borderD('│') + ' '.repeat(usable) + borderD('│'));
      continue;
    }
    const levelColor = evt.level === 'error'
      ? c.redBright
      : evt.level === 'warn'
        ? c.yellowBright
        : c.cyanBright;
    const prefix = `${c.blueBright(evt.time)} ${levelColor(evt.category.padEnd(8).slice(0, 8))} `;
    const text = truncateVisible(evt.text, Math.max(10, usable - visibleLength(prefix) - 1));
    lines.push(borderD('│') + padEndVisible(` ${prefix}${text}`, usable) + borderD('│'));
  }

  lines.push(borderD(`└${'─'.repeat(usable)}┘`));

  process.stdout.write('\x1b[?25l');
  process.stdout.write('\x1b[H');
  process.stdout.write('\x1b[2J');
  process.stdout.write(lines.join('\n'));
  process.stdout.write('\n');
  dashboard.lastRenderAt = Date.now();
  dashboard.renderedOnce = true;
}

function ensureDashboardLoop() {
  if (!dashboard.enabled || dashboard.timer) return;
  clearDashboardScreen();
  installDashboardCleanupHandlers();
  renderDashboard();
  dashboard.timer = setInterval(renderDashboard, dashboard.refreshMs);
  if (dashboard.timer && typeof dashboard.timer.unref === 'function') dashboard.timer.unref();
}

function stopDashboardLoop() {
  if (dashboard.timer) {
    clearInterval(dashboard.timer);
    dashboard.timer = null;
  }
  restoreCursor();
}

function shouldUseDashboard() {
  if (dashboard.mode === 'lines') return false;
  if (dashboard.mode === 'dashboard') {
    if (dashboard.ttyOnly && !isInteractiveTerminal()) return false;
    return true;
  }
  return isInteractiveTerminal();
}

function writeLine(category, message, icon = '') {
  const time = getTimestamp();
  const badge = formatBadge(category);
  const prefix = icon ? `${icon} ` : '';
  console.log(`${time} ${badge} ${prefix}${message}`);
}

// Banner rendering
function printBanner() {
  if (dashboard.enabled) {
    ensureDashboardLoop();
    addEvent('info', 'SYSTEM', 'Dashboard initialized');
    return;
  }
  const width = 74;
  const border = '═'.repeat(width - 2);
  console.log(c.cyan(`╔${border}╗`));
  const line1 = `  ${c.bold(c.whiteBright('INTELLISTAR 1'))}  ${c.dim('•')}  ${c.bold(c.blueBright('BROADCAST AUTOMATION PLATFORM'))}`;
  const line2 = `  ${c.dim('Mist Weather Media')}  ${c.dim('|')}  ${c.dim('IPTV & HLS 24/7 Engine')}`;
  console.log(c.cyan('║') + padEndVisible(line1, width - 2) + c.cyan('║'));
  console.log(c.cyan('║') + padEndVisible(line2, width - 2) + c.cyan('║'));
  console.log(c.cyan(`╚${border}╝`));
}

// Configuration Card rendering
function printPresetsGuide(activePreset, activeX264) {
  const width = 74;
  const title = ' AVAILABLE FFMPEG PRESETS ';
  const borderLen = Math.max(0, width - 4 - title.length);
  console.log(c.yellow(`┌─${c.bold(c.white(title))}${'─'.repeat(borderLen)}┐`));

  const deckRows = [
    { name: 'deck-quality', spec: '1920x1080 @ 30fps, 6000k VBR', desc: 'Recommended Deck balance' },
    { name: 'deck-smooth',  spec: '1280x720  @ 60fps, 5000k VBR', desc: 'Smooth 60fps motion' },
    { name: 'deck',         spec: '1280x720  @ 30fps, 3500k VBR', desc: 'Lowest CPU/APU load' },
    { name: 'deck-800p',    spec: '1280x800  @ 30fps, 4000k VBR', desc: 'Deck 16:10 native screen' },
    { name: 'deck-uhd',     spec: '3840x2160 @ 30fps, 16000k VBR', desc: 'Deck 4K UHD' },
    { name: 'deck-uhd-smooth', spec: '3840x2160 @ 60fps, 25000k VBR', desc: 'Deck 4K 60fps' },
  ];

  const stdRows = [
    { name: '1080p',        spec: '1920x1080 @ 30fps, 3500k', desc: 'Full HD standard' },
    { name: '1080p-60fps',  spec: '1920x1080 @ 60fps, 8000k', desc: 'Full HD 60fps' },
    { name: '720p',         spec: '1280x720  @ 30fps, 2500k', desc: 'HD 720p standard' },
    { name: '720p-60fps',   spec: '1280x720  @ 60fps, 5000k', desc: 'HD 720p 60fps' },
    { name: '1440p / 2k',   spec: '2560x1440 @ 30fps, 6000k', desc: '2K QHD standard' },
    { name: '1440p-60fps',  spec: '2560x1440 @ 60fps, 12000k', desc: '2K QHD 60fps' },
    { name: '4k / uhd',     spec: '3840x2160 @ 30fps, 12000k', desc: '4K UHD standard' },
    { name: '4k-60fps',     spec: '3840x2160 @ 60fps, 24000k', desc: '4K UHD 60fps' },
    { name: '480p / sd',    spec: '854x480   @ 30fps, 1500k', desc: 'Standard definition' },
  ];

  console.log(c.yellow('│') + padEndVisible(` ${c.bold(c.yellowBright('Steam Deck Tuned Presets:'))}`, width - 2) + c.yellow('│'));
  for (const row of deckRows) {
    const isAct = row.name === activePreset;
    const badge = isAct ? c.bold(c.greenBright(' [ACTIVE]')) : '';
    const line = `  • ${c.bold(isAct ? c.yellowBright(row.name.padEnd(16)) : c.white(row.name.padEnd(16)))} ${c.dim(row.spec)} ${c.dim(`(${row.desc})`)}${badge}`;
    console.log(c.yellow('│') + padEndVisible(line, width - 2) + c.yellow('│'));
  }

  console.log(c.yellow('│') + padEndVisible('', width - 2) + c.yellow('│'));
  console.log(c.yellow('│') + padEndVisible(` ${c.bold(c.cyanBright('Standard Broadcast Presets:'))}`, width - 2) + c.yellow('│'));
  for (const row of stdRows) {
    const isAct = row.name.split(' ')[0] === activePreset;
    const badge = isAct ? c.bold(c.greenBright(' [ACTIVE]')) : '';
    const line = `  • ${c.bold(isAct ? c.cyanBright(row.name.padEnd(16)) : c.white(row.name.padEnd(16)))} ${c.dim(row.spec)} ${c.dim(`(${row.desc})`)}${badge}`;
    console.log(c.yellow('│') + padEndVisible(line, width - 2) + c.yellow('│'));
  }

  console.log(c.yellow('│') + padEndVisible('', width - 2) + c.yellow('│'));
  console.log(c.yellow('│') + padEndVisible(` ${c.bold(c.magentaBright('x264 Software Presets:'))} ${c.dim('ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow')}`, width - 2) + c.yellow('│'));
  console.log(c.yellow('│') + padEndVisible(`   Active x264 Preset: ${c.bold(c.magentaBright(activeX264 || 'superfast'))}`, width - 2) + c.yellow('│'));
  console.log(c.yellow('│') + padEndVisible('', width - 2) + c.yellow('│'));
  console.log(c.yellow('│') + padEndVisible(` ${c.dim('To switch: ')}${c.yellowBright('STREAM_PRESET=<name> npm run start-iptv')}${c.dim(' or edit stream-config.js')}`, width - 2) + c.yellow('│'));
  console.log(c.yellow(`└${'─'.repeat(width - 2)}┘`));
}

function printConfigCard(details = {}) {
  state.pipeline.webServer = details.webServer || state.pipeline.webServer;
  state.pipeline.streamOutput = details.streamOutput || state.pipeline.streamOutput;
  state.pipeline.preset = details.preset || state.pipeline.preset;
  state.pipeline.resolution = details.resolution || state.pipeline.resolution;
  state.pipeline.fps = details.fps || state.pipeline.fps;
  state.pipeline.encoder = details.encoder || state.pipeline.encoder;
  state.pipeline.captureMode = details.captureMode || state.pipeline.captureMode;
  state.pipeline.audioMode = details.audioMode || state.pipeline.audioMode;
  state.pipeline.hardware = details.hardwareInfo || state.pipeline.hardware;
  state.pipeline.videoBitrate = details.videoBitrate || state.pipeline.videoBitrate;
  state.pipeline.x264Preset = details.x264Preset || state.pipeline.x264Preset;
  state.audio.mode = details.audioMode || state.audio.mode;

  if (dashboard.enabled) {
    ensureDashboardLoop();
    addEvent('info', 'CONFIG', 'Pipeline configuration loaded');
    return;
  }

  const width = 74;
  const title = ' PIPELINE CONFIGURATION ';
  const borderLen = Math.max(0, width - 4 - title.length);
  console.log(c.cyan(`┌─${c.bold(c.white(title))}${'─'.repeat(borderLen)}┐`));

  const items = [
    { label: 'Web Server', value: c.white(details.webServer || 'http://127.0.0.1:7070') },
    { label: 'Stream Output', value: c.green(details.streamOutput || '/stream/index.m3u8') },
    { label: 'Preset', value: `${c.yellow(details.preset || '1080p')} ${c.dim(`(${details.resolution || '1920x1080'} @ ${details.fps || 60}fps)`)}` },
    { label: 'Video Encoder', value: `${c.magenta(details.encoder || 'h264_vaapi')} ${c.dim(`(${details.encoderDetail || details.bitrate || '3500k'})`)}` },
    { label: 'Capture Mode', value: `${c.cyan(details.captureMode || 'puppeteer-stream')} ${details.captureDetail ? c.dim(`(${details.captureDetail})`) : ''}` },
    { label: 'Audio Engine', value: `${c.white(details.audioMode || 'browser WebAudio')} ${details.audioDetail ? c.dim(`(${details.audioDetail})`) : ''}` },
  ];

  if (details.hardwareInfo) {
    items.push({ label: 'Hardware', value: c.dim(details.hardwareInfo) });
  }

  for (const item of items) {
    const labelFormatted = c.dim(item.label.padEnd(14) + ': ');
    const lineContent = `  ${labelFormatted}${item.value}`;
    console.log(c.cyan('│') + padEndVisible(lineContent, width - 2) + c.cyan('│'));
  }

  console.log(c.cyan(`└${'─'.repeat(width - 2)}┘`));

  printPresetsGuide(state.pipeline.preset, state.pipeline.x264Preset);
}

// Log deduplication tracker (suppresses identical messages within debounce window)
const recentLogs = new Map();
function shouldLog(key, minIntervalMs = 2000) {
  const now = Date.now();
  const lastTime = recentLogs.get(key) || 0;
  if (now - lastTime < minIntervalMs) {
    return false;
  }
  recentLogs.set(key, now);
  if (recentLogs.size > 200) {
    for (const [k, time] of recentLogs.entries()) {
      if (now - time > 10000) recentLogs.delete(k);
    }
  }
  return true;
}

// Logger object
const logger = {
  c,

  configure(options = {}) {
    dashboard.mode = normalizeMode(options.mode || 'auto');
    dashboard.refreshMs = Math.max(100, parseInt(options.refreshMs || 250, 10) || 250);
    dashboard.eventLimit = Math.max(5, Math.min(20, parseInt(options.eventLimit || 10, 10) || 10));
    dashboard.progressIntervalMs = Math.max(1000, parseInt(options.progressIntervalMs || 30000, 10) || 30000);
    dashboard.ttyOnly = options.ttyOnly !== false;
    dashboard.configured = true;
    dashboard.enabled = shouldUseDashboard();
    if (dashboard.enabled) ensureDashboardLoop();
  },

  isDashboardEnabled() {
    return dashboard.enabled;
  },

  shutdown() {
    stopDashboardLoop();
    dashboard.enabled = false;
  },

  log(category, message, icon = '') {
    if (!dashboard.enabled) {
      writeLine(category, message, icon);
      return;
    }

    updateStateFromMessage(category, message);
    const raw = stripAnsi(`${message}`);
    if (!/^Telemetry:/i.test(raw)) {
      addEvent('info', category, raw);
    }
    renderDashboard();
  },

  server(message, icon = '') {
    this.log('SERVER', message, icon);
  },

  stream(message, icon = '') {
    this.log('STREAM', message, icon);
  },

  browser(message, icon = '') {
    this.log('BROWSER', message, icon);
  },

  capture(message, icon = '') {
    this.log('CAPTURE', message, icon);
  },

  audio(message, icon = c.green('♫')) {
    this.log('AUDIO', message, icon);
  },

  config(message, icon = c.yellow('⚙')) {
    this.log('CONFIG', message, icon);
  },

  standby(message, icon = c.yellow('●')) {
    this.log('STANDBY', message, icon);
  },

  weather(message, icon = '') {
    this.log('WEATHER', message, icon);
  },

  radar(message, icon = '') {
    this.log('RADAR', message, icon);
  },

  ready(message, icon = c.green('✓')) {
    this.log('READY', c.bold(c.greenBright(message)), icon);
  },

  forecast(message, icon = c.cyanBright('▶')) {
    this.log('FORECAST', c.bold(c.cyanBright(message)), icon);
  },

  alert(message, icon = c.redBright('⚠')) {
    this.log('ALERT', c.bold(c.redBright(message)), icon);
  },

  message(message, icon = c.magentaBright('💬')) {
    this.log('MESSAGE', message, icon);
  },

  refresh(message, icon = c.cyan('🔄')) {
    this.log('REFRESH', message, icon);
  },

  warn(message, icon = c.yellow('⚠')) {
    if (!dashboard.enabled) {
      const time = getTimestamp();
      const badge = formatBadge('WARN', c.yellowBright);
      console.warn(`${time} ${badge} ${icon ? `${icon} ` : ''}${c.yellow(message)}`);
      return;
    }
    state.lastWarn = stripAnsi(`${message}`);
    addEvent('warn', 'WARN', state.lastWarn);
    renderDashboard();
  },

  error(message, icon = c.red('✖')) {
    if (!dashboard.enabled) {
      const time = getTimestamp();
      const badge = formatBadge('ERROR', c.redBright);
      console.error(`${time} ${badge} ${icon ? `${icon} ` : ''}${c.redBright(message)}`);
      return;
    }
    state.lastError = stripAnsi(`${message}`);
    addEvent('error', 'ERROR', state.lastError);
    renderDashboard();
  },

  // Parse and transform browser/Puppeteer logs cleanly
  handleBrowserLog(rawText) {
    if (!rawText) return;

    // Suppress raw object dumps like '[array Array]'
    let text = rawText
      .replace(/:?\s*\[array Array\]/g, '')
      .replace(/:?\s*\[object Object\]/g, '')
      .trim();

    // 1. Audio playlist build logs (e.g. "[Audio] Built playlist (12 tracks)")
    const playlistMatch = text.match(/\[Audio\]\s*Built playlist\s*\((\d+)\s*tracks\)/i);
    if (playlistMatch) {
      const count = playlistMatch[1];
      const dedupKey = `playlist_${count}`;
      if (shouldLog(dedupKey, 3000)) {
        this.audio(`Audio playlist synchronized (${c.bold(count)} tracks)`);
      }
      return;
    }

    // 2. Audio loaded custom tracks
    const customMusicMatch = text.match(/\[Audio\]\s*Loaded\s*(\d+)\s*tracks\s*from\s*(.*)/i);
    if (customMusicMatch) {
      const count = customMusicMatch[1];
      const source = customMusicMatch[2].replace(/\.$/, '');
      if (shouldLog(`custom_music_${count}`, 3000)) {
        this.audio(`Loaded ${c.bold(count)} tracks from ${c.dim(source)}`);
      }
      return;
    }

    // 3. Audio playing track
    const playingMatch = text.match(/\[Audio\]\s*Playing music track\s*\[(\d+\/\d+)\]:\s*(.*)/i);
    if (playingMatch) {
      const index = playingMatch[1];
      const track = playingMatch[2].replace(/^music\/(system|custom)\//i, '');
      this.audio(`Now playing: ${c.white(track)} ${c.dim(`[${index}]`)}`);
      return;
    }

    // 4. Test tone / color bars
    if (/1000\s*Hz broadcast test tone active/i.test(text)) {
      if (shouldLog('test_tone', 5000)) {
        this.standby('1000 Hz broadcast test tone active', c.yellow('♪'));
      }
      return;
    }

    if (/Initialization mode detected.*color bars/i.test(text)) {
      if (shouldLog('init_color_bars', 5000)) {
        this.standby('Initialization mode: color bars & calibration active');
      }
      return;
    }

    if (/System ready.*Color bars & test tone active/i.test(text)) {
      if (shouldLog('system_ready_bars', 5000)) {
        this.standby('System standby: Color bars active, waiting for forecast command');
      }
      return;
    }

    // 5. Config loaded
    const configMatch = text.match(/\[Config\]\s*(.*)/i);
    if (configMatch) {
      const cfgMsg = configMatch[1];
      if (shouldLog('config_loaded', 3000)) {
        this.config(cfgMsg);
      }
      return;
    }

    // 6. Forecast presentation started / stopped
    if (/Forecast presentation started/i.test(text)) {
      this.forecast('Forecast presentation started');
      return;
    }
    if (/Forecast presentation stopped/i.test(text)) {
      this.forecast('Forecast presentation stopped (returned to standby)');
      return;
    }

    // 7. Weather grab timing (e.g. "Weather grab done in 15378ms")
    const grabMatch = text.match(/Weather grab done in (\d+)ms/i);
    if (grabMatch) {
      const ms = parseInt(grabMatch[1], 10);
      const sec = (ms / 1000).toFixed(2);
      this.weather(`Weather data grab completed in ${c.bold(`${sec}s`)}`, c.green('✓'));
      return;
    }

    // 8. Boot Status messages
    const bootMatch = text.match(/\[Boot Status\]\s*(.*)/i);
    if (bootMatch) {
      const msg = bootMatch[1].trim();
      if (/Prêt|Ready/i.test(msg)) {
        if (shouldLog('ready_broadcast', 3000)) {
          this.ready(msg);
        }
      } else if (/radar|doppler|carte/i.test(msg)) {
        if (shouldLog(`radar_${msg}`, 3000)) {
          this.radar(msg);
        }
      } else {
        if (shouldLog(`boot_${msg}`, 3000)) {
          this.weather(msg);
        }
      }
      return;
    }

    // 9. Location / Network errors
    if (/Location Error|Failed to load/i.test(text)) {
      this.warn(text.replace(/^\[.*?\]\s*/, ''));
      return;
    }

    // Fallback for other filtered messages
    const cleaned = text.replace(/^\[Page\]\s*/i, '');
    this.browser(cleaned);
  },

  // Update capture statistics (chunks, bytes, throughput, decoder)
  updateCaptureStats(stats = {}) {
    if (stats.status) state.capture.status = stats.status;
    if (stats.mode) state.capture.mode = stats.mode;
    if (stats.chunks !== undefined) state.capture.chunks = stats.chunks;
    if (stats.bytes !== undefined) state.capture.bytes = stats.bytes;
    if (stats.throughput !== undefined) state.capture.throughput = stats.throughput;
    if (stats.decoder) state.capture.decoder = stats.decoder;
    if (stats.frames !== undefined) state.capture.frames = stats.frames;
    if (stats.avgFps !== undefined) state.capture.avgFps = stats.avgFps;
    if (stats.repeatedPct !== undefined) state.capture.repeatedPct = stats.repeatedPct;
    if (dashboard.enabled) {
      if (Date.now() - dashboard.lastRenderAt >= dashboard.refreshMs) {
        renderDashboard();
      }
    }
  },

  // Format and print FFmpeg telemetry nicely
  formatFFmpegProgress(rawLine) {
    const progress = parseFfmpegProgress(rawLine);

    state.ffmpeg.status = 'running';
    if (progress.frame) state.ffmpeg.frame = progress.frame;
    if (progress.fps) state.ffmpeg.fps = progress.fps;
    if (progress.time) state.ffmpeg.time = progress.time;
    if (progress.bitrate) state.ffmpeg.bitrate = progress.bitrate;
    if (progress.speed) state.ffmpeg.speed = progress.speed;
    if (progress.q) state.ffmpeg.q = progress.q;
    if (progress.drop !== undefined) state.ffmpeg.drop = progress.drop;
    if (progress.dup !== undefined) state.ffmpeg.dup = progress.dup;
    if (progress.size) state.ffmpeg.size = progress.size;

    const parts = [];
    if (progress.frame) parts.push(`${c.bold(progress.frame)} frames`);
    if (progress.fps) parts.push(colorFps(progress.fps, state.pipeline.fps));
    if (progress.bitrate) parts.push(c.magentaBright(progress.bitrate));
    else if (state.pipeline.videoBitrate) parts.push(`${c.magenta(state.pipeline.videoBitrate)} (target)`);
    if (progress.speed) parts.push(colorSpeed(progress.speed));
    if (progress.time) parts.push(c.blueBright(`time: ${progress.time}`));
    if (progress.drop > 0) parts.push(c.redBright(`drop: ${progress.drop}`));
    if (progress.q && progress.q !== '-' && progress.q !== '-1.0' && progress.q !== '-0.0') parts.push(c.cyan(`q: ${progress.q}`));

    const telemetry = parts.length > 0 ? parts.join(' | ') : rawLine;
    if (dashboard.enabled) {
      renderDashboard();
      return;
    }
    this.stream(`Telemetry: ${telemetry}`, c.green('●'));
  },

  printBanner,
  printConfigCard,
  printPresetsGuide,
};

module.exports = logger;

