const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { bitrateBits, normalizeEncoder, rateControl, keyframeFrames, captureBitrate, vaapiEncoderArgs, videoFilter } = require('../stream-encoding');
const { installRafThrottle, ensureStreamBrowserCompatibility } = require('../stream-browser');

const base = {
  captureWidth: 1920, captureHeight: 1080, outputWidth: 1920, outputHeight: 1080,
  fps: 30, videoBitrate: '6000k', videoMaxrate: '8M', vaapiAsyncDepth: 4,
};

function loadConfig(overrides) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('STREAM_')));
  const result = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./stream-config')))"], {
    cwd: path.resolve(__dirname, '..'), env: { ...env, ...overrides }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('bitrate parser handles FFmpeg units and rejects invalid rates', () => {
  assert.equal(bitrateBits('6M'), 6000000);
  assert.equal(bitrateBits('3500k'), 3500000);
  assert.equal(bitrateBits('1.5M'), 1500000);
  assert.equal(bitrateBits('192000'), 192000);
  for (const value of ['0', '-2k', 'NaN', '3mbps']) assert.throws(() => bitrateBits(value));
  assert.deepEqual(rateControl(base), { target: 6000000, maxrate: 8000000, bufsize: 12000000, mode: 'VBR' });
  assert.throws(() => rateControl({ ...base, videoMaxrate: '1M' }));
  assert.equal(rateControl({ ...base, videoMaxrate: '6M', videoBufsize: '9M' }).mode, 'CBR');
  assert.equal(rateControl({ ...base, videoBufsize: '9M' }).bufsize, 9000000);
});

test('Deck presets carry frame rate, quality, and low-CPU defaults', () => {
  for (const [preset, width, fps, bitrate, maxrate, threads, captureMode] of [
    // Preserve the checked-in user tuning rather than restoring older defaults.
    ['deck-quality', 1920, 30, '6000k', '9000k', 2, 'puppeteer-stream'],
    ['deck-kms', 1920, 60, '8000k', '8000k', 2, 'kmsgrab'],
    ['deck-smooth', 1280, 60, '5000k', '6500k', 2, 'puppeteer-stream'],
    ['deck', 1280, 30, '3500k', '4500k', 2, 'puppeteer-stream'],
    ['deck-uhd', 3840, 30, '16000k', '22000k', 3, 'puppeteer-stream'],
    ['deck-uhd-smooth', 3840, 60, '25000k', '34000k', 3, 'puppeteer-stream'],
  ]) {
    const c = loadConfig({ STREAM_PRESET: preset });
    assert.equal(c.captureWidth, width);
    assert.equal(c.fps, fps);
    assert.equal(c.videoBitrate, bitrate);
    assert.equal(c.videoMaxrate, maxrate);
    assert.equal(c.captureMode, captureMode);
    assert.equal(c.ffmpegThreads, threads);
    assert.equal(c.allowSoftwareFallback, false);
    assert.equal(c.rafThrottle, true);
  }
  assert.equal(loadConfig({ STREAM_PRESET: '1080p-60fps' }).fps, 60);
  assert.equal(loadConfig({ STREAM_PRESET: 'deck-uhd', STREAM_CAPTURE_MODE: 'auto' }).captureMode, 'auto');
  assert.equal(loadConfig({ STREAM_PRESET: 'deck-quality', STREAM_CAPTURE_MODE: 'puppeteer-stream' }).captureMode, 'puppeteer-stream');
  assert.equal(loadConfig({ STREAM_PRESET: 'deck-uhd', STREAM_FFMPEG_THREADS: '2' }).ffmpegThreads, 2);
});

test('deck-quality follows YouTube ingest rules on RTMP and stays a high-bitrate source on HLS', () => {
  const hls = loadConfig({ STREAM_PRESET: 'deck-quality' });
  assert.equal(hls.outputMode, 'hls');
  assert.equal(hls.keyframeSeconds, 4);
  assert.equal(hls.captureVideoBitrate, '40000k');
  assert.equal(keyframeFrames(hls), 120);
  assert.equal(captureBitrate(hls), 40000000);
  assert.equal(rateControl(hls).mode, 'VBR');

  const rtmp = loadConfig({ STREAM_PRESET: 'deck-quality', STREAM_MODE: 'rtmp' });
  assert.equal(rtmp.videoBitrate, '10000k');
  assert.equal(rtmp.videoMaxrate, '10000k');
  assert.equal(rtmp.keyframeSeconds, 2);
  assert.equal(rtmp.captureVideoBitrate, '40000k');
  assert.deepEqual(rateControl(rtmp), { target: 10000000, maxrate: 10000000, bufsize: 20000000, mode: 'CBR' });
  assert.equal(keyframeFrames(rtmp), 60);

  // Explicit overrides still win, and RTMP tuning does not leak into other presets.
  const custom = loadConfig({ STREAM_PRESET: 'deck-quality', STREAM_MODE: 'rtmp', STREAM_VIDEO_BITRATE: '12M',
    STREAM_KEYFRAME_INTERVAL: '1', STREAM_CAPTURE_VIDEO_BITRATE: '30M', STREAM_HLS_SEGMENT_TIME: '6' });
  assert.equal(custom.videoBitrate, '12M');
  assert.equal(custom.videoMaxrate, '12M');
  assert.equal(custom.keyframeSeconds, 1);
  assert.equal(custom.captureVideoBitrate, '30M');
  assert.equal(keyframeFrames(custom), 30);
  const deck = loadConfig({ STREAM_PRESET: 'deck', STREAM_MODE: 'rtmp', STREAM_HLS_SEGMENT_TIME: '6' });
  assert.equal(deck.videoBitrate, '3500k');
  assert.equal(deck.keyframeSeconds, 6);
  assert.equal(deck.captureVideoBitrate, null);
  assert.equal(captureBitrate(deck), 8000000);
  assert.equal(captureBitrate(loadConfig({ STREAM_PRESET: 'deck-uhd' })), 32000000);
});

test('keyframe interval rejects unusable values', () => {
  for (const keyframeSeconds of [0, -1, NaN, 11, 0.01]) {
    assert.throws(() => keyframeFrames({ ...base, keyframeSeconds }));
  }
  assert.equal(keyframeFrames({ ...base, keyframeSeconds: undefined, hlsSegmentTime: 4 }), 120);
  assert.equal(keyframeFrames({ ...base, keyframeSeconds: 2.5 }), 75);
});

test('environment overrides preset settings without retaining an invalid lower peak', () => {
  const c = loadConfig({ STREAM_PRESET: 'deck', STREAM_FPS: '24', STREAM_VIDEO_BITRATE: '9M',
    STREAM_CAPTURE_MODE: 'screenshot', STREAM_RAF_THROTTLE: 'false', STREAM_ALLOW_SOFTWARE_FALLBACK: 'true',
    STREAM_HARDWARE_DECODE: 'false' });
  assert.equal(c.fps, 24);
  assert.equal(c.videoMaxrate, '9M');
  assert.equal(c.captureMode, 'screenshot');
  assert.equal(c.rafThrottle, false);
  assert.equal(c.allowSoftwareFallback, true);
  assert.equal(c.hardwareDecode, false);
});

test('VAAPI codec names and quality settings match FFmpeg', () => {
  assert.equal(normalizeEncoder('h265_vaapi'), 'hevc_vaapi');
  assert.equal(normalizeEncoder('h264_vaapi'), 'h264_vaapi');
  const args = vaapiEncoderArgs(base, 'h264_vaapi');
  assert.equal(args[args.indexOf('-profile:v') + 1], 'high');
  assert.equal(args[args.indexOf('-bf') + 1], '0');
  assert.equal(args[args.indexOf('-rc_mode') + 1], 'VBR');
  assert.equal(vaapiEncoderArgs(base, 'hevc_vaapi')[3], 'main');
});

test('matching dimensions skip scaling; frame pacing precedes upload', () => {
  assert.equal(videoFilter(base, 'h264_vaapi'), 'fps=fps=30:round=near,hwupload,scale_vaapi=format=nv12');
  assert.equal(videoFilter(base, 'h264_vaapi', true), 'fps=fps=30:round=near');
  assert.equal(videoFilter(base, 'libx264'), 'fps=fps=30:round=near,format=yuv420p');
  const uhd = { ...base, captureWidth: 3840, captureHeight: 2160, outputWidth: 3840, outputHeight: 2160, fps: 60 };
  assert.equal(videoFilter(uhd, 'h264_vaapi'), 'fps=fps=60:round=near,hwupload,scale_vaapi=format=nv12');
});

test('same-aspect resizing uses GPU; aspect changes retain letterboxing', () => {
  const smaller = { ...base, outputWidth: 1280, outputHeight: 720 };
  assert.equal(videoFilter(smaller, 'h264_vaapi'), 'fps=fps=30:round=near,hwupload,scale_vaapi=w=1280:h=720:format=nv12:mode=hq');
  assert.equal(videoFilter(smaller, 'h264_vaapi', true), 'fps=fps=30:round=near,scale_vaapi=w=1280:h=720:format=nv12:mode=hq');
  const padded = videoFilter({ ...smaller, outputHeight: 800 }, 'h264_vaapi', true);
  assert.match(padded, /hwdownload,format=nv12,scale=/);
  assert.match(padded, /pad=1280:800/);
  assert.match(padded, /format=nv12,hwupload$/);
  assert.match(videoFilter({ ...smaller, outputHeight: 800 }, 'h264_vaapi'), /^fps=fps=30:round=near,scale=.*pad=1280:800.*format=nv12,hwupload$/);
  assert.throws(() => videoFilter({ ...base, outputWidth: 1279 }, 'h264_vaapi'));
  assert.throws(() => videoFilter({ ...base, fps: NaN }, 'h264_vaapi'));
});

test('RAF callbacks share native frames, respect cancellation, and stop when idle', () => {
  const previousWindow = global.window;
  const nativeCallbacks = new Map();
  let nativeId = 0;
  global.window = {
    requestAnimationFrame: callback => { nativeCallbacks.set(++nativeId, callback); return nativeId; },
    cancelAnimationFrame: id => nativeCallbacks.delete(id),
  };
  const frame = time => {
    const batch = [...nativeCallbacks.values()];
    nativeCallbacks.clear();
    batch.forEach(callback => callback(time));
  };
  try {
    installRafThrottle(30);
    const seen = [];
    let cancelId;
    window.requestAnimationFrame(t => { seen.push(t); window.cancelAnimationFrame(cancelId); });
    cancelId = window.requestAnimationFrame(() => assert.fail('cancelled callback ran'));
    window.requestAnimationFrame(t => { seen.push(t); window.requestAnimationFrame(t => seen.push(t)); });
    assert.equal(nativeCallbacks.size, 1);
    frame(0);
    assert.deepEqual(seen, [0, 0]);
    frame(16.667);
    assert.equal(seen.length, 2);
    frame(33.333);
    assert.deepEqual(seen, [0, 0, 33.333]);
    assert.equal(nativeCallbacks.size, 0);
    const id = window.requestAnimationFrame(() => assert.fail('cancelled idle callback ran'));
    window.cancelAnimationFrame(id);
    assert.equal(nativeCallbacks.size, 0);
  } finally { global.window = previousWindow; }
});

test('puppeteer-stream connectivity compatibility follows current browser state', () => {
  const browser = ensureStreamBrowserCompatibility({ connected: true });
  assert.equal(browser.isConnected(), true);
  browser.connected = false;
  assert.equal(browser.isConnected(), false);
  const existing = () => true;
  assert.equal(ensureStreamBrowserCompatibility({ isConnected: existing }).isConnected, existing);
});

test('NDI output mode configures stream name, pixel format, and uyvy422 video filter', () => {
  const ndiDefault = loadConfig({ STREAM_MODE: 'ndi' });
  assert.equal(ndiDefault.outputMode, 'ndi');
  assert.equal(ndiDefault.ndiName, 'IntelliSTAR');
  assert.equal(ndiDefault.ndiPixelFormat, 'uyvy422');

  const ndiCustom = loadConfig({
    STREAM_MODE: 'ndi',
    STREAM_NDI_NAME: 'CustomWeather',
    STREAM_NDI_PIXEL_FORMAT: 'bgra',
  });
  assert.equal(ndiCustom.outputMode, 'ndi');
  assert.equal(ndiCustom.ndiName, 'CustomWeather');
  assert.equal(ndiCustom.ndiPixelFormat, 'bgra');

  // Video filter in NDI mode formats for uyvy422 without hardware upload
  const filterDefault = videoFilter({ ...base, outputMode: 'ndi', ndiPixelFormat: 'uyvy422' }, 'rawvideo');
  assert.equal(filterDefault, 'fps=fps=30:round=near,format=uyvy422');

  const filterBgra = videoFilter({ ...base, outputMode: 'ndi', ndiPixelFormat: 'bgra' }, 'rawvideo');
  assert.equal(filterBgra, 'fps=fps=30:round=near,format=bgra');

  // NDI with resize includes scaling and target pixel format
  const filterResize = videoFilter({ ...base, outputWidth: 1280, outputHeight: 720, outputMode: 'ndi' }, 'rawvideo');
  assert.match(filterResize, /scale=1280:720.*format=uyvy422/);
});