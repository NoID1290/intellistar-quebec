// =============================================================================
// IntelliSTAR Simulator — Stream & IPTV Configuration
// =============================================================================
// Easily customize stream resolution, frame rate, bitrate, audio, and encoders.
// Edit the USER CONFIGURATION section below to change your settings.
// =============================================================================

const fs = require('fs');

// Hardware platform detection helpers
const isArm = process.arch === 'arm' || process.arch === 'arm64';
const isLinux = process.platform === 'linux';

function detectSteamDeck() {
  if (process.platform !== 'linux') return false;
  if (process.env.USER === 'deck' || (process.env.HOME && process.env.HOME.includes('/deck'))) return true;
  try {
    if (fs.existsSync('/sys/devices/virtual/dmi/id/product_name')) {
      const prod = fs.readFileSync('/sys/devices/virtual/dmi/id/product_name', 'utf8').toLowerCase();
      if (prod.includes('jupiter') || prod.includes('galileo') || prod.includes('steamdeck')) return true;
    }
  } catch (e) {}
  try {
    if (fs.existsSync('/etc/os-release')) {
      const osRel = fs.readFileSync('/etc/os-release', 'utf8').toLowerCase();
      if (osRel.includes('steamos')) return true;
    }
  } catch (e) {}
  return false;
}

const isSteamDeck = detectSteamDeck();

// =============================================================================
// 1. PRIMARY USER CONFIGURATION (Edit your settings here)
// =============================================================================
const userConfig = {
  // ---------------------------------------------------------------------------
  // RESOLUTION & PRESET
  // ---------------------------------------------------------------------------
  // Available presets:
  //   - 'deck-uhd'        : 3840x2160 @ 30, 16000k VBR (Steam Deck 4K)
  //   - 'deck-uhd-smooth' : 3840x2160 @ 60, 25000k VBR (Steam Deck 4K motion)
  //   - 'deck-kms'        : 1920x1080 @ 60, 8000k VAAPI, KMS video + PipeWire audio
  //   - 'deck-quality' : 1920x1080 @ 30, 20000k VBR source (10000k CBR when outputMode is 'rtmp')
  //   - 'deck-smooth'  : 1280x720 @ 60, 5000k VBR (smoother motion)
  //   - 'deck'         : 1280x720 @ 30, 3500k VBR (lowest Deck load)
  //   - '1080p'     : 1920x1080 (Full HD, 3500k bitrate) [Recommended for desktop / TV]
  //   - '720p'      : 1280x720  (HD, 2500k bitrate)
  //   - 'deck-800p' : 1280x800  (Steam Deck 16:10 native screen)
  //   - '1440p'     : 2560x1440 (2K QHD, 6000k bitrate)
  //   - '4k'        : 3840x2160 (4K UHD, 12000k bitrate)
  //   - '480p'      : 854x480   (SD, 1500k bitrate)
  preset: isSteamDeck ? 'deck-quality' : 'deck-quality',

  // null = preset frame rate. 30 reduces capture/render work; 60 favors motion.
  fps: null,

  // Custom Resolution (optional: leave null to use preset width/height)
  // Example: width: 1920, height: 1080
  width: null,
  height: null,

  // Separate Output Scaling (optional: leave null to match capture resolution)
  // Example: render at 1080p but downscale output stream to 720p
  outputWidth: null,
  outputHeight: null,

  // ---------------------------------------------------------------------------
  // ENCODING & BITRATES
  // ---------------------------------------------------------------------------
  // Video Bitrate (optional: leave null to automatically use preset default)
  // Examples: '3500k', '5000k', '2500k'
  videoBitrate: null,
  videoMaxrate: null, // null = preset peak rate; e.g. '8000k' or '8M'
  videoBufsize: null, // null = twice target bitrate (two-second VBV buffer)

  // Keyframe interval in seconds. null = preset/output policy (HLS segment length; 2s for deck-quality RTMP)
  keyframeSeconds: null,

  // Audio Bitrate (AAC): '128k', '192k', '256k'
  audioBitrate: '128k',

  // Video Encoder:
  //   - 'auto'       : Auto-detects best available encoder (VAAPI on AMD/Deck, NVENC, QSV, AMF, libx264)
  //   - 'h264_vaapi' : Hardware encoding on Steam Deck (AMD APU) and Linux Intel/AMD GPU
  //   - 'hevc_vaapi' : HEVC/H.265; requires compatible players (prefer H.264 for HLS/RTMP)
  //   - 'libx264'    : Software CPU encoding (balanced for multi-threaded CPUs)
  videoEncoder: 'h264_vaapi',
  // null = preset policy. Deck presets fail rather than silently overload the CPU.
  allowSoftwareFallback: null,
  ffmpegThreads: null, // null = preset budget; Deck reserves CPU for Chromium

  // DRM Render device node for VAAPI hardware encoding
  vaapiDevice: '/dev/dri/renderD128',

  // Software encoder preset (libx264): 'ultrafast', 'superfast', 'veryfast', 'faster', 'fast'
  // Quality preset for x264 software encoding: 'ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'
  x264Preset: isSteamDeck ? 'fast' : (isArm ? 'ultrafast' : 'veryfast'), 
  //x264Preset: 'fast',

  // VAAPI has no portable 'fast/medium/slow' preset. Let the driver pick quality.
  vaapiAsyncDepth: 4,

  // Intel Quick Sync (QSV) tuning
  qsvPreset: 'fast',
  qsvAsyncDepth: 4,

  // ---------------------------------------------------------------------------
  // CAPTURE ENGINE
  // ---------------------------------------------------------------------------
  // Capture Mode:
  //   - 'auto'             : Xvfb when installed on Linux; otherwise tab capture
  //   - 'puppeteer-stream' : Compressed tab capture with native WebAudio
  //   - 'screencast'       : Chrome DevTools Protocol screencast frame stream
  //   - 'xvfb'             : Linux X11 direct shared memory capture (zero CDP overhead)
  //   - 'kmsgrab'          : Linux DRM/KMS scanout capture
  //   - 'pipewire'         : PipeWire video node capture
  //   - 'screenshot'       : Legacy frame-by-frame screenshot loop
  captureMode: null, // null = preset policy; existing presets retain puppeteer-stream
  captureVideoCodec: 'h264', // Try low-complexity H.264; fall back to VP8 if unsupported
  captureVideoBitrate: null, // Intermediate capture: preset value, else at least twice output target
  hardwareDecode: false, // Probe VAAPI H.264 tab decoding; fall back to CPU if unavailable

  // Virtual display for Xvfb capture mode
  xvfbDisplay: ':99',

  // KMS captures active scanout, not Xvfb's software framebuffer.
  kmsDevice: '/dev/dri/card0',
  kmsCrtc: null, // Optional unsigned 32-bit integer (number or decimal string)
  kmsPlane: null, // Optional unsigned 32-bit integer (number or decimal string)
  kmsHeadlessXvfb: false, // Helper flag only; Xvfb alone cannot provide KMS scanout
  pipewireVideoNode: null, // Optional unsigned 32-bit node ID; exported as a string
  pipewirePortal: false, // Automatically request screen-sharing session via XDG Desktop Portal
  ffmpegPath: null, // Custom FFmpeg binary path (e.g. dedicated binary with CAP_SYS_ADMIN)

  // Screencast JPEG quality (1-100) and dropped frame queue limit
  screenshotQuality: 85,
  maxCaptureQueue: 300,

  // GPU Hardware Acceleration in Headless Chrome (recommended: true)
  enableGpu: true,

  // Pre-cached 2D Canvas pipeline for radar Doppler maps
  lazyLoadMaps: false,

  // Throttle requestAnimationFrame to stream target FPS
  rafThrottle: null, // Deck presets cap JavaScript animation callbacks at output FPS

  // Path to custom Chrome/Chromium binary (optional, null = auto-detect)
  browserExecutablePath: null,

  // ---------------------------------------------------------------------------
  // AUDIO CONFIGURATION
  // ---------------------------------------------------------------------------
  // Audio Mode:
  //   - 'browser' : Live WebAudio (background music + vocal narrations + EAS alert sounds)
  //   - 'pipewire': PipeWire audio via an optionally isolated sink
  //   - 'file'    : Loop a local audio file
  //   - 'system'  : Capture system audio loopback (PulseAudio/PipeWire/ALSA/DirectShow)
  //   - 'silent'  : No audio
  audioMode: null, // null = preset policy; browser except for deck-kms
  audioFile: './webroot/music/custom/Track 1.wav',
  audioDevice: 'virtual-audio-capturer',
  linuxAudioBackend: isSteamDeck ? 'pulse' : 'alsa',
  linuxAudioDevice: 'default',
  pipewireAudioSink: 'IntelliStar_Audio', // Only letters, digits, underscore, dot, hyphen
  pipewireAudioIsolate: true,

  // Audio Mix Levels (0.0 = silent, 1.0 = 100%, >1.0 = boosted)
  musicVolume: 0.5,
  vocalVolume: 1.0,
  musicDuckedVolume: 0.2,

  // ---------------------------------------------------------------------------
  // OUTPUT & STREAMING
  // ---------------------------------------------------------------------------
  // Target output: 'hls' (HTTP Live Streaming), 'rtmp', 'udp', or 'ndi' (Network Device Interface)
  outputMode: 'hls',

  // NDI Output Configuration (used when outputMode is 'ndi')
  ndiName: 'IntelliSTAR',
  ndiPixelFormat: 'uyvy422',

  // HLS RAM-Disk Cache (tmpfs):
  // Eliminates SSD write wear by saving stream chunks directly to RAM (/dev/shm on Linux).
  useRamCache: isLinux,
  ramCacheDirectory: isLinux ? '/dev/shm/intelli-stream' : 'R:/intelli-cache',

  // Standard HLS directory (used when useRamCache is false or on Windows fallback)
  hlsDirectory: './stream-cache',
  hlsPlaylistName: 'index.m3u8',
  hlsSegmentTime: 4,  // seconds per segment
  hlsListSize: 8,     // number of segments kept in playlist (~32-48s buffer)

  // RTMP / UDP URLs (used when outputMode is 'rtmp' or 'udp')
  rtmpUrl: 'rtmp://localhost/live/intellistar',
  udpUrl: 'udp://239.255.42.42:1234?pkt_size=1316',

  // Web Server Port
  port: 7070,
  autoStartServer: true,
};

const X264_PRESETS = [
  'ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'
];

function optionalUint32(value, name) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' && typeof value !== 'number')
      || String(value).length === 0 || /[^0-9]/.test(String(value))
      || !Number.isInteger(Number(value)) || Number(value) > 4294967295
      || Object.is(value, -0)) {
    throw new Error(`${name} must be an unsigned 32-bit integer (0..4294967295).`);
  }
  return Number(value);
}

// Explicit false must override user defaults. Reject typos rather than enabling isolation accidentally.
function booleanOption(value, fallback, name) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string' && ['true', 'false'].includes(value.toLowerCase())) return value.toLowerCase() === 'true';
  throw new Error(`${name} must be true or false.`);
}

function safeSinkName(value) {
  if (typeof value !== 'string' || value.length === 0 || /[^A-Za-z0-9_.-]/.test(value)) {
    throw new Error('STREAM_PIPEWIRE_AUDIO_SINK must contain only letters, digits, underscore, dot, or hyphen.');
  }
  return value;
}

// =============================================================================
// 2. PRESET RESOLUTION & BITRATE MAP
// =============================================================================
const PRESET_MAP = {
  'deck-uhd':        { width: 3840, height: 2160, fps: 30, bitrate: '16000k', maxrate: '22000k', deck: true, threads: 3 },
  'deck-uhd-smooth': { width: 3840, height: 2160, fps: 60, bitrate: '25000k', maxrate: '34000k', deck: true, threads: 3 },
  'deck-kms':        { width: 1920, height: 1080, fps: 60, bitrate: '8000k', videoEncoder: 'h264_vaapi',
                       captureMode: 'kmsgrab', audioMode: 'pipewire', deck: true, threads: 2 },
  // 'rtmp' follows YouTube's 1080p30 H.264 ingest guidance (10 Mbps CBR, 2s keyframes).
  // Preserve the user's former explicit tab-capture default now that captureMode is nullable.
  'deck-quality':    { width: 1920, height: 1080, fps: 30, bitrate: '6000k', maxrate: '9000k', deck: true, captureMode: 'puppeteer-stream',
                       captureBitrate: '40000k', rtmp: { bitrate: '10000k', maxrate: '10000k', keyframeSeconds: 2 } },
  'deck-smooth':     { width: 1280, height: 720,  fps: 60, bitrate: '5000k',  maxrate: '6500k',  deck: true },
  '1080p-60fps': { width: 1920, height: 1080, fps: 60, bitrate: '8000k' },
  '720p-60fps':  { width: 1280, height: 720, fps: 60, bitrate: '5000k' },
  '1440p-60fps': { width: 2560, height: 1440, fps: 60, bitrate: '12000k' },
  '4k-60fps':    { width: 3840, height: 2160, fps: 60, bitrate: '24000k' },
  '1080p':     { width: 1920, height: 1080, bitrate: '10000k' },
  '1080':      { width: 1920, height: 1080, bitrate: '3500k' },
  'fhd':       { width: 1920, height: 1080, bitrate: '3500k' },
  '720p':      { width: 1280, height: 720,  bitrate: '2500k' },
  '720':       { width: 1280, height: 720,  bitrate: '2500k' },
  'hd':        { width: 1280, height: 720,  bitrate: '2500k' },
  'deck':      { width: 1280, height: 720, fps: 30, bitrate: '3500k', maxrate: '4500k', deck: true },
  'deck-720p': { width: 1280, height: 720, fps: 30, bitrate: '3500k', maxrate: '4500k', deck: true },
  'deck-800p': { width: 1280, height: 800, fps: 30, bitrate: '4000k', maxrate: '5000k', deck: true },
  '800p':      { width: 1280, height: 800,  bitrate: '2800k' },
  '1440p':     { width: 2560, height: 1440, bitrate: '6000k' },
  '2k':        { width: 2560, height: 1440, bitrate: '6000k' },
  'qhd':       { width: 2560, height: 1440, bitrate: '6000k' },
  '4k':        { width: 3840, height: 2160, bitrate: '12000k' },
  '2160p':     { width: 3840, height: 2160, bitrate: '12000k' },
  'uhd':       { width: 3840, height: 2160, bitrate: '12000k' },
  '480p':      { width: 854,  height: 480,  bitrate: '1500k' },
  'sd':        { width: 854,  height: 480,  bitrate: '1500k' },
};

// =============================================================================
// 3. RESOLUTION RESOLVER (Env vars > User Config > Presets > Defaults)
// =============================================================================
const rawPreset = (process.env.STREAM_PRESET || userConfig.preset || '1080p').toLowerCase();
if (!PRESET_MAP[rawPreset]) {
  throw new Error(`Unknown STREAM_PRESET '${rawPreset}'. Available: ${Object.keys(PRESET_MAP).join(', ')}`);
}
const presetData = PRESET_MAP[rawPreset] || PRESET_MAP['1080p'];
const deckTuning = isSteamDeck || presetData.deck === true;
const outputMode = process.env.STREAM_MODE || userConfig.outputMode || 'hls';
// Output-specific preset overrides (e.g. RTMP ingest rules) layer over the base preset.
const presetOutput = { ...presetData, ...(presetData[outputMode] || {}) };
const hlsSegmentTime = process.env.STREAM_HLS_SEGMENT_TIME
  ? parseInt(process.env.STREAM_HLS_SEGMENT_TIME, 10)
  : (userConfig.hlsSegmentTime || 4);

// Capture dimensions
const captureWidth = process.env.STREAM_WIDTH
  ? parseInt(process.env.STREAM_WIDTH, 10)
  : (userConfig.width || presetData.width);

const captureHeight = process.env.STREAM_HEIGHT
  ? parseInt(process.env.STREAM_HEIGHT, 10)
  : (userConfig.height || presetData.height);

// Output dimensions (defaults to capture dimensions)
const outputWidth = process.env.STREAM_OUTPUT_WIDTH
  ? parseInt(process.env.STREAM_OUTPUT_WIDTH, 10)
  : (userConfig.outputWidth || (process.env.STREAM_WIDTH ? parseInt(process.env.STREAM_WIDTH, 10) : captureWidth));

const outputHeight = process.env.STREAM_OUTPUT_HEIGHT
  ? parseInt(process.env.STREAM_OUTPUT_HEIGHT, 10)
  : (userConfig.outputHeight || (process.env.STREAM_HEIGHT ? parseInt(process.env.STREAM_HEIGHT, 10) : captureHeight));

// Video bitrate
const videoBitrate = process.env.STREAM_VIDEO_BITRATE
  || userConfig.videoBitrate
  || presetOutput.bitrate
  || (captureWidth <= 1280 ? '2500k' : '3500k');

// FPS
const fps = process.env.STREAM_FPS
  ? parseInt(process.env.STREAM_FPS, 10)
  : (userConfig.fps || presetData.fps || 30);

const pipewireVideoNode = optionalUint32(process.env.STREAM_PIPEWIRE_NODE ?? userConfig.pipewireVideoNode,
  'STREAM_PIPEWIRE_NODE');

// =============================================================================
// 4. EXPORTED CONFIGURATION OBJECT
// =============================================================================
module.exports = {
  // Server port
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : (userConfig.port || 7070),
  autoStartServer: userConfig.autoStartServer !== undefined ? userConfig.autoStartServer : true,

  // Hardware Flags
  isSteamDeck,
  isArm,

  // Preset & Resolution
  preset: rawPreset,
  width: captureWidth,
  height: captureHeight,
  captureWidth,
  captureHeight,
  outputWidth,
  outputHeight,
  fps,

  // Quality & Bitrates
  videoBitrate,
  videoMaxrate: process.env.STREAM_VIDEO_MAXRATE || userConfig.videoMaxrate
    || ((process.env.STREAM_VIDEO_BITRATE || userConfig.videoBitrate) ? videoBitrate : presetOutput.maxrate) || videoBitrate,
  videoBufsize: process.env.STREAM_VIDEO_BUFSIZE || userConfig.videoBufsize || null,
  keyframeSeconds: process.env.STREAM_KEYFRAME_INTERVAL !== undefined
    ? Number(process.env.STREAM_KEYFRAME_INTERVAL)
    : (userConfig.keyframeSeconds ?? presetOutput.keyframeSeconds ?? hlsSegmentTime),
  ffmpegThreads: Math.max(1, parseInt(process.env.STREAM_FFMPEG_THREADS || userConfig.ffmpegThreads || presetData.threads || (deckTuning ? 2 : 4), 10) || 2),
  allowSoftwareFallback: process.env.STREAM_ALLOW_SOFTWARE_FALLBACK !== undefined
    ? process.env.STREAM_ALLOW_SOFTWARE_FALLBACK.toLowerCase() === 'true'
    : (userConfig.allowSoftwareFallback ?? !deckTuning),
  audioBitrate: process.env.STREAM_AUDIO_BITRATE || userConfig.audioBitrate || '128k',
  screenshotQuality: process.env.STREAM_SCREENSHOT_QUALITY !== undefined
    ? parseInt(process.env.STREAM_SCREENSHOT_QUALITY, 10)
    : (userConfig.screenshotQuality || 85),
  screenshotOptimizeForSpeed: true,

  // Capture Engine
  // Environment > explicit user setting > preset > legacy tab-capture default.
  captureMode: process.env.STREAM_CAPTURE_MODE || userConfig.captureMode || presetData.captureMode || 'puppeteer-stream',
  captureVideoCodec: process.env.STREAM_CAPTURE_VIDEO_CODEC || userConfig.captureVideoCodec || 'h264',
  captureVideoBitrate: process.env.STREAM_CAPTURE_VIDEO_BITRATE || userConfig.captureVideoBitrate || presetData.captureBitrate || null,
  hardwareDecode: process.env.STREAM_HARDWARE_DECODE !== undefined
    ? process.env.STREAM_HARDWARE_DECODE.toLowerCase() === 'true' : userConfig.hardwareDecode,
  xvfbDisplay: process.env.XVFB_DISPLAY || userConfig.xvfbDisplay || ':99',
  kmsDevice: process.env.STREAM_KMS_DEVICE || userConfig.kmsDevice || '/dev/dri/card0',
  kmsCrtc: optionalUint32(process.env.STREAM_KMS_CRTC ?? userConfig.kmsCrtc, 'STREAM_KMS_CRTC'),
  kmsPlane: optionalUint32(process.env.STREAM_KMS_PLANE ?? userConfig.kmsPlane, 'STREAM_KMS_PLANE'),
  kmsHeadlessXvfb: booleanOption(process.env.STREAM_KMS_HEADLESS_XVFB ?? userConfig.kmsHeadlessXvfb,
    false, 'STREAM_KMS_HEADLESS_XVFB'),
  pipewireVideoNode: pipewireVideoNode === null ? null : String(pipewireVideoNode),
  pipewirePortal: booleanOption(process.env.STREAM_PIPEWIRE_PORTAL ?? userConfig.pipewirePortal,
    false, 'STREAM_PIPEWIRE_PORTAL'),
  ffmpegPath: process.env.STREAM_FFMPEG_PATH || userConfig.ffmpegPath || 'ffmpeg',
  maxCaptureQueue: process.env.STREAM_MAX_CAPTURE_QUEUE
    ? parseInt(process.env.STREAM_MAX_CAPTURE_QUEUE, 10)
    : (userConfig.maxCaptureQueue || 10),

  // Performance Flags
  lazyLoadMaps: userConfig.lazyLoadMaps ?? false,
  enableGpu: process.env.STREAM_ENABLE_GPU !== undefined
    ? (process.env.STREAM_ENABLE_GPU.toLowerCase() !== 'false')
    : (userConfig.enableGpu !== undefined ? userConfig.enableGpu : !isArm),
  rafThrottle: process.env.STREAM_RAF_THROTTLE !== undefined
    ? (process.env.STREAM_RAF_THROTTLE.toLowerCase() === 'true')
    : (userConfig.rafThrottle ?? deckTuning),

  // Console Logging Mode
  logMode: `${process.env.STREAM_LOG_MODE || 'auto'}`.toLowerCase(),
  logDashboardRefreshMs: Math.max(100, parseInt(process.env.STREAM_LOG_DASHBOARD_REFRESH_MS || '250', 10) || 250),
  logDashboardEventLimit: Math.max(5, Math.min(20, parseInt(process.env.STREAM_LOG_DASHBOARD_EVENT_LIMIT || '10', 10) || 10)),
  logProgressIntervalMs: Math.max(500, parseInt(process.env.STREAM_LOG_PROGRESS_INTERVAL_MS || '5000', 10) || 5000),

  // Presets & Tunings Reference
  presets: PRESET_MAP,
  x264Presets: X264_PRESETS,

  // Video Encoders & Hardware Tuning
  videoEncoder: process.env.STREAM_VIDEO_ENCODER || userConfig.videoEncoder || presetData.videoEncoder || 'h264_vaapi',
  vaapiDevice: process.env.STREAM_VAAPI_DEVICE || userConfig.vaapiDevice || '/dev/dri/renderD128',
  vaapiAsyncDepth: Math.min(64, Math.max(1, parseInt(process.env.STREAM_VAAPI_ASYNC_DEPTH || userConfig.vaapiAsyncDepth || 4, 10) || 4)),
  qsvPreset: process.env.STREAM_QSV_PRESET || userConfig.qsvPreset || 'fast',
  qsvAsyncDepth: Math.max(1, parseInt(process.env.STREAM_QSV_ASYNC_DEPTH || `${userConfig.qsvAsyncDepth || 4}`, 10) || 4),
  x264Preset: process.env.STREAM_X264_PRESET || userConfig.x264Preset || (isSteamDeck ? 'superfast' : (isArm ? 'ultrafast' : 'veryfast')),

  // Audio Configuration
  audioMode: process.env.STREAM_AUDIO_MODE || userConfig.audioMode || presetData.audioMode || 'browser',
  pipewireAudioSink: safeSinkName(process.env.STREAM_PIPEWIRE_AUDIO_SINK ?? userConfig.pipewireAudioSink ?? 'IntelliStar_Audio'),
  pipewireAudioIsolate: booleanOption(process.env.STREAM_PIPEWIRE_AUDIO_ISOLATE ?? userConfig.pipewireAudioIsolate,
    true, 'STREAM_PIPEWIRE_AUDIO_ISOLATE'),
  audioFile: process.env.STREAM_AUDIO_FILE || userConfig.audioFile || './webroot/music/custom/Track 1.wav',
  audioDevice: process.env.STREAM_AUDIO_DEVICE || userConfig.audioDevice || 'virtual-audio-capturer',
  musicVolume: process.env.STREAM_MUSIC_VOLUME !== undefined
    ? parseFloat(process.env.STREAM_MUSIC_VOLUME)
    : userConfig.musicVolume,
  vocalVolume: process.env.STREAM_VOCAL_VOLUME !== undefined
    ? parseFloat(process.env.STREAM_VOCAL_VOLUME)
    : userConfig.vocalVolume,
  musicDuckedVolume: process.env.STREAM_MUSIC_DUCKED_VOLUME !== undefined
    ? parseFloat(process.env.STREAM_MUSIC_DUCKED_VOLUME)
    : userConfig.musicDuckedVolume,
  linuxAudioBackend: process.env.STREAM_AUDIO_BACKEND || userConfig.linuxAudioBackend || (isSteamDeck ? 'pulse' : 'alsa'),
  linuxAudioDevice: process.env.STREAM_AUDIO_DEVICE || userConfig.linuxAudioDevice || 'default',

  // Browser Path Override
  browserExecutablePath: process.env.STREAM_BROWSER_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || userConfig.browserExecutablePath || null,

  // Stream Output Target
  outputMode,
  ndiName: process.env.STREAM_NDI_NAME || userConfig.ndiName || 'IntelliSTAR',
  ndiPixelFormat: process.env.STREAM_NDI_PIXEL_FORMAT || userConfig.ndiPixelFormat || 'uyvy422',
  useRamCache: process.env.STREAM_USE_RAM_CACHE !== undefined
    ? (process.env.STREAM_USE_RAM_CACHE.toLowerCase() === 'true')
    : userConfig.useRamCache,
  ramCacheDirectory: process.env.STREAM_RAM_CACHE_DIRECTORY || userConfig.ramCacheDirectory,
  hlsDirectory: process.env.STREAM_HLS_DIRECTORY || userConfig.hlsDirectory || './stream-cache',
  hlsPlaylistName: userConfig.hlsPlaylistName || 'index.m3u8',
  hlsSegmentTime,
  hlsListSize: process.env.STREAM_HLS_LIST_SIZE
    ? parseInt(process.env.STREAM_HLS_LIST_SIZE, 10)
    : (userConfig.hlsListSize || 8),
  rtmpUrl: process.env.RTMP_URL || userConfig.rtmpUrl || 'rtmp://localhost/live/intellistar',
  udpUrl: process.env.UDP_URL || userConfig.udpUrl || 'udp://239.255.42.42:1234?pkt_size=1316',
};

