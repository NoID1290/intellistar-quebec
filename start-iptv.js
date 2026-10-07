const puppeteer = require('puppeteer');
let puppeteerStream = null;
try {
  puppeteerStream = require('puppeteer-stream');
} catch (e) {
  // puppeteer-stream optional fallback
}
const { spawn, spawnSync } = require('child_process');
const { PassThrough } = require('stream');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const config = require('./stream-config');
const logger = require('./console-view');
const { normalizeEncoder, isVaapi, rateControl, keyframeFrames, captureBitrate, vaapiEncoderArgs, videoFilter } = require('./stream-encoding');
const { installRafThrottle, ensureStreamBrowserCompatibility } = require('./stream-browser');
const { kmsgrabInputArgs, probeKmsgrabCapability, pipewireVideoArgs, pipewireInputArgs,
  probePipewireVideo, cleanupPipewireAudioSink, pipewireAudioArgs, preparePipewireAudio,
  resolveLinuxCaptureMode } = require('./stream-linux-capture');

let fatalCleanup = null;

function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) {}
      resolve();
    }, 1500);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    try { child.kill(signal); } catch (e) { clearTimeout(timer); resolve(); }
  });
}

const isArm = process.arch === 'arm64' || process.arch === 'arm';
const cpuCount = Math.max(1, os.cpus().length);
const ffmpegThreads = Math.min(cpuCount, config.ffmpegThreads);
const encoderProbeCache = {};
const encoderProbeSamples = {};

function getAvailableVideoEncoders() {
  try {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    return output;
  } catch (e) {
    return '';
  }
}

function getWindowsDshowAudioDevices() {
  try {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const matches = [];
    const regex = /"([^"]+)"\s+\(audio\)/g;
    let m;
    while ((m = regex.exec(output)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  } catch (e) {
    return [];
  }
}

function probeHardwareEncoder(encoder) {
  if (encoderProbeCache[encoder] !== undefined) {
    return encoderProbeCache[encoder];
  }

  const vaapiDevice = config.vaapiDevice || '/dev/dri/renderD128';
  let probeArgs = [];

  if (encoder === 'h264_vaapi' || encoder === 'hevc_vaapi') {
    if (!fs.existsSync(vaapiDevice)) {
      encoderProbeCache[encoder] = false;
      return false;
    }
    probeArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      '-vaapi_device', vaapiDevice,
      '-f', 'lavfi',
      '-i', `color=size=${config.captureWidth}x${config.captureHeight}:rate=${config.fps}`,
      '-frames:v', '8',
      '-an',
      '-filter_threads', String(ffmpegThreads),
      '-vf', videoFilter(config, encoder),
      '-c:v', encoder,
      '-b:v', String(rateControl(config).target),
      '-maxrate', String(rateControl(config).maxrate),
      '-bufsize', String(rateControl(config).bufsize),
      ...vaapiEncoderArgs(config, encoder),
      '-f', 'matroska',
      '-',
    ];
  } else {
    probeArgs = [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'color=size=640x360:rate=30',
      '-frames:v', '15',
      '-an',
      '-c:v', encoder,
      '-f', 'null',
      '-',
    ];
  }

  try {
    const result = spawnSync('ffmpeg', probeArgs, { timeout: 15000 });
    const stderrText = `${result.stderr || ''}`;
    const hasError = /Error creating a MFX session|Error while opening encoder|format negotiation failed|vaInitialize failed|Device creation failed/i.test(stderrText);
    const ok = result.status === 0 && !hasError;
    encoderProbeCache[encoder] = ok;
    if (ok && isVaapi(encoder)) encoderProbeSamples[encoder] = result.stdout;
    if (!ok) {
      const details = stderrText.trim();
      if (details) {
        logger.warn(`[IPTV] Encoder probe failed for '${encoder}': ${details.split(/\r?\n/).slice(-2).join(' | ')}`);
      }
    }
    return ok;
  } catch (e) {
    encoderProbeCache[encoder] = false;
    return false;
  }
}

function canUseEncoder(encoder) {
  if (encoder === 'libx264') return true;
  if (encoder === 'h264_vaapi' || encoder === 'hevc_vaapi' || encoder === 'h264_qsv' || encoder === 'h264_nvenc' || encoder === 'h264_amf' || encoder === 'h264_mf') {
    return probeHardwareEncoder(encoder);
  }
  return true;
}

function probeHardwareDecode(outputEncoder) {
  if (!probeHardwareEncoder('h264_vaapi')) return false;
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-vaapi_device', config.vaapiDevice,
    '-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi',
    '-f', 'matroska', '-i', 'pipe:0',
    '-filter_threads', String(ffmpegThreads),
    '-vf', videoFilter(config, outputEncoder, true),
    '-c:v', outputEncoder, ...vaapiEncoderArgs(config, outputEncoder),
    '-b:v', String(rateControl(config).target),
    '-maxrate', String(rateControl(config).maxrate),
    '-bufsize', String(rateControl(config).bufsize),
    '-an', '-f', 'null', '-',
  ], { input: encoderProbeSamples.h264_vaapi, timeout: 15000 });
  if (result.status !== 0) logger.warn('VAAPI tab decoding probe failed; using CPU decoding with bounded threads.');
  return result.status === 0;
}

function probeNdiCapability(ffmpegPath = config.ffmpegPath || 'ffmpeg') {
  try {
    const result = spawnSync(ffmpegPath, ['-muxers'], { encoding: 'utf8', timeout: 5000 });
    return result.status === 0 && `${result.stdout || ''}`.includes('libndi_newtek');
  } catch (e) {
    return false;
  }
}

function resolveNdiBridgePath() {
  const localBridge = path.resolve(__dirname, 'bin', 'ndi-bridge');
  if (fs.existsSync(localBridge)) return localBridge;
  return null;
}

function resolveVideoEncoder(preferredEncoder) {
  if (config.outputMode === 'ndi') {
    return 'rawvideo';
  }
  preferredEncoder = normalizeEncoder(preferredEncoder);
  if (preferredEncoder === 'hevc_vaapi' && config.outputMode === 'rtmp') {
    throw new Error('Standard RTMP/FLV requires H.264. Use STREAM_VIDEO_ENCODER=h264_vaapi.');
  }
  const encodersOutput = getAvailableVideoEncoders();
  const has = (name) => encodersOutput.includes(name);

  if (preferredEncoder && preferredEncoder !== 'auto') {
    if (has(preferredEncoder) && canUseEncoder(preferredEncoder)) return preferredEncoder;
    if (has(preferredEncoder) && !canUseEncoder(preferredEncoder)) {
      logger.warn(`[IPTV] Requested encoder '${preferredEncoder}' is present but unusable. Falling back to auto.`);
    } else {
      logger.warn(`[IPTV] Requested encoder '${preferredEncoder}' not found. Falling back to auto.`);
    }
  }

  // The Pi 5 (BCM2712) dropped the H.264 encode block, so h264_v4l2m2m is
  // listed by Debian ffmpeg builds but will fail at runtime. Never auto-pick it.
  if (isArm) {
    if (has('h264_v4l2m2m')) {
      logger.warn('[IPTV] Ignoring h264_v4l2m2m: no usable hardware H.264 encoder on Pi 5. Using libx264.');
    }
    return softwareFallback();
  }

  // Linux: Steam Deck AMD GPU / Intel VAAPI hardware acceleration
  if (process.platform === 'linux' && has('h264_vaapi') && canUseEncoder('h264_vaapi')) {
    return 'h264_vaapi';
  }

  if (has('h264_nvenc') && canUseEncoder('h264_nvenc')) return 'h264_nvenc';
  if (has('h264_qsv') && canUseEncoder('h264_qsv')) return 'h264_qsv';
  if (has('h264_amf') && canUseEncoder('h264_amf')) return 'h264_amf';
  if (process.platform === 'win32' && has('h264_mf') && canUseEncoder('h264_mf')) return 'h264_mf';
  if (has('h264_vaapi') || has('h264_nvenc') || has('h264_qsv') || has('h264_amf') || has('h264_mf')) {
    logger.warn('[IPTV] Hardware encoders are installed but unavailable. Falling back to libx264.');
  }
  return softwareFallback();
}

function softwareFallback() {
  if (!config.allowSoftwareFallback) {
    throw new Error('No usable hardware encoder. Check FFmpeg VAAPI support and render-node permissions. ' +
      'Deck presets refuse automatic CPU encoding; explicitly set STREAM_ALLOW_SOFTWARE_FALLBACK=true or STREAM_VIDEO_ENCODER=libx264 to opt in.');
  }
  return 'libx264';
}

function resolveHlsDirectory() {
  if (config.useRamCache) {
    const rawRam = config.ramCacheDirectory || (process.platform === 'linux' ? '/dev/shm/intelli-stream' : 'R:/intelli-cache');
    const cleanedRam = `${rawRam}`.trim().replace(/^['\"]+|['\"]+$/g, '');
    if (process.platform === 'win32') {
      const root = path.parse(cleanedRam).root;
      if (root && fs.existsSync(root)) {
        return path.normalize(cleanedRam);
      }
      logger.warn(`[IPTV] RAM cache drive '${root}' not found. Falling back to disk HLS directory.`);
    } else if (process.platform === 'linux' && fs.existsSync('/dev/shm')) {
      return path.normalize(cleanedRam);
    }
  }

  const rawDir = `${config.hlsDirectory || ''}`.trim() || './stream-cache';
  const cleanedDir = rawDir.replace(/^['\"]+|['\"]+$/g, '');
  const resolved = path.isAbsolute(cleanedDir)
    ? path.normalize(cleanedDir)
    : path.resolve(__dirname, cleanedDir);

  if (process.platform === 'win32') {
    const root = path.parse(resolved).root;
    if (root && /^[a-zA-Z]:\\$/.test(root) && !fs.existsSync(root)) {
      logger.warn(`[IPTV] Configured drive '${root}' not found. Falling back to ./stream-cache.`);
      return path.resolve(__dirname, './stream-cache');
    }
  }

  return resolved;
}

function findExecutableOnPath(command) {
  const locator = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(locator, [command], { encoding: 'utf8' });
    if (result.status !== 0) return null;

    const match = `${result.stdout || ''}`
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean);

    return match && fs.existsSync(match) ? match : null;
  } catch (e) {
    return null;
  }
}

function resolveBrowserExecutablePath() {
  const configuredPath = config.browserExecutablePath;
  if (configuredPath) {
    const resolvedFromPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : (findExecutableOnPath(configuredPath) || path.resolve(configuredPath));

    if (!fs.existsSync(resolvedFromPath)) {
      throw new Error(
        `[IPTV] Configured browser executable was not found: ${resolvedFromPath}. ` +
        'Set STREAM_BROWSER_PATH or PUPPETEER_EXECUTABLE_PATH to a valid Chromium/Chrome binary.'
      );
    }
    return resolvedFromPath;
  }

  const candidates = process.platform === 'linux'
    ? [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        'chromium-browser',
        'chromium',
        'google-chrome',
        'google-chrome-stable',
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          'google-chrome',
          'chromium',
        ]
      : [
          'chrome',
          'msedge',
        ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }

    const resolvedCandidate = findExecutableOnPath(candidate);
    if (resolvedCandidate) return resolvedCandidate;
  }

  if (process.platform === 'linux' && isArm) {
    throw new Error(
      '[IPTV] No system Chromium/Chrome binary was found on this Linux ARM host. ' +
      'Install chromium-browser (or chromium) and retry, or set STREAM_BROWSER_PATH to the browser binary.'
    );
  }

  return null;
}

// `which` can miss Xvfb under a trimmed PATH (systemd/npm on SteamOS); also probe the usual install locations.
function resolveXvfbPath() {
  if (process.platform !== 'linux') return null;
  const configured = process.env.STREAM_XVFB_PATH;
  if (configured) return fs.existsSync(configured) ? configured : null;
  return findExecutableOnPath('Xvfb')
    || ['/usr/bin/Xvfb', '/usr/local/bin/Xvfb', '/usr/X11R6/bin/Xvfb', '/var/lib/flatpak/exports/bin/Xvfb'].find((p) => fs.existsSync(p))
    || null;
}

function hasXvfb() {
  return !!resolveXvfbPath();
}

const XVFB_INSTALL_HINT = 'Install it on SteamOS with: sudo steamos-readonly disable && sudo pacman -S xorg-server-xvfb '
  + '(or set STREAM_XVFB_PATH to the binary).';

function cleanupStaleXvfbLock(display) {
  if (process.platform !== 'linux') return;
  try {
    const displayNum = display.replace(/^:/, '');
    const lockFile = `/tmp/.X${displayNum}-lock`;
    const socketFile = `/tmp/.X11-unix/X${displayNum}`;
    if (fs.existsSync(lockFile)) {
      try {
        const pid = parseInt(fs.readFileSync(lockFile, 'utf8').trim(), 10);
        if (pid && !isNaN(pid)) {
          try {
            process.kill(pid, 0); // Check if process is alive
          } catch (e) {
            // Process does not exist; lock is stale
            logger.capture(`[IPTV] Cleaning up stale Xvfb lock file: ${lockFile}`);
            fs.unlinkSync(lockFile);
            if (fs.existsSync(socketFile)) fs.unlinkSync(socketFile);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function startXvfbServer(display, width, height) {
  cleanupStaleXvfbLock(display);
  const xvfbPath = resolveXvfbPath() || 'Xvfb';
  logger.capture(`[IPTV] Starting Xvfb virtual display server on ${display} (${width}x${height}x24 with MIT-SHM) via ${xvfbPath}...`);
  const xvfbProcess = spawn(xvfbPath, [
    display,
    '-screen', '0', `${width}x${height}x24`,
    '-ac',
    '+extension', 'GLX',
    '+extension', 'RENDER',
    '+extension', 'MIT-SHM',
    '-noreset',
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  xvfbProcess.stderr.on('data', (data) => {
    const errText = data.toString().trim();
    if (errText && !/server already running|server is already active|glXCreateContext/i.test(errText)) {
      logger.warn(`[Xvfb] ${errText}`);
    }
  });

  xvfbProcess.on('error', (err) => {
    logger.error(`[IPTV] Failed to start Xvfb process: ${err.message}`);
  });

  return xvfbProcess;
}

// Poll for the X socket instead of sleeping a fixed time; Xvfb start-up varies with display size.
// Resolves 'started' when our process serves the display, or 'existing' when a server (typically
// an orphan from a previous run, kept alive by -noreset) already owns it and can be reused.
async function waitForXvfbDisplay(xvfbProcess, display, timeoutMs = 5000) {
  const socketFile = `/tmp/.X11-unix/X${display.replace(/^:/, '')}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (xvfbProcess.exitCode !== null || xvfbProcess.signalCode) {
      if (fs.existsSync(socketFile)) return 'existing';
      throw new Error(`Xvfb exited with code ${xvfbProcess.exitCode} before ${display} was ready.`);
    }
    if (fs.existsSync(socketFile)) return 'started';
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Xvfb display ${display} did not become ready within ${timeoutMs}ms.`);
}

function buildBrowserLaunchOptions(captureWidth, captureHeight, captureMode = 'xvfb', xvfbDisplay = null) {
  const executablePath = resolveBrowserExecutablePath();
  if (executablePath) {
    logger.browser(`[IPTV] Using browser executable: ${executablePath}`);
  } else {
    logger.browser('[IPTV] Using Puppeteer managed browser executable.');
  }

  const isXvfb = captureMode === 'xvfb' || captureMode === 'x11grab';
  const isPuppeteerStream = captureMode === 'puppeteer-stream' || captureMode === 'stream';
  const isDesktop = captureMode === 'kmsgrab' || captureMode === 'pipewire';

  const gpuFlags = config.enableGpu
    ? [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--enable-accelerated-2d-canvas',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--enable-features=VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization',
      ]
    : [
        '--disable-gpu',
      ];

  const memFlags = isArm
    ? [
        '--js-flags=--max-old-space-size=512 --expose-gc',
        '--enable-low-end-device-mode',
      ]
    : [
        '--js-flags=--max-old-space-size=2048 --expose-gc',
      ];

  const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-watchdog',
    '--disable-renderer-accessibility',
    ...gpuFlags,
    '--autoplay-policy=no-user-gesture-required',
    ...memFlags,
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,TranslateUI,Translate,OptimizationHints,MediaRouter,InterestFeedContentSuggestions',
    // Reduce Chrome overhead from subsystems never used in headless IPTV capture
    '--disable-default-apps',
    '--disable-component-update',
    '--disable-component-extensions-with-background-pages',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--disable-domain-reliability',
    '--disable-ipc-flooding-protection',
    '--disable-hang-monitor',
    '--force-device-scale-factor=1',
    `--window-size=${captureWidth},${captureHeight}`,
  ];

  if (isXvfb && xvfbDisplay && process.platform === 'linux') {
    browserArgs.push(
      `--display=${xvfbDisplay}`,
      '--ozone-platform=x11',
      '--start-fullscreen',
      '--kiosk',
      '--window-position=0,0',
      '--hide-scrollbars',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check'
    );
  }

  if (isDesktop) {
    browserArgs.push(
      '--start-fullscreen',
      '--kiosk',
      '--window-position=0,0',
      '--hide-scrollbars',
      '--use-gl=egl',
      `--ozone-platform=${process.env.WAYLAND_DISPLAY ? 'wayland' : 'x11'}`
    );
  }

  if (!isPuppeteerStream) {
    browserArgs.push('--disable-extensions');
  }

  return {
    headless: isXvfb || isDesktop ? false : 'new',
    // Headless Chromium otherwise mutes audio before it reaches the Pulse sink.
    ignoreDefaultArgs: config.audioMode === 'pipewire' ? ['--mute-audio'] : [],
    executablePath: executablePath || undefined,
    protocolTimeout: 180000,
    defaultViewport: isDesktop ? null : {
      width: captureWidth,
      height: captureHeight,
    },
    args: browserArgs,
    env: isXvfb && xvfbDisplay && process.platform === 'linux'
      ? { ...process.env, DISPLAY: xvfbDisplay }
      : process.env,
  };
}

function attachPageDiagnostics(page) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (!text) return;

    if (msg.type() === 'error') {
      logger.error(`Browser Console: ${text}`);
      return;
    }

    if (/\[IPTV\]|\[Forecast\]|\[Config\]|\[Audio\]|\[Boot Status\]|\[Weather\]|\[Radar\]|\[Slides\]|Weather grab done|Location Error|Failed to load|Initialization mode detected/i.test(text)) {
      logger.handleBrowserLog(text);
    }
  });

  page.on('pageerror', (err) => {
    logger.error(`Browser Crash: ${err.message}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = request.url();
    // Benign aborts (canceled requests or map tiles being switched)
    if (failure && failure.errorText === 'net::ERR_ABORTED') return;
    logger.warn(`Request failed: ${request.method()} ${url} :: ${failure ? failure.errorText : 'unknown error'}`);
  });
}

async function getPageStartupState(page) {
  return page.evaluate(() => {
    const menu = document.getElementById('settings-menu');
    const blackscreen = document.getElementById('blackscreen');
    const startButton = document.getElementById('startbutton');
    const getState = (el) => {
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      };
    };

    const visibleSlides = Array.from(document.querySelectorAll('.slides > div'))
      .filter((el) => {
        if (el.children.length === 0) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      })
      .map((el) => el.className);

    return {
      inSettings: typeof window.inSettings === 'undefined' ? null : window.inSettings,
      startButton: startButton ? {
        pointerEvents: startButton.style.pointerEvents,
        opacity: startButton.style.opacity,
        disabled: startButton.disabled === true,
      } : null,
      menu: getState(menu),
      blackscreen: getState(blackscreen),
      visibleSlides,
      locationText: document.querySelector('.loctext') ? document.querySelector('.loctext').textContent : '',
      dataUpdatedText: document.querySelector('.data-updated') ? document.querySelector('.data-updated').textContent : '',
      title: document.title,
    };
  });
}

async function waitForForecastReady(page, timeoutMs) {
  try {
    await page.waitForFunction(() => {
      // 1. Ensure the forecast is running (not in settings or loading phase)
      if (window.inSettings !== false) return false;

      // 2. Ensure the blackscreen transition overlay is hidden
      const blackscreen = document.getElementById('blackscreen');
      const overlayHidden = !blackscreen || (() => {
        const style = getComputedStyle(blackscreen);
        return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0;
      })();

      if (!overlayHidden) return false;

      // 3. Ensure a valid forecast slide is actually visible
      const visibleSlide = Array.from(document.querySelectorAll('.slides > div')).some((el) => {
        // Exclude empty helper/placeholder elements that don't have children
        if (el.children.length === 0) return false;

        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
      });

      return visibleSlide;
    }, { timeout: timeoutMs });
  } catch (err) {
    const startupState = await getPageStartupState(page).catch(() => null);
    const detail = startupState ? ` Startup state: ${JSON.stringify(startupState)}` : '';
    throw new Error(`Timed out waiting for visible forecast content.${detail}`);
  }
}

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

let serverProcess = null;

async function resetForecastState(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/forecast/reset`, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function startServerIfNeeded() {
  const running = await isServerRunning(config.port);
  if (!running && config.autoStartServer) {
    logger.server(`Starting internal HTTP server on port ${config.port}...`);
    serverProcess = spawn('node', ['app.js'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env, INTELLISTAR_IPTV_RUNNER: '1' },
    });
    // Wait for server to boot
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isServerRunning(config.port)) break;
    }
  }
}

async function startStreaming() {
  let capturing = true;
  let shuttingDown = false;
  let browser = null;
  let ffmpeg = null;
  let ndiBridgeProcess = null;
  let xvfbProcess = null;
  let pipewireProcess = null;
  let pipewireAudio = null;
  let audioPipe = null;
  let cdpSession = null;
  let tabStream = null;
  let gcInterval = null;
  let hlsPruneInterval = null;
  let screencastWriterTimer = null;
  const xvfbDisplay = config.xvfbDisplay || ':99';
  const cleanupSink = () => {
    if (pipewireAudio?.moduleId !== null && pipewireAudio?.moduleId !== undefined) {
      if (cleanupPipewireAudioSink(pipewireAudio.moduleId)) pipewireAudio.moduleId = null;
      else logger.warn(`Could not unload PipeWire module ${pipewireAudio.moduleId}; stop.sh can remove it later.`);
    }
  };
  const cleanup = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    capturing = false;
    logger.shutdown();
    logger.stream('Shutting down IPTV stream pipeline...');
    clearInterval(gcInterval);
    clearInterval(hlsPruneInterval);
    clearTimeout(screencastWriterTimer);
    // Stop children before awaiting browser/extension shutdown, which can hang on failed startup.
    try { if (tabStream) tabStream.destroy(); } catch (e) {}
    try { if (audioPipe) audioPipe.destroy(); } catch (e) {}
    const children = [stopChild(pipewireProcess), stopChild(ffmpeg, 'SIGINT'),
      stopChild(ndiBridgeProcess, 'SIGTERM'), stopChild(xvfbProcess), stopChild(serverProcess)];
    if (browser) {
      const child = browser.process();
      const closing = browser.close().catch(() => {});
      children.push(stopChild(child), closing);
    }
    cleanupSink();
    let deadline;
    await Promise.race([Promise.allSettled(children), new Promise(resolve => { deadline = setTimeout(resolve, 2500); })]);
    clearTimeout(deadline);
    if (xvfbProcess) cleanupStaleXvfbLock(xvfbDisplay);
    process.exit(typeof code === 'number' ? code : 0);
  };
  fatalCleanup = cleanup;
  process.once('SIGINT', () => void cleanup(0));
  process.once('SIGTERM', () => void cleanup(0));
  process.once('uncaughtException', err => { logger.error(err.message); void cleanup(1); });
  process.once('unhandledRejection', err => { logger.error(String(err)); void cleanup(1); });
  process.once('exit', () => {
    cleanupSink();
    for (const child of [pipewireProcess, ffmpeg, ndiBridgeProcess, xvfbProcess, serverProcess, browser?.process()]) {
      if (child && child.exitCode === null && !child.signalCode) {
        try { child.kill('SIGKILL'); } catch (e) {}
      }
    }
  });

  logger.configure({
    mode: config.logMode,
    refreshMs: config.logDashboardRefreshMs,
    eventLimit: config.logDashboardEventLimit,
    progressIntervalMs: config.logProgressIntervalMs,
    ttyOnly: true,
  });

  logger.printBanner();
  await startServerIfNeeded();
  await resetForecastState(config.port);

  const videoEncoder = resolveVideoEncoder(config.videoEncoder || 'auto');
  const outputPixelFormat = videoEncoder === 'h264_qsv' ? 'nv12' : 'yuv420p';

  const captureWidth = config.captureWidth || config.width || 1280;
  const captureHeight = config.captureHeight || config.height || 720;

  if (process.platform === 'linux') {
    if (!process.env.DISPLAY && fs.existsSync('/tmp/.X11-unix/X0')) {
      process.env.DISPLAY = ':0';
    }
    const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
    if (!process.env.WAYLAND_DISPLAY && fs.existsSync(`/run/user/${uid}/wayland-0`)) {
      process.env.WAYLAND_DISPLAY = 'wayland-0';
    }
    if (!process.env.XDG_RUNTIME_DIR && fs.existsSync(`/run/user/${uid}`)) {
      process.env.XDG_RUNTIME_DIR = `/run/user/${uid}`;
    }
    if (!process.env.DBUS_SESSION_BUS_ADDRESS && fs.existsSync(`/run/user/${uid}/bus`)) {
      process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=/run/user/${uid}/bus`;
    }
  }

  let captureMode = resolveLinuxCaptureMode(config, {
    hasXvfb: () => !config.isSteamDeck && hasXvfb(),
    probeKms: () => probeKmsgrabCapability(config.kmsDevice, config, videoEncoder),
    probePipewire: () => probePipewireVideo(config),
    warn: message => logger.warn(message),
  });
  let isXvfb = captureMode === 'xvfb' || captureMode === 'x11grab';

  if (isXvfb) {
    if (process.platform === 'linux') {
      if (hasXvfb()) {
        xvfbProcess = startXvfbServer(xvfbDisplay, captureWidth, captureHeight);
        // Export DISPLAY to process environment so Puppeteer pre-flight check succeeds
        process.env.DISPLAY = xvfbDisplay;
        try {
          const state = await waitForXvfbDisplay(xvfbProcess, xvfbDisplay);
          if (state === 'existing') {
            logger.warn(`An X server is already running on ${xvfbDisplay}; reusing it for capture. Run stop.sh to clear orphaned Xvfb servers.`);
            xvfbProcess = null;
          }
        } catch (err) {
          logger.warn(`${err.message} Falling back to tab capture.`);
          try { xvfbProcess.kill('SIGTERM'); } catch (e) {}
          xvfbProcess = null;
          isXvfb = false;
          captureMode = 'puppeteer-stream';
        }
      } else {
        logger.warn(`Xvfb binary not found on this Linux host (PATH=${process.env.PATH}). Falling back to tab capture. ${XVFB_INSTALL_HINT}`);
        isXvfb = false;
        captureMode = 'puppeteer-stream';
      }
    } else if (process.platform === 'win32') {
      logger.capture('Windows host detected: using gdigrab desktop capture.');
    } else {
      logger.warn(`Xvfb capture mode not supported on ${process.platform}. Falling back to screencast mode.`);
      isXvfb = false;
      captureMode = 'screencast';
    }
  }

  const isPuppeteerStream = !isXvfb && (captureMode === 'puppeteer-stream' || captureMode === 'stream') && puppeteerStream;
  if (!isXvfb && (captureMode === 'puppeteer-stream' || captureMode === 'stream') && !puppeteerStream) {
    logger.warn('puppeteer-stream requested but package not available. Falling back to screencast mode.');
    captureMode = 'screencast';
  }

  const targetUrl = `http://127.0.0.1:${config.port}?iptv`;
  const captureModeName = isXvfb ? 'xvfb' : (isPuppeteerStream ? 'puppeteer-stream' : captureMode);
  const isKms = captureMode === 'kmsgrab';
  const isPipewireVideo = captureMode === 'pipewire';
  if (config.audioMode === 'pipewire') {
    pipewireAudio = process.platform === 'linux' ? preparePipewireAudio(config) : {
      mode: 'browser', warnings: ['PipeWire audio is Linux-only; using browser WebAudio.'],
    };
    for (const warning of pipewireAudio.warnings) logger.warn(warning);
    config.audioMode = pipewireAudio.mode;
  }
  const browserLaunchOptions = buildBrowserLaunchOptions(captureWidth, captureHeight, captureModeName, xvfbDisplay);
  if (pipewireAudio?.sinkName) {
    browserLaunchOptions.env = { ...browserLaunchOptions.env, PULSE_SINK: pipewireAudio.sinkName };
  }

  if (config.outputMode === 'ndi') {
    const hasNdiMuxer = probeNdiCapability(config.ffmpegPath || 'ffmpeg');
    const ndiBridge = resolveNdiBridgePath();
    if (!hasNdiMuxer && !ndiBridge) {
      logger.error('[IPTV] =========================================================================');
      logger.error('[IPTV] NDI ERROR: Neither FFmpeg "libndi_newtek" nor "bin/ndi-bridge" was found.');
      logger.error('[IPTV] To set up NDI support instantly, run:');
      logger.error('[IPTV]   bash scripts/setup-ndi.sh');
      logger.error('[IPTV] See NDI_SETUP.md for complete details.');
      logger.error('[IPTV] =========================================================================');
      throw new Error('NDI not configured. Run "bash scripts/setup-ndi.sh" to build the NDI bridge.');
    }
  }

  let streamOutputPath = '';
  if (config.outputMode === 'hls') {
    const hlsDir = resolveHlsDirectory();
    streamOutputPath = path.resolve(hlsDir, config.hlsPlaylistName).replace(/\\/g, '/');
  } else if (config.outputMode === 'rtmp') {
    streamOutputPath = config.rtmpUrl;
  } else if (config.outputMode === 'udp') {
    streamOutputPath = config.udpUrl;
  } else if (config.outputMode === 'ndi') {
    streamOutputPath = `NDI: "${config.ndiName || 'IntelliSTAR'}"`;
  }

  let hwDetail = '';
  if (config.outputMode === 'ndi') {
    hwDetail = `NDI Raw Frame Stream (${config.ndiPixelFormat || 'uyvy422'}, uncompressed PCM 48kHz audio)`;
  } else if (videoEncoder === 'h264_vaapi' || videoEncoder === 'hevc_vaapi') {
    hwDetail = `AMD VAAPI (${config.vaapiDevice || '/dev/dri/renderD128'})`;
  } else if (videoEncoder === 'h264_nvenc') {
    hwDetail = 'NVIDIA NVENC Hardware';
  } else if (videoEncoder === 'h264_qsv') {
    hwDetail = 'Intel QuickSync Hardware';
  } else if (videoEncoder === 'libx264') {
    hwDetail = `CPU Software (${ffmpegThreads} threads, preset: ${config.x264Preset || 'superfast'})`;
  }

  logger.printConfigCard({
    webServer: targetUrl,
    streamOutput: streamOutputPath,
    preset: config.preset || 'custom',
    presets: config.presets,
    x264Preset: config.x264Preset,
    x264Presets: config.x264Presets,
    videoBitrate: config.outputMode === 'ndi' ? 'Uncompressed (Raw NDI)' : config.videoBitrate,
    resolution: `${captureWidth}x${captureHeight}`,
    fps: config.fps,
    encoder: config.outputMode === 'ndi' ? 'rawvideo (NDI)' : videoEncoder,
    encoderDetail: config.outputMode === 'ndi'
      ? `Raw 4:2:2 -> NewTek NDI (${config.ndiName || 'IntelliSTAR'})`
      : `${config.videoBitrate} ${rateControl(config).mode} (peak ${config.videoMaxrate}) · ${hwDetail}`,
    captureMode: captureModeName,
    captureDetail: config.enableGpu ? 'GPU requested (driver dependent)' : 'Software',
    audioMode: config.audioMode === 'browser' ? 'browser WebAudio' : config.audioMode,
    audioDetail: `Music: ${Math.round((config.musicVolume || 0.5) * 100)}% | Vocal: ${Math.round((config.vocalVolume || 1) * 100)}% | Duck: ${Math.round((config.musicDuckedVolume || 0.2) * 100)}%`,
    hardwareInfo: hwDetail
  });

  logger.browser(`Target URL: ${targetUrl}`);

  if (config.outputMode === 'hls') {
    const hlsDir = resolveHlsDirectory();
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    // Clear stale playlist/segments so FFmpeg does not churn on missing old indices.
    const hlsFiles = fs.readdirSync(hlsDir);
    for (const file of hlsFiles) {
      if (/^index.*\.(m3u8|ts)$/.test(file)) {
        try {
          fs.unlinkSync(path.join(hlsDir, file));
        } catch (e) {}
      }
    }
  }

  // Select the actual tab codec before configuring its decoder; VP8 fallback stays on CPU.
  browser = isPuppeteerStream
    ? ensureStreamBrowserCompatibility(await puppeteerStream.launch(puppeteer, browserLaunchOptions))
    : await puppeteer.launch(browserLaunchOptions);
  browser.on('disconnected', () => {
    if (!shuttingDown) {
      logger.error('Browser disconnected unexpectedly.');
      void cleanup(1);
    }
  });
  const page = await browser.newPage();
  page.on('close', () => {
    if (!shuttingDown) {
      logger.error('Browser page closed unexpectedly.');
      void cleanup(1);
    }
  });
  page.on('error', (err) => {
    if (!shuttingDown) {
      logger.error(`Browser page error: ${err.message}`);
      void cleanup(1);
    }
  });
  attachPageDiagnostics(page);
  // Under Xvfb Chromium may silently land on llvmpipe; surface the renderer so 4K stalls are diagnosable.
  const glRenderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  }).catch(() => null);
  if (glRenderer) {
    const msg = `Chromium GL renderer: ${glRenderer}`;
    if (/llvmpipe|swiftshader|softpipe/i.test(glRenderer)) logger.warn(`${msg} (software rendering; expect dropped frames at high resolutions)`);
    else logger.browser(msg);
  }
  let tabMimeType = null;
  if (isPuppeteerStream) {
    const requestedCodec = config.captureVideoCodec === 'vp8' ? 'vp8' : 'h264';
    tabMimeType = await page.evaluate(({ codec, audio }) => {
      const suffix = audio ? ',opus' : '';
      return [`video/webm;codecs=${codec}${suffix}`, `video/webm;codecs=vp8${suffix}`, 'video/webm']
        .find(type => MediaRecorder.isTypeSupported(type));
    }, { codec: requestedCodec, audio: config.audioMode === 'browser' });
    if (!tabMimeType) throw new Error('No supported WebM MediaRecorder codec found.');
  }
  const hardwareDecode = Boolean(config.hardwareDecode && isPuppeteerStream &&
    tabMimeType.includes('h264') && isVaapi(videoEncoder) && probeHardwareDecode(videoEncoder));
  if (isPuppeteerStream) logger.capture(`Tab decoder: ${hardwareDecode ? 'VAAPI (GPU surfaces kept through encoding)' : 'CPU (bounded threads)'}`);

  // Build FFmpeg Arguments based on target output mode
  // Bounded queues avoid seconds of stale full-resolution frames and memory spikes.
  const threadQueueSize = String(Math.max(8, config.maxCaptureQueue));
  const mjpegThreads = ffmpegThreads;
  let ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-stats', '-stats_period', '30',
    '-y',
    '-fflags', '+genpts+discardcorrupt',
    '-filter_threads', String(ffmpegThreads),
    '-thread_queue_size', threadQueueSize,
  ];

  if (videoEncoder === 'h264_vaapi' || videoEncoder === 'hevc_vaapi') {
    ffmpegArgs.push('-vaapi_device', config.vaapiDevice || '/dev/dri/renderD128');
  }

  let audioMap = '1:a:0';

  if (isKms || isPipewireVideo || isXvfb) {
    // External KMS/PipeWire capture, X11 virtual framebuffer, or Windows GDI grab
    if (isKms) {
      const kmsQueue = String(Math.max(1024, config.maxCaptureQueue * 64));
      ffmpegArgs.push(...kmsgrabInputArgs(config, kmsQueue));
    } else if (isPipewireVideo) {
      ffmpegArgs.push(...pipewireInputArgs(config, threadQueueSize));
    } else if (process.platform === 'linux') {
      ffmpegArgs.push(
        '-f', 'x11grab',
        '-draw_mouse', '0',
        '-framerate', `${config.fps}`,
        '-video_size', `${captureWidth}x${captureHeight}`,
        '-i', `${xvfbDisplay}.0+0,0`
      );
    } else if (process.platform === 'win32') {
      ffmpegArgs.push(
        '-f', 'gdigrab',
        '-draw_mouse', '0',
        '-framerate', `${config.fps}`,
        '-video_size', `${captureWidth}x${captureHeight}`,
        '-i', 'desktop'
      );
    }
  } else if (isPuppeteerStream) {
    // puppeteer-stream provides a continuous WebM/Matroska container on stdin
    if (hardwareDecode) ffmpegArgs.push('-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi');
    ffmpegArgs.push(
      '-thread_queue_size', threadQueueSize,
      '-f', 'matroska,webm',
      '-threads', String(ffmpegThreads),
      '-i', '-' // video (and audio if browser mode) from stdin
    );
  } else {
    // Legacy screencast / screenshot mode: image2pipe on stdin + optional WebAudio on pipe:3
    ffmpegArgs.push(
      '-thread_queue_size', threadQueueSize,
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-threads', `${mjpegThreads}`,
      '-framerate', `${config.fps}`,
      '-i', '-', // video input from stdin
    );
  }

  // Select audio once, after video input 0. Only tab capture bundles browser audio.
  if (config.audioMode === 'browser') {
    if (isPuppeteerStream) {
      audioMap = '0:a:0';
      logger.audio('[IPTV] Audio mode: browser (bundled inside puppeteer-stream WebM)');
    } else {
      audioPipe = new PassThrough({ highWaterMark: 2097152 });
      logger.audio('[IPTV] Audio mode: browser (live WebAudio capture via pipe:3)');
      ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', 'matroska,webm', '-i', 'pipe:3');
    }
  } else if (config.audioMode === 'pipewire') {
    logger.audio(`[IPTV] Audio mode: PipeWire (${pipewireAudio.target})`);
    ffmpegArgs.push(...pipewireAudioArgs(pipewireAudio.target, isKms ? '1024' : '128'));
  } else if (config.audioMode === 'file') {
    const audioFilePath = path.resolve(__dirname, config.audioFile);
    if (fs.existsSync(audioFilePath)) {
      ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-stream_loop', '-1', '-i', audioFilePath);
    } else {
      logger.warn(`[IPTV] Audio file not found (${audioFilePath}); falling back to silent audio.`);
      ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    }
  } else if (config.audioMode === 'system') {
    if (process.platform === 'win32') {
      let audioDev = config.audioDevice;
      const available = getWindowsDshowAudioDevices();
      if (available.length > 0 && !available.includes(audioDev)) {
        logger.warn(`[IPTV] Configured audio device "${audioDev}" not found.`);
        const nonMics = available.filter((d) => !/mic|microphone/i.test(d));
        const match = nonMics.find((d) => /virtual|stereo mix|wave out|cable|what u hear|stream/i.test(d));
        if (match) {
          logger.audio(`[IPTV] Auto-selected loopback audio capture device: "${match}"`);
          audioDev = match;
        }
      }
      logger.audio(`[IPTV] Using DirectShow audio device: "${audioDev}"`);
      ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', 'dshow', '-i', `audio=${audioDev}`);
    } else {
      const linuxDevice = process.env.STREAM_AUDIO_DEVICE || config.linuxAudioDevice || 'default';
      ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', config.linuxAudioBackend || 'alsa', '-i', linuxDevice);
    }
  } else {
    ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  }

  const isNdiBridge = config.outputMode === 'ndi' && !probeNdiCapability(config.ffmpegPath || 'ffmpeg');

  if (!isNdiBridge) {
    ffmpegArgs.push(
      '-map', '0:v:0',
      '-map', audioMap
    );
  }

  if (config.outputMode === 'ndi') {
    if (!isNdiBridge) {
      ffmpegArgs.push(
        '-c:v', 'rawvideo',
        '-pix_fmt', config.ndiPixelFormat || 'uyvy422',
        '-c:a', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '2',
        '-max_muxing_queue_size', '4096'
      );
    }
  } else {
    ffmpegArgs.push(
      '-c:v', videoEncoder
    );

    if (videoEncoder !== 'h264_vaapi' && videoEncoder !== 'hevc_vaapi') {
      ffmpegArgs.push('-pix_fmt', outputPixelFormat);
    }

    const rates = rateControl(config);
    const gop = keyframeFrames(config);
    ffmpegArgs.push(
      '-b:v', String(rates.target),
      '-maxrate', String(rates.maxrate),
      '-bufsize', String(rates.bufsize),
      '-threads', String(ffmpegThreads),
      '-c:a', 'aac',
      '-b:a', config.audioBitrate,
      '-ar', '48000',
      '-ac', '2',
      '-af', 'aresample=async=1:first_pts=0',
      // HLS keyframes align with segment boundaries; RTMP presets may use shorter intervals.
      '-g', `${gop}`,
      '-keyint_min', `${gop}`,
      '-sc_threshold', '0',
      '-max_muxing_queue_size', '4096'
    );

    if (isKms) {
      ffmpegArgs.push('-r', String(config.fps), '-fps_mode', 'cfr');
    }

    if (videoEncoder === 'libx264') {
      const x264Preset = config.x264Preset || (isArm ? 'ultrafast' : 'superfast');
      // Respect the chosen preset instead of disabling AQ/deblocking and damaging text/gradients.
      ffmpegArgs.push(
        '-preset', x264Preset,
        '-tune', 'zerolatency',
        '-profile:v', 'main',
        '-x264-params',
        `threads=${ffmpegThreads}:scenecut=0:open-gop=0`
      );
    } else if (videoEncoder === 'h264_vaapi' || videoEncoder === 'hevc_vaapi') {
      ffmpegArgs.push(...vaapiEncoderArgs(config, videoEncoder));
      logger.stream(`[IPTV] Utilizing AMD VAAPI hardware encoder (${videoEncoder}) via ${config.vaapiDevice || '/dev/dri/renderD128'}`);
    } else if (videoEncoder === 'h264_nvenc') {
      ffmpegArgs.push('-preset', 'p1', '-tune', 'll', '-rc', rates.mode.toLowerCase(), '-delay', '0', '-zerolatency', '1', '-profile:v', 'high');
    } else if (videoEncoder === 'h264_qsv') {
      ffmpegArgs.push(
        '-preset', config.qsvPreset || 'medium',
        '-profile:v', 'high',
        '-look_ahead', '0',
        '-async_depth', `${config.qsvAsyncDepth || 4}`,
        '-forced_idr', '1'
      );
    } else if (videoEncoder === 'h264_amf') {
      ffmpegArgs.push('-quality', 'speed', '-usage', 'lowlatency');
    }
  }

  ffmpegArgs.push('-vf', videoFilter(config, config.outputMode === 'ndi' ? 'rawvideo' : videoEncoder, hardwareDecode, isKms ? 'drm_prime' : 'raw'), '-stats');

  let outputPath = '';
  if (config.outputMode === 'hls') {
    const hlsDir = resolveHlsDirectory();
    const hlsPath = path.resolve(hlsDir, config.hlsPlaylistName).replace(/\\/g, '/');
    const hlsSegmentPattern = path.resolve(hlsDir, 'index%d.ts').replace(/\\/g, '/');
    const hlsFlags = 'delete_segments+omit_endlist+independent_segments+temp_file';
    outputPath = hlsPath;
    ffmpegArgs.push(
      '-f', 'hls',
      '-hls_time', `${config.hlsSegmentTime}`,
      '-hls_list_size', `${config.hlsListSize}`,
      '-hls_segment_filename', hlsSegmentPattern,
      '-hls_flags', hlsFlags,
      '-hls_delete_threshold', '1',
      '-hls_allow_cache', '0',
      hlsPath
    );
  } else if (config.outputMode === 'rtmp') {
    outputPath = config.rtmpUrl;
    ffmpegArgs.push('-f', 'flv', config.rtmpUrl);
  } else if (config.outputMode === 'udp') {
    outputPath = config.udpUrl;
    ffmpegArgs.push('-f', 'mpegts', config.udpUrl);
  } else if (config.outputMode === 'ndi') {
    outputPath = config.ndiName || 'IntelliSTAR';
    if (probeNdiCapability(config.ffmpegPath || 'ffmpeg')) {
      ffmpegArgs.push('-f', 'libndi_newtek', outputPath);
    } else {
      ffmpegArgs.push(
        '-map', '0:v:0',
        '-c:v', 'rawvideo',
        '-pix_fmt', config.ndiPixelFormat || 'uyvy422',
        '-f', 'rawvideo', 'pipe:1',
        '-map', audioMap,
        '-c:a', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '2',
        '-f', 's16le', 'udp://127.0.0.1:18890'
      );
    }
  }

  logger.stream(`Starting FFmpeg process (${config.outputMode.toUpperCase()}, ${config.outputMode === 'ndi' ? 'rawvideo' : videoEncoder}) -> ${outputPath}`);
  const ffmpegStdio = (config.audioMode === 'browser' && audioPipe)
    ? ['pipe', 'pipe', 'pipe', 'pipe']
    : ['pipe', 'pipe', 'pipe'];

  ffmpeg = spawn(config.ffmpegPath || 'ffmpeg', ffmpegArgs, { stdio: ffmpegStdio });

  if (config.outputMode === 'ndi' && !probeNdiCapability(config.ffmpegPath || 'ffmpeg')) {
    const bridgePath = resolveNdiBridgePath();
    const bridgeArgs = [
      '--name', config.ndiName || 'IntelliSTAR',
      '--width', String(captureWidth),
      '--height', String(captureHeight),
      '--fps', String(config.targetFps || 30),
      '--pixfmt', config.ndiPixelFormat || 'uyvy422',
      '--audio-port', '18890',
    ];
    logger.stream(`[IPTV] Spawning NDI bridge: ${bridgePath} ${bridgeArgs.join(' ')}`);
    ndiBridgeProcess = spawn(bridgePath, bridgeArgs, {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    ffmpeg.stdout.pipe(ndiBridgeProcess.stdin);
    ndiBridgeProcess.on('error', (err) => {
      logger.error(`[IPTV] NDI bridge process error: ${err.message}`);
      if (!shuttingDown) void cleanup(1);
    });
    ndiBridgeProcess.on('close', (code) => {
      logger.stream(`[IPTV] NDI bridge exited with code ${code}`);
      if (!shuttingDown) void cleanup(1);
    });
  }

  ffmpeg.on('error', (err) => {
    logger.error(`FFmpeg process error: ${err.message}`);
    if (!shuttingDown) void cleanup(1);
  });
  ffmpeg.on('close', (code) => {
    logger.stream(`FFmpeg exited with code ${code}`);
    if (!shuttingDown) void cleanup(1);
  });

  if (ffmpeg.stdin) {
    ffmpeg.stdin.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
        logger.error(`FFmpeg stdin error: ${err.message}`);
      }
    });
  }

  if (config.audioMode === 'browser' && audioPipe) {
    audioPipe.on('error', (err) => {
      if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
        logger.error(`Audio pipe error: ${err.message}`);
      }
    });

    if (ffmpeg.stdio[3]) {
      ffmpeg.stdio[3].on('error', (err) => {
        if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
          logger.error(`FFmpeg audio pipe error: ${err.message}`);
        }
      });
      audioPipe.pipe(ffmpeg.stdio[3]);
    }
  }

  // Buffer partial lines from FFmpeg stderr so progress updates and errors
  // are printed cleanly without mid-line splits.
  let ffmpegStderrBuf = '';
  let lastProgressLog = 0;
  ffmpeg.stderr.on('data', (data) => {
    ffmpegStderrBuf += data.toString();
    const lines = ffmpegStderrBuf.split(/[\r\n]+/);
    const endsWithNewline = /[\r\n]$/.test(ffmpegStderrBuf);
    if (!endsWithNewline) {
      ffmpegStderrBuf = lines.pop() || '';
    } else {
      ffmpegStderrBuf = '';
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Always log errors.
      if ((trimmed.includes('Error') || trimmed.includes('fail')) && !trimmed.includes('failed to delete old segment')) {
        logger.error(`FFmpeg: ${trimmed}`);
        continue;
      }
      // Log progress stats (frame=, fps=, bitrate=, speed=)
      if (/^frame=/.test(trimmed)) {
        const now = Date.now();
        const minInterval = logger.isDashboardEnabled() ? 150 : config.logProgressIntervalMs;
        if (now - lastProgressLog >= minInterval) {
          lastProgressLog = now;
          logger.formatFFmpegProgress(trimmed);
        }
      }
    }
  });

  await page.evaluateOnNewDocument((streamConf) => {
    window.__iptvAudioConfig = streamConf.audioConfig;
    window.__iptvLazyMaps = streamConf.lazyLoadMaps;
    if (typeof window.audioSettings !== 'undefined') {
      if (streamConf.audioConfig.musicVolume !== undefined) window.audioSettings.musicVolume = streamConf.audioConfig.musicVolume;
      if (streamConf.audioConfig.vocalVolume !== undefined) window.audioSettings.vocalVolume = streamConf.audioConfig.vocalVolume;
      if (streamConf.audioConfig.musicDuckedVolume !== undefined) window.audioSettings.musicDuckedVolume = streamConf.audioConfig.musicDuckedVolume;
    }

  }, {
    audioConfig: {
      musicVolume: config.musicVolume,
      vocalVolume: config.vocalVolume,
      musicDuckedVolume: config.musicDuckedVolume,
    },
    lazyLoadMaps: config.lazyLoadMaps,
    rafThrottle: config.rafThrottle,
    isXvfb: isXvfb,
    fps: config.fps,
  });

  // KMS/PipeWire still render to a real display at its native refresh rate; throttling
  // requestAnimationFrame to the target output FPS avoids wasted GPU work/heat there too.
  if (config.rafThrottle) await page.evaluateOnNewDocument(installRafThrottle, config.fps);

  if (config.audioMode === 'browser' && audioPipe && !isPuppeteerStream) {
    await page.exposeFunction('sendAudioChunk', (base64Data) => {
      if (audioPipe && !audioPipe.destroyed && !shuttingDown) {
        try {
          audioPipe.write(Buffer.from(base64Data, 'base64'));
        } catch (e) {}
      }
    });
  }
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  logger.standby('Live capture active (Color bars & calibration tone active during load)');

  const frameInterval = 1000 / config.fps;
  let framesCaptured = 0;
  let repeatedFrames = 0;
  const captureStartedAt = Date.now();

  const stopCapture = () => {
    capturing = false;
  };

  page.on('close', stopCapture);
  page.on('error', stopCapture);
  browser.on('disconnected', stopCapture);

  // Non-blocking frame writer with backpressure protection
  const maxQueueLimit = Math.max(5, config.maxCaptureQueue || 10);
  const writeFrame = (buffer) => {
    if (!ffmpeg || !ffmpeg.stdin || !ffmpeg.stdin.writable || shuttingDown) return false;
    if (ffmpeg.stdin.writableLength > maxQueueLimit * buffer.length) return false;
    try {
      return ffmpeg.stdin.write(buffer);
    } catch (e) {
      return false;
    }
  };

  const isPipeBackpressured = () => {
    if (!ffmpeg || !ffmpeg.stdin || !ffmpeg.stdin.writable) return true;
    return ffmpeg.stdin.writableLength > maxQueueLimit * 100000;
  };

  const logCaptureHealth = () => {
    const elapsedSec = Math.max(0.1, (Date.now() - captureStartedAt) / 1000);
    const actualFps = (framesCaptured / elapsedSec).toFixed(1);
    const repeatPct = framesCaptured > 0 ? ((repeatedFrames / framesCaptured) * 100).toFixed(0) : '0';
    logger.updateCaptureStats({
      status: 'streaming',
      mode: captureMode,
      frames: framesCaptured.toLocaleString(),
      avgFps: actualFps,
      repeatedPct: `${repeatPct}%`,
      decoder: hardwareDecode ? 'VAAPI' : 'CPU',
    });
    if (framesCaptured === 30 || framesCaptured === 60 || framesCaptured === 150 || (framesCaptured > 0 && framesCaptured % 300 === 0)) {
      if (!logger.isDashboardEnabled()) {
        logger.capture(`Health: ${framesCaptured.toLocaleString()} frames | ${actualFps} fps avg | ${repeatPct}% repeated`);
      }
    }
  };

  const captureLoop = async () => {
    const loopStartTime = Date.now();
    let targetFrames = 0;
    while (capturing) {
      if (!isPipeBackpressured()) {
        try {
          const screenshot = await page.screenshot({
            type: 'jpeg',
            quality: config.screenshotQuality,
            optimizeForSpeed: config.screenshotOptimizeForSpeed,
          });
          if (writeFrame(screenshot)) {
            framesCaptured++;
            logCaptureHealth();
          }
        } catch (err) {
          if (!capturing) break;
          if (err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
            logger.error('Capture session ended; stopping capture loop.');
            capturing = false;
            break;
          }
          logger.error(`Capture Error: ${err.message}`);
        }
      }
      targetFrames++;
      const nextTime = (targetFrames * 1000) / config.fps;
      const wait = Math.max(0, nextTime - (Date.now() - loopStartTime));
      await new Promise((r) => setTimeout(r, wait));
    }
  };

  let latestFrameBuffer = null;
  let hasFreshFrame = false;

  if (isKms || isPipewireVideo) {
    if (shuttingDown) return;
    logger.capture(`External ${captureMode} capture active (no CDP/screenshot capture)`);
    if (isPipewireVideo) {
      if (config.pipewireVideoNode) {
        pipewireProcess = spawn('gst-launch-1.0', pipewireVideoArgs(config), {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        logger.capture('[IPTV] Launching PipeWire ScreenCast portal bridge...');
        const portalScript = path.resolve(__dirname, 'scripts/pipewire-screencast.py');
        pipewireProcess = spawn('python3', [portalScript], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            STREAM_WIDTH: String(captureWidth),
            STREAM_HEIGHT: String(captureHeight),
            STREAM_FPS: String(config.fps),
          },
        });
      }
      pipewireProcess.on('error', (err) => {
        logger.error(`PipeWire video process error: ${err.message}`);
        if (!shuttingDown) void cleanup(1);
      });
      pipewireProcess.on('close', (code, signal) => {
        logger.capture(`PipeWire video process exited with code ${code}${signal ? ` (${signal})` : ''}`);
        if (!shuttingDown) void cleanup(1);
      });
      pipewireProcess.stderr.on('data', (data) => {
        const diagnostic = data.toString().trim();
        if (diagnostic) logger.warn(`PipeWire video: ${diagnostic}`);
      });
      pipewireProcess.stdout.on('error', (err) => {
        logger.error(`PipeWire video pipe error: ${err.message}`);
        if (!shuttingDown) void cleanup(1);
      });
      // Native stream piping pauses the producer when FFmpeg applies backpressure.
      pipewireProcess.stdout.pipe(ffmpeg.stdin);
    }
  } else if (isXvfb) {
    logger.capture(`Direct display capture running (${process.platform === 'linux' ? `x11grab on ${xvfbDisplay}` : 'gdigrab on desktop'})`);
    logger.capture('Chromium rendering directly to virtual framebuffer (zero JPEG/CDP overhead)');
  } else if (isPuppeteerStream) {
    const isBrowserAudio = config.audioMode === 'browser';
    logger.capture(`Initializing puppeteer-stream tab capture (${captureWidth}x${captureHeight}@${config.fps}fps, audio: ${isBrowserAudio})...`);

    try {
      logger.capture(`Tab capture codec: ${tabMimeType}. Browser encoding may use CPU even when FFmpeg uses VAAPI.`);
      tabStream = await puppeteerStream.getStream(page, {
        audio: isBrowserAudio,
        video: true,
        mimeType: tabMimeType,
        frameSize: 250,
        videoBitsPerSecond: captureBitrate(config),
        audioBitsPerSecond: 192000,
        videoConstraints: {
          mandatory: {
            minWidth: captureWidth,
            minHeight: captureHeight,
            maxWidth: captureWidth,
            maxHeight: captureHeight,
            maxFrameRate: config.fps,
          },
        },
      });

      let captureBytes = 0;
      let captureChunks = 0;
      const captureStartTime = Date.now();
      let lastCaptureFpsCalcTime = captureStartTime;
      let lastCaptureBytes = 0;
      let currentThroughputMbps = '0.0 Mbps';

      tabStream.on('data', (chunk) => {
        captureBytes += chunk.length;
        captureChunks++;
        const now = Date.now();
        if (now - lastCaptureFpsCalcTime >= 1000) {
          const deltaSec = (now - lastCaptureFpsCalcTime) / 1000;
          const deltaBytes = captureBytes - lastCaptureBytes;
          currentThroughputMbps = `${((deltaBytes * 8) / (deltaSec * 1000000)).toFixed(1)} Mbps`;
          lastCaptureBytes = captureBytes;
          lastCaptureFpsCalcTime = now;
        }
        logger.updateCaptureStats({
          status: 'streaming',
          mode: 'puppeteer-stream',
          chunks: captureChunks,
          bytes: captureBytes,
          throughput: currentThroughputMbps,
          decoder: hardwareDecode ? 'VAAPI (GPU surfaces kept through encoding)' : 'CPU (bounded threads)',
        });
      });

      tabStream.on('error', (err) => {
        if (!shuttingDown) {
          logger.error(`IPTV Stream Pipe Error: ${err.message}`);
        }
      });

      tabStream.pipe(ffmpeg.stdin);
      logger.capture('puppeteer-stream active and piped to FFmpeg stdin', logger.c.green('●'));
    } catch (err) {
      logger.error(`IPTV Stream Error: Could not start tab stream: ${err.message}`);
      throw err;
    }
  } else if (captureMode === 'screencast') {
    cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: config.screenshotQuality,
      maxWidth: captureWidth,
      maxHeight: captureHeight,
      everyNthFrame: 1,
    });

    cdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
      try {
        // Ack immediately so Chromium compositor is never blocked
        await cdpSession.send('Page.screencastFrameAck', { sessionId });

        if (!capturing || shuttingDown) {
          return;
        }

        latestFrameBuffer = Buffer.from(data, 'base64');
        hasFreshFrame = true;
      } catch (err) {
        if (capturing) {
          if (err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
            logger.error('[IPTV] Screencast session ended; stopping capture.');
            capturing = false;
            return;
          }
          logger.error(`[IPTV Screencast Error] ${err.message}`);
        }
      }
    });

    // High-precision catch-up frame pacer:
    // Ensures exactly (elapsed_ms * fps / 1000) frames are sent to image2pipe.
    // Even if Node timer or GC has slight jitter, it immediately catches up
    // so video PTS never drifts against WebAudio PTS.
    const pacerStartTime = Date.now();
    let targetFramesCount = 0;

    const pump = () => {
      if (!capturing || shuttingDown) return;

      const now = Date.now();
      const elapsedMs = Math.max(0, now - pacerStartTime);
      const expectedFrames = Math.floor((elapsedMs * config.fps) / 1000);

      if (latestFrameBuffer) {
        while (targetFramesCount <= expectedFrames && !shuttingDown) {
          const frameToWrite = latestFrameBuffer;
          const fresh = hasFreshFrame;
          hasFreshFrame = false;

          try {
            if (writeFrame(frameToWrite)) {
              framesCaptured++;
              if (!fresh) repeatedFrames++;
              logCaptureHealth();
            }
          } catch (err) {
            if (capturing && err && /Target closed|Session closed|Protocol error/i.test(err.message)) {
              logger.error('[IPTV] Screencast writer ended; stopping capture.');
              capturing = false;
              return;
            }
          }
          targetFramesCount++;
        }
      }

      const nextFrameTime = ((targetFramesCount + 1) * 1000) / config.fps;
      const delay = Math.max(1, Math.min(frameInterval, nextFrameTime - (Date.now() - pacerStartTime)));
      screencastWriterTimer = setTimeout(pump, delay);
    };
    screencastWriterTimer = setTimeout(pump, Math.max(1, Math.round(frameInterval)));
  } else {
    captureLoop();
  }

  // Periodic memory hygiene & health monitor (every 10 minutes)
  gcInterval = setInterval(async () => {
    if (!capturing || shuttingDown) return;
    try {
      if (page && !page.isClosed()) {
        await page.evaluate(() => {
          if (typeof window.releaseUnusedMemory === 'function') window.releaseUnusedMemory();
          if (typeof window.gc === 'function') window.gc();
        });
      }
      if (global.gc) global.gc();
      const mem = process.memoryUsage();
      const freeMb = Math.round(os.freemem() / (1024 * 1024));
      const rssMb = Math.round(mem.rss / (1024 * 1024));
      const heapMb = Math.round(mem.heapUsed / (1024 * 1024));
      logger.log('SYSTEM', `Memory: Node RSS ${rssMb}MB | Heap ${heapMb}MB | Free System RAM ${freeMb}MB`);
    } catch (e) {}
  }, 10 * 60 * 1000);

  // Periodic HLS stale segment pruner (runs every 30s to keep RAM cache pristine)
  if (config.outputMode === 'hls') {
    const hlsDir = resolveHlsDirectory();
    const maxAgeMs = Math.max(60000, ((config.hlsSegmentTime || 4) * (config.hlsListSize || 8) * 2) * 1000);
    hlsPruneInterval = setInterval(() => {
      if (shuttingDown) return;
      try {
        if (!fs.existsSync(hlsDir)) return;
        const now = Date.now();
        const files = fs.readdirSync(hlsDir);
        for (const file of files) {
          if (/^index\d+\.ts$/.test(file)) {
            const filePath = path.join(hlsDir, file);
            try {
              const stat = fs.statSync(filePath);
              // Delete segments older than retention window
              if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }, 30000);
  }
}

if (require.main === module) {
  startStreaming().catch((err) => {
    logger.error(`IPTV Fatal Error: ${err.message || err}`);
    if (fatalCleanup) return fatalCleanup(1);
    process.exit(1);
  });
}

module.exports = { resolveVideoEncoder, probeHardwareDecode, buildBrowserLaunchOptions, hasXvfb, startXvfbServer, waitForXvfbDisplay, probeNdiCapability };
