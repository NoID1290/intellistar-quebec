const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const encoding = require('../stream-encoding');

const root = path.resolve(__dirname, '..');
// Never require the runner: puppeteer-stream opens a WebSocket server on import.
// These are the only real filesystem reads; neither configuration nor credentials load.
const runnerSource = readFileSync(path.join(root, 'start-iptv.js'), 'utf8');
const linuxSource = readFileSync(path.join(root, 'stream-linux-capture.js'), 'utf8');

class FakeTimers {
  now = 0;
  nextId = 0;
  pending = new Map();

  add(callback, delay, interval = false) {
    const id = ++this.nextId;
    this.pending.set(id, { callback, delay, interval });
    return id;
  }

  fireDelay(delay) {
    const entry = [...this.pending].find(([, timer]) => timer.delay === delay);
    assert.ok(entry, `Expected a pending ${delay}ms timer`);
    const [id, timer] = entry;
    if (!timer.interval) this.pending.delete(id);
    this.now += delay;
    timer.callback();
  }
}

// Only microtasks are drained. No wall-clock waits or real intervals are needed.
async function settleUntil(predicate) {
  for (let turn = 0; turn < 100; turn++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.ok(predicate(), 'Mock pipeline did not settle within 100 microtask turns');
}

function harness(t, options = {}) {
  const config = {
    captureMode: 'kmsgrab', audioMode: 'pipewire',
    captureWidth: 1280, captureHeight: 720, outputWidth: 1280, outputHeight: 720,
    fps: 30, ffmpegThreads: 2, maxCaptureQueue: 16,
    videoEncoder: 'h264_vaapi', videoBitrate: '6M', videoMaxrate: '8M',
    audioBitrate: '192k', hardwareDecode: false, allowSoftwareFallback: false,
    vaapiDevice: '/dev/dri/renderD128', kmsDevice: '/dev/dri/card0',
    kmsCrtc: 12, kmsPlane: 34, pipewireVideoNode: 42,
    browserExecutablePath: '/mock/chromium', enableGpu: true, rafThrottle: true,
    pipewireAudioIsolate: true, pipewireAudioSink: 'test_sink',
    audioFile: '/mock/music.ogg', linuxAudioBackend: 'pulse', linuxAudioDevice: 'system.monitor',
    audioDevice: 'Missing audio device', xvfbDisplay: ':99', screenshotQuality: 80,
    outputMode: 'hls', hlsDirectory: '/mock/hls', hlsPlaylistName: 'index.m3u8',
    hlsSegmentTime: 4, hlsListSize: 8, port: 7070, autoStartServer: false,
    ...options.config,
  };
  const timers = new FakeTimers();
  const processMock = new EventEmitter();
  const exits = [];
  Object.assign(processMock, {
    platform: options.platform || 'linux', arch: 'x64',
    env: { PATH: '/mock/bin', DISPLAY: ':7', WAYLAND_DISPLAY: 'wayland-test', ...options.env },
    exit: code => { exits.push(code); processMock.emit('exit', code); },
    kill: () => assert.fail('No host PID should be probed'),
    memoryUsage: () => ({ rss: 0, heapUsed: 0 }),
  });
  const children = [];
  const streams = [];
  function stream() {
    const result = new PassThrough();
    streams.push(result);
    return result;
  }
  function child(command, args = [], spawnOptions = {}) {
    const result = new EventEmitter();
    Object.assign(result, {
      command, args: Array.from(args), options: JSON.parse(JSON.stringify(spawnOptions)),
      exitCode: null, signalCode: null, signals: [], writes: [], sources: [],
      stdin: stream(), stdout: stream(), stderr: stream(),
    });
    result.stdio = [result.stdin, result.stdout, result.stderr];
    if (spawnOptions.stdio?.length === 4) result.stdio.push(stream());
    result.stdin.on('data', data => result.writes.push(Buffer.from(data)));
    result.stdin.on('pipe', source => result.sources.push(source));
    result.kill = signal => {
      result.signals.push(signal);
      if (!options.stubbornChildren) {
        result.signalCode = signal;
        result.emit('exit', null, signal);
        result.emit('close', null, signal);
      }
      return true;
    };
    result.finish = code => {
      result.exitCode = code;
      result.emit('exit', code, null);
      result.emit('close', code, null);
    };
    children.push(result);
    return result;
  }

  const browserChild = child('chromium');
  const browser = new EventEmitter();
  const page = new EventEmitter();
  const cdp = new EventEmitter();
  const cdpCalls = [];
  let cdpSessions = 0;
  cdp.send = async (method, params) => { cdpCalls.push({ method, params }); };
  const exposed = new Map();
  Object.assign(page, {
    evaluate: async (_fn, argument) => argument?.codec ? 'video/webm;codecs=h264' : null,
    evaluateOnNewDocument: async () => {},
    exposeFunction: async (name, callback) => { exposed.set(name, callback); },
    goto: async () => {
      if (options.rejectAt === 'goto') throw new Error('Mock navigation rejected');
    },
    target: () => ({ createCDPSession: async () => { cdpSessions++; return cdp; } }),
    screenshot: async () => assert.fail('Unexpected screenshot capture'),
    isClosed: () => false,
  });
  let browserCloses = 0;
  Object.assign(browser, {
    connected: true, process: () => browserChild, newPage: async () => page,
    close: async () => {
      browserCloses++;
      browser.emit('disconnected');
      if (options.hangBrowserClose) await new Promise(() => {});
    },
  });
  const launches = [];
  const launch = async (kind, launchOptions) => {
    launches.push({ kind, options: JSON.parse(JSON.stringify(launchOptions)) });
    if (options.rejectAt === 'launch') throw new Error('Mock launch rejected');
    return browser;
  };
  const tabStream = stream();
  const tabCalls = [];
  const puppeteer = { launch: launchOptions => launch('puppeteer', launchOptions) };
  const puppeteerStream = {
    launch: (actualPuppeteer, launchOptions) => {
      assert.equal(actualPuppeteer, puppeteer);
      return launch('puppeteer-stream', launchOptions);
    },
    getStream: async (actualPage, settings) => {
      assert.equal(actualPage, page);
      tabCalls.push(JSON.parse(JSON.stringify(settings)));
      if (options.rejectAt === 'getStream') throw new Error('Mock tab capture rejected');
      return tabStream;
    },
  };
  const spawnCalls = [];
  const syncCalls = [];
  const childProcess = {
    spawn: (command, args, settings) => {
      const result = child(command, args, settings);
      spawnCalls.push(result);
      return result;
    },
    spawnSync: (command, args, settings) => {
      syncCalls.push({ command, args: Array.from(args), settings });
      if (command === 'which') {
        assert.equal(args[0], 'Xvfb');
        return { status: 0, stdout: '/mock/Xvfb\n' };
      }
      assert.equal(command, 'ffmpeg', 'Unexpected synchronous process');
      if (args.includes('-muxers')) return { status: 0, stdout: 'libndi_newtek' };
      if (args.includes('-encoders')) return { status: 0, stdout: 'h264_vaapi libx264' };
      if (args.includes('-list_devices')) {
        return { status: 1, stderr: '"Microphone" (audio)\n"Stereo Mix" (audio)' };
      }
      assert.ok(args.includes('-frames:v'), 'Only synthetic encoder probes are allowed');
      return { status: 0, stdout: Buffer.from('mock encoded sample'), stderr: '' };
    },
  };
  const fsMock = {
    existsSync: filename => ['/mock/chromium', '/mock/Xvfb', '/mock/music.ogg', '/mock/hls',
      '/dev/dri/renderD128'].includes(filename) ||
      (filename === '/tmp/.X11-unix/X99' && spawnCalls.some(p => p.command === '/mock/Xvfb')),
    readdirSync: () => [],
    mkdirSync: () => {},
    unlinkSync: () => assert.fail('No stale files in this fixture'),
    readFileSync: () => assert.fail('Runner must not read files or configuration'),
  };
  let serverChecks = 0;
  const httpMock = {
    get: (url, callback) => {
      assert.ok(url.startsWith('http://127.0.0.1:7070'));
      const request = new EventEmitter();
      request.end = () => {
        if (!url.endsWith('/api/forecast/reset') && ++serverChecks === 1 && config.autoStartServer) {
          request.emit('error', new Error('Mock server not started'));
        } else callback({ statusCode: 200 });
      };
      return request;
    },
  };
  const logs = [];
  const logger = { c: { green: value => value }, isDashboardEnabled: () => false };
  for (const name of ['configure', 'printBanner', 'printConfigCard', 'shutdown', 'stream', 'server',
    'browser', 'capture', 'audio', 'warn', 'error', 'standby', 'handleBrowserLog',
    'formatFFmpegProgress', 'updateCaptureStats', 'log']) {
    logger[name] = (...args) => logs.push({ name, args });
  }
  const filterCalls = [];
  const stubs = {
    puppeteer, 'puppeteer-stream': puppeteerStream, child_process: childProcess,
    stream: { PassThrough }, fs: fsMock, os: { cpus: () => Array(4).fill({}), freemem: () => 0 },
    path, http: httpMock, './stream-config': config, './console-view': logger,
    './stream-encoding': {
      ...encoding,
      videoFilter: (...args) => { filterCalls.push(args); return encoding.videoFilter(...args); },
    },
    './stream-browser': {
      installRafThrottle: () => {}, ensureStreamBrowserCompatibility: value => value,
    },
  };
  function mockRequire(name) {
    assert.ok(Object.hasOwn(stubs, name), `Unmocked import: ${name}`);
    return stubs[name];
  }
  const context = vm.createContext({
    process: processMock, Buffer,
    Date: class extends Date { static now() { return timers.now; } },
    setTimeout: (callback, delay) => timers.add(callback, delay),
    setInterval: (callback, delay) => timers.add(callback, delay, true),
    clearTimeout: id => timers.pending.delete(id), clearInterval: id => timers.pending.delete(id),
    global: {},
  });
  function load(source, filename, main = false) {
    const module = { exports: {} };
    mockRequire.main = main ? module : undefined;
    const wrapper = vm.runInContext(
      `(function(require, module, exports, __dirname, __filename) {\n${source}\n})`,
      context, { filename });
    wrapper(mockRequire, module, module.exports, root, path.join(root, filename));
    return module.exports;
  }
  // Keep real argument builders, but mode/sink setup cannot probe any host services.
  const linux = load(linuxSource, 'stream-linux-capture.js');
  const unloaded = [];
  const prepared = [];
  const ownedModuleIds = [];
  stubs['./stream-linux-capture'] = {
    ...linux,
    resolveLinuxCaptureMode: actual => { assert.equal(actual, config); return config.captureMode; },
    preparePipewireAudio: actual => {
      assert.equal(actual, config);
      const sink = { mode: 'pipewire', moduleId: options.moduleId ?? 0,
        sinkName: 'test_sink', target: 'test_sink.monitor', warnings: [], ...options.sink };
      prepared.push(sink);
      if (sink.moduleId !== null && sink.moduleId !== undefined) ownedModuleIds.push(sink.moduleId);
      return sink;
    },
    cleanupPipewireAudioSink: id => { unloaded.push(id); return true; },
    probeKmsgrabCapability: () => assert.fail('Mode resolution should be mocked'),
    probePipewireVideo: () => assert.fail('Mode resolution should be mocked'),
  };
  const runner = load(`${runnerSource}\nmodule.exports.startStreaming = startStreaming;`,
    'start-iptv.js', options.main);
  const api = {
    config, timers, process: processMock, exits, children, spawnCalls, syncCalls,
    browser, browserChild, page, cdp, cdpCalls, exposed, launches, tabStream, tabCalls,
    prepared, ownedModuleIds, unloaded, filterCalls, logs,
    get browserCloses() { return browserCloses; },
    get cdpSessions() { return cdpSessions; },
    get ffmpeg() { return spawnCalls.find(p => p.command === 'ffmpeg'); },
    get gst() { return spawnCalls.find(p => p.command === 'gst-launch-1.0'); },
    start: () => runner.startStreaming(),
    stop: async () => {
      processMock.emit('SIGTERM');
      await settleUntil(() => exits.length > 0);
    },
  };
  t.after(async () => {
    try {
      if (!exits.length && !options.stubbornChildren && !options.hangBrowserClose) await api.stop();
    } finally {
      timers.pending.clear();
      processMock.removeAllListeners();
      for (const item of streams) item.destroy();
    }
  });
  return api;
}

function values(args, flag) {
  return args.flatMap((value, index) => value === flag ? [args[index + 1]] : []);
}

function assertRouting(h, videoInput, audioInput, audioMap = '1:a:0') {
  const args = h.ffmpeg.args;
  assert.deepEqual(values(args, '-i'), audioInput === null ? [videoInput] : [videoInput, audioInput]);
  assert.deepEqual(values(args, '-map'), ['0:v:0', audioMap]);
  const isKms = h.config.captureMode === 'kmsgrab';
  const filterCall = h.filterCalls.findLast(call => call.length === 4);
  assert.ok(filterCall, 'Live FFmpeg filter must specify its input format');
  assert.equal(filterCall[3], isKms ? 'drm_prime' : 'raw');
  const filter = values(args, '-vf')[0];
  if (isKms) assert.match(filter, /^hwmap=derive_device=vaapi,scale_vaapi=/);
  else {
    assert.doesNotMatch(filter, /hwmap|drm_prime/);
    assert.match(filter, /hwupload/);
  }
  assert.equal(h.process.env.PULSE_SINK, undefined, 'Sink must not leak into runner environment');
  for (const spawned of h.spawnCalls) {
    assert.equal(spawned.options.env?.PULSE_SINK, undefined, 'Sink belongs only to Chromium');
  }
}

function assertClean(h, code = 0, alreadyExited = []) {
  assert.deepEqual(h.exits, [code]);
  assert.equal(h.browserCloses, 1);
  assert.deepEqual(h.unloaded, h.ownedModuleIds);
  assert.equal(h.timers.pending.size, 0, 'All GC/prune/writer/deadline timers must be cleared');
  for (const child of h.children) {
    const expected = alreadyExited.includes(child) ? [] : [child === h.ffmpeg ? 'SIGINT' : 'SIGTERM'];
    assert.deepEqual(child.signals, expected, `${child.command} cleanup signal`);
  }
  // Different shutdown triggers and the process exit fallback must not clean twice.
  h.process.emit('SIGINT');
  h.process.emit('SIGTERM');
  h.process.emit('exit', code);
  h.ffmpeg?.emit('close', 0);
  h.gst?.emit('close', 0);
  assert.deepEqual(h.exits, [code]);
  assert.equal(h.browserCloses, 1);
  assert.deepEqual(h.unloaded, h.ownedModuleIds);
  for (const child of h.children) assert.ok(child.signals.length <= 1);
}

const silentInput = 'anullsrc=channel_layout=stereo:sample_rate=48000';
const audioInputs = {
  pipewire: 'test_sink.monitor', browser: 'pipe:3', file: '/mock/music.ogg',
  system: 'system.monitor', silent: silentInput,
};

for (const mode of ['kmsgrab', 'pipewire']) {
  for (const audioMode of Object.keys(audioInputs)) {
    test(`${mode} + ${audioMode}: inputs, browser environment, transport and SIGTERM cleanup`, async t => {
      const h = harness(t, { config: { captureMode: mode, audioMode } });
      await h.start();
      assertRouting(h, mode === 'kmsgrab' ? '-' : 'pipe:0', audioInputs[audioMode]);
      const launch = h.launches[0];
      assert.equal(launch.kind, 'puppeteer');
      assert.equal(launch.options.headless, false);
      assert.ok(launch.options.args.includes('--ozone-platform=wayland'));
      assert.equal(launch.options.env.PULSE_SINK, audioMode === 'pipewire' ? 'test_sink' : undefined);
      assert.deepEqual(launch.options.ignoreDefaultArgs, audioMode === 'pipewire' ? ['--mute-audio'] : []);
      assert.equal(h.cdpSessions, 0);
      assert.equal(h.tabCalls.length, 0);
      assert.equal(h.prepared.length, audioMode === 'pipewire' ? 1 : 0);
      const args = h.ffmpeg.args;
      assert.equal(values(args, '-f')[0], mode === 'kmsgrab' ? 'kmsgrab' : 'rawvideo');
      if (mode === 'kmsgrab') {
        assert.deepEqual(values(args, '-device'), ['/dev/dri/card0']);
        assert.deepEqual(values(args, '-crtc_id'), ['12']);
        assert.deepEqual(values(args, '-plane_id'), ['34']);
        assert.equal(h.gst, undefined);
        assert.equal(h.ffmpeg.sources.length, 0);
      } else {
        assert.deepEqual(values(args, '-pixel_format'), ['bgr0']);
        assert.deepEqual(values(args, '-video_size'), ['1280x720']);
        assert.deepEqual(values(args, '-framerate'), ['30']);
        assert.deepEqual(h.gst.options.stdio, ['ignore', 'pipe', 'pipe']);
        assert.deepEqual(h.gst.args, ['-q', 'pipewiresrc', 'path=42', 'do-timestamp=true', 'name=intellistar_capture', '!',
          'videoconvert', '!', 'videoscale', '!', 'videorate', '!',
          'video/x-raw,format=BGRx,width=1280,height=720,framerate=30/1', '!', 'fdsink', 'fd=1', 'sync=false']);
        assert.deepEqual(h.ffmpeg.sources, [h.gst.stdout]);
        h.gst.stdout.write(Buffer.from('raw frame'));
        assert.equal(Buffer.concat(h.ffmpeg.writes).toString(), 'raw frame');
      }
      assert.equal(h.ffmpeg.options.stdio.length, audioMode === 'browser' ? 4 : 3);
      if (audioMode === 'browser') {
        const chunks = [];
        h.ffmpeg.stdio[3].on('data', chunk => chunks.push(chunk));
        assert.ok(h.exposed.has('sendAudioChunk'));
        h.exposed.get('sendAudioChunk')(Buffer.from('audio chunk').toString('base64'));
        assert.equal(Buffer.concat(chunks).toString(), 'audio chunk');
      } else assert.equal(h.exposed.size, 0);
      if (audioMode === 'pipewire') assert.ok(args.includes('pulse'));
      if (audioMode === 'file') assert.deepEqual(values(args, '-stream_loop'), ['-1']);
      await h.stop();
      assertClean(h);
    });
  }
}

test('external desktop capture uses X11 ozone when no Wayland display is present', async t => {
  const h = harness(t, { env: { WAYLAND_DISPLAY: undefined } });
  await h.start();
  assert.equal(h.launches[0].options.headless, false);
  assert.ok(h.launches[0].options.args.includes('--ozone-platform=x11'));
  await h.stop();
  assertClean(h);
});

for (const audioMode of ['pipewire', 'browser']) {
  test(`tab + ${audioMode}: separate Pulse input versus bundled WebM audio`, async t => {
    const h = harness(t, { config: { captureMode: 'puppeteer-stream', audioMode } });
    await h.start();
    assertRouting(h, '-', audioMode === 'browser' ? null : 'test_sink.monitor',
      audioMode === 'browser' ? '0:a:0' : '1:a:0');
    assert.equal(values(h.ffmpeg.args, '-f')[0], 'matroska,webm');
    assert.equal(h.launches[0].kind, 'puppeteer-stream');
    assert.equal(h.launches[0].options.headless, 'new');
    assert.equal(h.launches[0].options.env.PULSE_SINK, audioMode === 'pipewire' ? 'test_sink' : undefined);
    assert.deepEqual(h.launches[0].options.ignoreDefaultArgs, audioMode === 'pipewire' ? ['--mute-audio'] : []);
    assert.equal(h.tabCalls.length, 1);
    assert.equal(h.tabCalls[0].audio, audioMode === 'browser');
    assert.equal(h.tabCalls[0].video, true);
    assert.equal(h.ffmpeg.options.stdio.length, 3);
    assert.deepEqual(h.ffmpeg.sources, [h.tabStream]);
    h.tabStream.write(Buffer.from('WebM chunk'));
    assert.equal(Buffer.concat(h.ffmpeg.writes).toString(), 'WebM chunk');
    assert.equal(h.cdpSessions, 0);
    await h.stop();
    assert.equal(h.tabStream.destroyed, true);
    assertClean(h);
  });
}

test('Xvfb and owned HTTP server retain direct capture and child cleanup', async t => {
  const h = harness(t, { config: { captureMode: 'xvfb', autoStartServer: true } });
  const starting = h.start();
  await settleUntil(() => [...h.timers.pending.values()].some(timer => timer.delay === 500));
  h.timers.fireDelay(500);
  await starting;
  assertRouting(h, ':99.0+0,0', 'test_sink.monitor');
  assert.equal(values(h.ffmpeg.args, '-f')[0], 'x11grab');
  assert.ok(h.spawnCalls.some(p => p.command === '/mock/Xvfb'));
  assert.ok(h.spawnCalls.some(p => p.command === 'node' && p.args[0] === 'app.js'));
  const launch = h.launches[0].options;
  assert.equal(launch.headless, false);
  assert.equal(launch.env.DISPLAY, ':99');
  assert.equal(launch.env.PULSE_SINK, 'test_sink');
  assert.ok(launch.args.includes('--ozone-platform=x11'));
  assert.equal(h.cdpSessions, 0);
  await h.stop();
  assertClean(h);
});

test('Windows gdigrab keeps DirectShow loopback selection and input ordering', async t => {
  const h = harness(t, { platform: 'win32', config: { captureMode: 'xvfb', audioMode: 'system' } });
  await h.start();
  assertRouting(h, 'desktop', 'audio=Stereo Mix');
  assert.deepEqual(values(h.ffmpeg.args, '-f'), ['gdigrab', 'dshow', 'hls']);
  assert.equal(h.launches[0].options.headless, false);
  assert.equal(h.launches[0].options.args.some(arg => arg.startsWith('--ozone-platform=')), false);
  assert.equal(h.spawnCalls.some(p => p.command === '/mock/Xvfb'), false);
  assert.equal(h.prepared.length, 0);
  await h.stop();
  assertClean(h);
});

test('screencast retains image2pipe, acknowledges frames and clears its writer timer', async t => {
  const h = harness(t, { config: { captureMode: 'screencast', audioMode: 'browser' } });
  await h.start();
  assertRouting(h, '-', 'pipe:3');
  assert.equal(values(h.ffmpeg.args, '-f')[0], 'image2pipe');
  assert.deepEqual(values(h.ffmpeg.args, '-vcodec'), ['mjpeg']);
  assert.equal(h.launches[0].options.headless, 'new');
  assert.equal(h.cdpSessions, 1);
  assert.equal(h.cdpCalls[0].method, 'Page.startScreencast');
  // Await the real async event handler, including its cross-VM acknowledgement promise,
  // before advancing the writer clock. EventEmitter.emit does not await listeners.
  const handlers = h.cdp.listeners('Page.screencastFrame');
  assert.equal(handlers.length, 1);
  await handlers[0]({ data: Buffer.from('jpeg frame').toString('base64'), sessionId: 9 });
  assert.equal(h.cdpCalls[1].method, 'Page.screencastFrameAck');
  assert.equal(h.cdpCalls[1].params.sessionId, 9);
  h.timers.fireDelay(Math.round(1000 / h.config.fps));
  assert.equal(Buffer.concat(h.ffmpeg.writes).toString(), 'jpeg frame');
  await h.stop();
  assertClean(h);
});

for (const rejectAt of ['launch', 'goto', 'getStream']) {
  test(`CLI startup rejection at ${rejectAt} unloads module 0 and stops acquired resources`, async t => {
    // Exercise the actual require.main catch, not an invented test-only cleanup wrapper.
    const h = harness(t, { main: true, rejectAt,
      config: { captureMode: rejectAt === 'getStream' ? 'puppeteer-stream' : 'kmsgrab' } });
    await settleUntil(() => h.exits.length > 0);
    assert.deepEqual(h.exits, [1]);
    assert.deepEqual(h.unloaded, [0]);
    assert.ok(h.logs.some(log => log.name === 'error' && /IPTV Fatal Error: Mock/.test(log.args[0])));
    if (rejectAt === 'launch') {
      assert.equal(h.browserCloses, 0);
      assert.equal(h.ffmpeg, undefined);
      assert.deepEqual(h.browserChild.signals, []);
      h.process.emit('exit', 1);
      h.process.emit('SIGTERM');
      assert.deepEqual(h.unloaded, [0]);
      assert.deepEqual(h.exits, [1]);
      assert.equal(h.timers.pending.size, 0);
    } else assertClean(h, 1);
  });
}

test('unexpected FFmpeg close fails the pipeline and stops the surviving producer', async t => {
  const h = harness(t, { config: { captureMode: 'pipewire' } });
  await h.start();
  h.ffmpeg.finish(7);
  await settleUntil(() => h.exits.length > 0);
  assertClean(h, 1, [h.ffmpeg]);
});

test('nonzero module IDs are unloaded once and ownership is cleared', async t => {
  const h = harness(t, { moduleId: '17' });
  await h.start();
  await h.stop();
  assert.deepEqual(h.unloaded, ['17']);
  assert.equal(h.prepared[0].moduleId, null);
  assertClean(h);
});

for (const failure of ['error', 'close', 'stdout error']) {
  test(`GStreamer ${failure} fails the pipeline and unloads isolated audio`, async t => {
    const h = harness(t, { config: { captureMode: 'pipewire' } });
    await h.start();
    if (failure === 'close') h.gst.finish(1);
    else if (failure === 'stdout error') h.gst.stdout.emit('error', new Error('Mock pipe failure'));
    else h.gst.emit('error', new Error('Mock GStreamer spawn failure'));
    await settleUntil(() => h.exits.length > 0);
    assertClean(h, 1, failure === 'close' ? [h.gst] : []);
  });
}

test('NDI output mode configures libndi_newtek muxer, rawvideo, and PCM audio', async t => {
  const h = harness(t, {
    config: {
      outputMode: 'ndi',
      ndiName: 'TestNDIStream',
      ndiPixelFormat: 'uyvy422',
      captureMode: 'puppeteer-stream',
      audioMode: 'file',
    }
  });
  await h.start();
  const args = h.ffmpeg.args;
  assert.equal(values(args, '-f').at(-1), 'libndi_newtek');
  assert.equal(args.at(-1), 'TestNDIStream');
  assert.equal(values(args, '-c:v')[0], 'rawvideo');
  assert.equal(values(args, '-pix_fmt')[0], 'uyvy422');
  assert.equal(values(args, '-c:a')[0], 'pcm_s16le');
  assert.equal(values(args, '-ar')[0], '48000');
  assert.equal(values(args, '-ac')[0], '2');
  // Must not have HLS flags or rate control bitrate flags for raw NDI output
  assert.equal(values(args, '-hls_time').length, 0);
  assert.equal(values(args, '-b:v').length, 0);
  h.process.emit('SIGTERM');
  await settleUntil(() => h.exits.length > 0);
  assertClean(h, 0);
});

test('shutdown escalates stubborn children and bounds a hung browser close', async t => {
  const h = harness(t, { stubbornChildren: true, hangBrowserClose: true,
    config: { captureMode: 'pipewire' } });
  await h.start();
  h.process.emit('SIGTERM');
  assert.deepEqual(h.unloaded, [0], 'Sink unload must not wait for browser.close');
  assert.deepEqual(h.ffmpeg.signals, ['SIGINT']);
  assert.deepEqual(h.gst.signals, ['SIGTERM']);
  assert.deepEqual(h.browserChild.signals, ['SIGTERM']);
  h.process.emit('SIGINT');
  assert.equal(h.browserCloses, 1);
  for (let count = 0; count < 3; count++) h.timers.fireDelay(1500);
  for (const child of h.children) assert.equal(child.signals[1], 'SIGKILL');
  assert.deepEqual(h.exits, []);
  h.timers.fireDelay(2500);
  await settleUntil(() => h.exits.length > 0);
  assert.deepEqual(h.exits, [0]);
  assert.deepEqual(h.unloaded, [0]);
  assert.equal(h.timers.pending.size, 0);
});