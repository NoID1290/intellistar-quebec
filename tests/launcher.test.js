'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { commands, startBackground, logPath, tailLog } = require('../launcher');

test('launcher provides output, forecast and maintenance commands with unique choices', () => {
  assert.equal(new Set(commands.map(command => command[0])).size, commands.length);
  for (const action of ['hls', 'ndi', 'youtube', 'dual', 'stop', 'status', 'forecast-start', 'forecast-stop', 'message', 'alert', 'editor', 'vlc', 'setup', 'setup-youtube', 'logs', 'other', 'pc-stats', 'sleep-monitors']) {
    assert.ok(commands.some(command => command[2] === action), action);
  }
});

test('launcher starts detached with private logs and leaves a ready backend alive', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { DISPLAY: ':test', XDG_STATE_HOME: root };
  const child = new EventEmitter();
  let unref = false;
  Object.assign(child, { exitCode: null, signalCode: null, unref: () => { unref = true; } });
  let requests = 0;
  const result = await startBackground('hls', env, {
    request: async () => ++requests === 1 ? null : { phase: 'running', output: 'hls' },
    spawn: (command, args, options) => {
      assert.equal(command, process.execPath);
      assert.equal(args.at(-1), 'hls');
      assert.equal(options.detached, true);
      assert.equal(options.stdio[0], 'ignore');
      assert.equal(options.env.OBS_OUTPUT, 'hls');
      return child;
    },
  });
  assert.equal(unref, true);
  assert.equal(result.log, logPath(env));
  assert.match(tailLog(result.log), /OBS hls/);
  assert.equal(fs.statSync(result.log).mode & 0o777, 0o600);
});

test('launcher rejects a duplicate broadcast without spawning or changing output', async () => {
  await assert.rejects(startBackground('ndi', { DISPLAY: ':test' }, {
    request: async () => ({ phase: 'running' }), spawn: () => assert.fail('must not spawn'),
  }), /already running/);
});

test('launcher provides encoding command and manages 720p/1080p/4k presets with 24/30/60 fps', async t => {
  const ini = require('ini');
  const {
    getEncodingPreset,
    setEncodingPreset,
    formatEncodingText,
    normalizeResolution,
    normalizeFps,
    syncActiveIcons,
    getIconStatus,
  } = require('../launcher');

  // Verify command exists in commands list
  assert.ok(commands.some(command => command[2] === 'encoding'));

  // Setup temporary isolated app and OBS root
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-enc-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const obsRoot = path.join(tmpDir, 'obs');
  const profDir = path.join(obsRoot, 'basic', 'profiles', 'IntelliSTAR_HLS');
  const scenesDir = path.join(obsRoot, 'basic', 'scenes');
  fs.mkdirSync(profDir, { recursive: true });
  fs.mkdirSync(scenesDir, { recursive: true });

  fs.writeFileSync(path.join(profDir, 'basic.ini'), '[General]\nName=IntelliSTAR HLS\n[Video]\nBaseCX=1920\nBaseCY=1080\nFPSCommon=30\n');
  fs.writeFileSync(path.join(profDir, 'streamEncoder.json'), JSON.stringify({ bitrate: 8000 }));
  fs.writeFileSync(path.join(scenesDir, 'IntelliSTAR.json'), JSON.stringify({
    resolution: { x: 1920, y: 1080 },
    sources: [{ id: 'browser_source', settings: { width: 1920, height: 1080 } }]
  }));

  // Initial read defaults to 1080p @ 30fps
  const initial = getEncodingPreset(tmpDir, { HOME: tmpDir });
  assert.equal(initial.resolution, '1080p');
  assert.equal(initial.fps, 30);
  assert.match(formatEncodingText(initial), /1080P @ 30 fps/);

  // Switch to 720p @ 60fps
  const set720p = setEncodingPreset({ resolution: '720p', fps: 60 }, tmpDir, {}, { obsRoots: [obsRoot] });
  assert.equal(set720p.resolution, '720p');
  assert.equal(set720p.fps, 60);
  assert.equal(set720p.width, 1280);
  assert.equal(set720p.height, 720);
  assert.equal(set720p.bitrateKbps, 6000);

  const parsedIni720 = ini.parse(fs.readFileSync(path.join(profDir, 'basic.ini'), 'utf8'));
  assert.equal(parsedIni720.Video.BaseCX, '1280');
  assert.equal(parsedIni720.Video.BaseCY, '720');
  assert.equal(parsedIni720.Video.FPSCommon, '60');
  assert.equal(parsedIni720.Video.FPSInt, '60');

  const parsedEncoder720 = JSON.parse(fs.readFileSync(path.join(profDir, 'streamEncoder.json'), 'utf8'));
  assert.equal(parsedEncoder720.bitrate, 6000);

  const parsedScene720 = JSON.parse(fs.readFileSync(path.join(scenesDir, 'IntelliSTAR.json'), 'utf8'));
  assert.equal(parsedScene720.resolution.x, 1280);
  assert.equal(parsedScene720.resolution.y, 720);
  assert.equal(parsedScene720.sources[0].settings.width, 1280);
  assert.equal(parsedScene720.sources[0].settings.height, 720);

  // Switch to 4k @ 24fps
  const set4k = setEncodingPreset({ resolution: '4k', fps: 24 }, tmpDir, {}, { obsRoots: [obsRoot] });
  assert.equal(set4k.resolution, '4k');
  assert.equal(set4k.fps, 24);
  assert.equal(set4k.width, 3840);
  assert.equal(set4k.height, 2160);
  assert.equal(set4k.bitrateKbps, 16000);

  const parsedIni4k = ini.parse(fs.readFileSync(path.join(profDir, 'basic.ini'), 'utf8'));
  assert.equal(parsedIni4k.Video.BaseCX, '3840');
  assert.equal(parsedIni4k.Video.BaseCY, '2160');
  assert.equal(parsedIni4k.Video.FPSCommon, '24');

  // Input validation
  assert.throws(() => normalizeResolution('invalid-res'), /Invalid resolution/);
  assert.throws(() => normalizeFps('99'), /Invalid frame rate/);
  assert.equal(normalizeResolution('1'), '720p');
  assert.equal(normalizeResolution('2'), '1080p');
  assert.equal(normalizeResolution('3'), '4k');
  assert.equal(normalizeFps('24fps'), 24);
  assert.equal(normalizeFps('30'), 30);
  assert.equal(normalizeFps('60'), 60);

  // Test icon set synchronization across framerates
  const icons2026 = path.join(tmpDir, 'webroot', 'images', 'icons', '2026');
  fs.mkdirSync(path.join(icons2026, '24fps'), { recursive: true });
  fs.mkdirSync(path.join(icons2026, '30fps'), { recursive: true });
  fs.mkdirSync(path.join(icons2026, '60fps'), { recursive: true });
  fs.writeFileSync(path.join(icons2026, '24fps', 'Sun.webp'), 'icon-24fps');
  fs.writeFileSync(path.join(icons2026, '30fps', 'Sun.webp'), 'icon-30fps');
  fs.writeFileSync(path.join(icons2026, '60fps', 'Sun.webp'), 'icon-60fps');

  const sync30 = syncActiveIcons(30, tmpDir);
  assert.equal(sync30.synced, true);
  assert.equal(fs.readFileSync(path.join(icons2026, 'large', 'Sun.webp'), 'utf8'), 'icon-30fps');

  const sync24 = syncActiveIcons(24, tmpDir);
  assert.equal(sync24.synced, true);
  assert.equal(fs.readFileSync(path.join(icons2026, 'large', 'Sun.webp'), 'utf8'), 'icon-24fps');

  const iconStatus = getIconStatus(tmpDir);
  assert.deepEqual(iconStatus.availableFps, [24, 30, 60]);
});

test('launcher exports display control helpers', () => {
  const { sleepMonitors, wakeMonitors, getDisplayStatus } = require('../launcher');
  assert.equal(typeof sleepMonitors, 'function');
  assert.equal(typeof wakeMonitors, 'function');
  assert.equal(typeof getDisplayStatus, 'function');

  const status = getDisplayStatus();
  assert.ok(typeof status === 'object');
  assert.ok(Array.isArray(status.outputs));
});

test('launcher exports YouTube stream key and supports youtube background startup', async t => {
  const { YOUTUBE_STREAM_KEY } = require('../launcher');
  assert.ok(typeof YOUTUBE_STREAM_KEY === 'string' && YOUTUBE_STREAM_KEY.length > 5);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-yt-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { DISPLAY: ':test', XDG_STATE_HOME: root };
  const child = new EventEmitter();
  let unref = false;
  Object.assign(child, { exitCode: null, signalCode: null, unref: () => { unref = true; } });
  let requests = 0;
  const result = await startBackground('youtube', env, {
    request: async () => ++requests === 1 ? null : { phase: 'running', output: 'youtube' },
    spawn: (command, args, options) => {
      assert.equal(command, process.execPath);
      assert.equal(args.at(-1), 'youtube');
      assert.equal(options.detached, true);
      assert.equal(options.env.OBS_OUTPUT, 'youtube');
      assert.equal(options.env.YOUTUBE_STREAM_KEY, YOUTUBE_STREAM_KEY);
      return child;
    },
  });
  assert.equal(unref, true);
  assert.equal(result.log, logPath(env));
  assert.match(tailLog(result.log), /OBS youtube/);
});