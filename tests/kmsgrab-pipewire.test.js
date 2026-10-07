const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { videoFilter, isKmsgrab, isPipewire } = require('../stream-encoding');
const { kmsgrabInputArgs, probeKmsgrabCapability, pipewireVideoArgs, pipewireInputArgs,
  probePipewireVideo, setupPipewireAudioSink, cleanupPipewireAudioSink, pipewireAudioArgs,
  preparePipewireAudio, resolveLinuxCaptureMode } = require('../stream-linux-capture');

const base = { captureWidth: 1920, captureHeight: 1080, outputWidth: 1920, outputHeight: 1080,
  fps: 60, videoBitrate: '8000k', pipewireVideoNode: '42', kmsDevice: '/dev/dri/card1',
  pipewireAudioSink: 'IntelliStar_Audio', pipewireAudioIsolate: true, linuxAudioDevice: 'default' };

function loadConfig(overrides, valid = true) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('STREAM_')));
  const result = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./stream-config')))"], {
    cwd: path.resolve(__dirname, '..'), env: { ...env, ...overrides }, encoding: 'utf8',
  });
  if (!valid) { assert.notEqual(result.status, 0); return result.stderr; }
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('deck-kms preset selects both engines and preserves environment overrides', () => {
  const c = loadConfig({ STREAM_PRESET: 'deck-kms' });
  assert.equal(c.captureMode, 'kmsgrab');
  assert.equal(c.audioMode, 'pipewire');
  assert.equal(c.videoEncoder, 'h264_vaapi');
  assert.equal(c.captureWidth, 1920);
  assert.equal(c.captureHeight, 1080);
  assert.equal(c.fps, 60);
  assert.equal(c.videoBitrate, '8000k');
  assert.equal(c.allowSoftwareFallback, false);
  assert.equal(c.kmsCrtc, null);
  assert.equal(c.kmsPlane, null);
  assert.equal(c.pipewireVideoNode, null);
  assert.equal(c.pipewireAudioSink, 'IntelliStar_Audio');
  assert.equal(c.pipewireAudioIsolate, true);
  assert.equal(c.kmsHeadlessXvfb, false);
  const overridden = loadConfig({ STREAM_PRESET: 'deck-kms', STREAM_CAPTURE_MODE: 'pipewire',
    STREAM_KMS_DEVICE: '/dev/dri/card2', STREAM_KMS_CRTC: '0', STREAM_KMS_PLANE: '4294967295',
    STREAM_KMS_HEADLESS_XVFB: 'true', STREAM_PIPEWIRE_NODE: '008', STREAM_AUDIO_MODE: 'pipewire',
    STREAM_PIPEWIRE_AUDIO_ISOLATE: 'false', STREAM_PIPEWIRE_AUDIO_SINK: 'Custom_Sink.1' });
  assert.equal(overridden.captureMode, 'pipewire');
  assert.equal(overridden.kmsDevice, '/dev/dri/card2');
  assert.equal(overridden.kmsCrtc, 0);
  assert.equal(overridden.kmsPlane, 4294967295);
  assert.equal(overridden.kmsHeadlessXvfb, true);
  assert.equal(overridden.pipewireVideoNode, '8');
  assert.equal(overridden.pipewireAudioIsolate, false);
  assert.equal(overridden.pipewireAudioSink, 'Custom_Sink.1');
  assert.equal(loadConfig({ STREAM_CAPTURE_MODE: 'kmsgrab', STREAM_AUDIO_MODE: 'browser' }).captureMode, 'kmsgrab');
});

test('configuration rejects malformed KMS IDs, node IDs, sink names and boolean flags', () => {
  for (const name of ['STREAM_KMS_CRTC', 'STREAM_KMS_PLANE', 'STREAM_PIPEWIRE_NODE']) {
    for (const value of ['-1', '1.5', '23junk', '4294967296', '']) {
      assert.match(loadConfig({ [name]: value }, false), /unsigned 32-bit/);
    }
  }
  assert.match(loadConfig({ STREAM_PIPEWIRE_AUDIO_SINK: 'sink name' }, false), /STREAM_PIPEWIRE_AUDIO_SINK/);
  assert.match(loadConfig({ STREAM_KMS_HEADLESS_XVFB: 'yes' }, false), /must be true or false/);
  assert.match(loadConfig({ STREAM_PIPEWIRE_AUDIO_ISOLATE: 'no' }, false), /must be true or false/);
});

test('KMS argument builder validates IDs without partial parsing and preserves optional zero', () => {
  const args = kmsgrabInputArgs({ ...base, kmsCrtc: 0, kmsPlane: 15 });
  assert.deepEqual(args, ['-device', '/dev/dri/card1', '-f', 'kmsgrab', '-crtc_id', '0', '-plane_id', '15',
    '-framerate', '60', '-thread_queue_size', '32', '-i', '-']);
  assert.ok(!kmsgrabInputArgs(base).includes('-plane_id'));
  assert.ok(!args.includes('-nodisplay')); // Not a kmsgrab input option.
  for (const value of [-1, -0, 1.5, NaN, Infinity, '3x', '', 4294967296]) {
    for (const key of ['kmsCrtc', 'kmsPlane']) assert.throws(() => kmsgrabInputArgs({ ...base, [key]: value }));
  }
});

test('DRM VAAPI stays on GPU while software uses supported read mapping', () => {
  for (const encoder of ['h264_vaapi', 'hevc_vaapi']) {
    assert.equal(videoFilter(base, encoder, false, 'drm_prime'),
      'hwmap=derive_device=vaapi,scale_vaapi=w=1920:h=1080:format=nv12:mode=hq');
    const padded = videoFilter({ ...base, captureHeight: 1200 }, encoder, false, 'drm_prime');
    assert.match(padded, /hwmap=derive_device=vaapi,scale_vaapi=w=\d+:h=\d+:format=nv12:mode=hq,pad_vaapi=w=1920:h=1080/);
    assert.doesNotMatch(padded, /hwdownload|hwupload/);
  }
  const software = videoFilter(base, 'libx264', false, 'drm_prime');
  assert.match(software, /^hwmap=mode=read,format=bgr0,format=yuv420p,scale=1920:1080/);
  assert.doesNotMatch(software, /hwdownload|hwupload/);
  assert.equal(isKmsgrab('kmsgrab'), true);
  assert.equal(isKmsgrab('xvfb'), false);
  assert.equal(isPipewire('pipewire'), true);
  assert.equal(isPipewire('puppeteer-stream'), false);
});

test('KMS probes are bounded, distinguish permission failures, and test real mapping/encoding', () => {
  const calls = [];
  const run = (command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; };
  assert.deepEqual(probeKmsgrabCapability(base.kmsDevice, base, null, run), { available: true });
  assert.ok(calls[0].args.includes('copy'));
  assert.equal(calls[0].options.timeout, 8000);
  assert.deepEqual(probeKmsgrabCapability(base.kmsDevice, base, 'h264_vaapi', run), { available: true });
  assert.ok(calls[1].args.includes(videoFilter({ ...base, fps: 1 }, 'h264_vaapi', false, 'drm_prime')));
  for (const stderr of ['Permission denied', 'Operation not permitted', 'EPERM', 'No handle set on framebuffer: maybe you need some additional capabilities?']) {
    assert.equal(probeKmsgrabCapability(base.kmsDevice, base, null, () => ({ status: 1, stderr })).error, 'CAP_SYS_ADMIN required');
  }
  assert.equal(probeKmsgrabCapability(base.kmsDevice, base, null, () => ({ status: null, error: new Error('timeout') })).available, false);
});

test('PipeWire GStreamer fixes raw frame layout and preflights one frame without stdout video', () => {
  const args = pipewireVideoArgs(base);
  assert.ok(args.includes('path=42'));
  assert.ok(args.includes('name=intellistar_capture'));
  assert.ok(args.includes('video/x-raw,format=BGRx,width=1920,height=1080,framerate=60/1'));
  assert.ok(args.includes('videorate'));
  assert.deepEqual(args.slice(-3), ['fdsink', 'fd=1', 'sync=false']);
  assert.deepEqual(pipewireInputArgs(base).slice(-8), ['-pixel_format', 'bgr0', '-video_size', '1920x1080', '-framerate', '60', '-i', 'pipe:0']);
  assert.throws(() => pipewireVideoArgs({ ...base, pipewireVideoNode: '42 ! fakesrc' }));
  let called = false;
  const result = probePipewireVideo(base, (command, probeArgs, options) => {
    called = true;
    assert.equal(command, 'gst-launch-1.0');
    assert.ok(probeArgs.includes('num-buffers=1'));
    assert.equal(probeArgs.at(-1), 'fakesink');
    assert.ok(!probeArgs.includes('fdsink'));
    assert.equal(options.timeout, 8000);
    return { status: 0 };
  });
  assert.equal(result.available, true);
  assert.ok(called);
  assert.equal(probePipewireVideo({ ...base, pipewireVideoNode: null }, () => assert.fail()).available, false);
  assert.equal(probePipewireVideo(base, () => ({ status: null, error: new Error('ENOENT') })).available, false);
});

test('Linux mode fallbacks preserve other platforms and require display, node and KMS capability', () => {
  const warnings = [];
  const deps = { platform: 'linux', env: { DISPLAY: ':0' }, hasXvfb: () => true,
    warn: text => warnings.push(text), probeKms: () => ({ available: true }), probePipewire: () => ({ available: true }) };
  const c = { ...base, captureMode: 'kmsgrab', isSteamDeck: true };
  assert.equal(resolveLinuxCaptureMode(c, deps), 'kmsgrab');
  assert.equal(resolveLinuxCaptureMode({ ...c, captureMode: 'pipewire' }, deps), 'pipewire');
  assert.equal(resolveLinuxCaptureMode({ ...c, captureMode: 'auto' }, deps), 'kmsgrab');
  assert.equal(resolveLinuxCaptureMode({ ...c, captureMode: 'auto', fps: 30 }, deps), 'xvfb');
  assert.equal(resolveLinuxCaptureMode(c, { ...deps, env: {} }), 'xvfb');
  assert.equal(resolveLinuxCaptureMode({ ...c, kmsHeadlessXvfb: true }, deps), 'xvfb');
  assert.equal(resolveLinuxCaptureMode(c, { ...deps, probeKms: () => ({ available: false, error: 'CAP_SYS_ADMIN required' }) }), 'xvfb');
  assert.ok(warnings.some(text => text.includes('setcap')));
  assert.equal(resolveLinuxCaptureMode(c, { ...deps, hasXvfb: () => false, probeKms: () => ({ available: false }) }), 'puppeteer-stream');
  for (const platform of ['darwin', 'win32']) {
    assert.equal(resolveLinuxCaptureMode(c, { ...deps, platform, probeKms: () => assert.fail() }), 'puppeteer-stream');
    assert.equal(resolveLinuxCaptureMode({ ...c, captureMode: 'xvfb' }, { ...deps, platform }), 'xvfb');
  }
});

function audioRunner({ loadFails = false, serverFails = false, pulseFails = false, isolatedFails = false } = {}) {
  const calls = [];
  return { calls, run(command, args) {
    calls.push([command, ...args]);
    if (command === 'pactl') {
      if (args[0] === 'info') return { status: serverFails ? 1 : 0 };
      if (args[0] === 'load-module') return { status: loadFails ? 1 : 0, stdout: '0\n' };
      if (args[0] === 'unload-module') return { status: 0 };
    }
    assert.equal(command, 'ffmpeg');
    const target = args[args.indexOf('-i') + 1];
    return { status: pulseFails || (isolatedFails && target === 'IntelliStar_Audio.monitor') ? 1 : 0 };
  } };
}

test('isolated sink routes its monitor and unloads even module zero', () => {
  const mock = audioRunner();
  const result = preparePipewireAudio(base, mock.run);
  assert.equal(result.mode, 'pipewire');
  assert.equal(result.moduleId, '0');
  assert.equal(result.sinkName, 'IntelliStar_Audio');
  assert.equal(result.target, 'IntelliStar_Audio.monitor');
  assert.deepEqual(result.warnings, []);
  assert.ok(mock.calls[1].includes('rate=48000'));
  assert.equal(cleanupPipewireAudioSink(result.moduleId, mock.run), true);
  assert.deepEqual(mock.calls.at(-1), ['pactl', 'unload-module', '0']);
  assert.equal(cleanupPipewireAudioSink(null, () => assert.fail()), true);
  assert.throws(() => setupPipewireAudioSink('bad sink', mock.run));
  assert.throws(() => cleanupPipewireAudioSink('not-an-id', mock.run));
  assert.deepEqual(pipewireAudioArgs(result.target).slice(0, 4), ['-thread_queue_size', '128', '-f', 'pulse']);
});

test('failed isolation captures default MONITOR, never default microphone, and warns', () => {
  for (const options of [{ loadFails: true }, { serverFails: true }, { isolatedFails: true }]) {
    const mock = audioRunner(options);
    const result = preparePipewireAudio(base, mock.run);
    assert.equal(result.mode, 'pipewire');
    assert.equal(result.target, '@DEFAULT_MONITOR@');
    assert.equal(result.sinkName, undefined);
    assert.ok(result.warnings.some(w => w.includes('desktop sounds')));
    if (options.isolatedFails) assert.ok(mock.calls.some(call => call[1] === 'unload-module'));
  }
  const mock = audioRunner();
  const result = preparePipewireAudio({ ...base, pipewireAudioIsolate: false, linuxAudioDevice: 'custom.monitor' }, mock.run);
  assert.equal(result.target, 'custom.monitor');
  assert.equal(mock.calls.some(call => call[0] === 'pactl'), false);
});

test('unavailable Pulse audio falls back to browser and retains failed unload IDs for retry', () => {
  const mock = audioRunner({ pulseFails: true });
  const result = preparePipewireAudio(base, mock.run);
  assert.equal(result.mode, 'browser');
  assert.ok(mock.calls.some(call => call[1] === 'unload-module'));
  const retry = preparePipewireAudio(base, (command, args, options) =>
    command === 'pactl' && args[0] === 'unload-module' ? { status: 1 } : mock.run(command, args, options));
  assert.equal(retry.moduleId, '0');
  assert.equal(retry.sinkName, undefined);
});