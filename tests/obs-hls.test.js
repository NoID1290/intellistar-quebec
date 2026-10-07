'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const ini = require('ini');
const { createHlsProfile, validateHlsProfile } = require('../obs-hls-profile');
const { obsOptions, obsCommand } = require('../stream-obs');
const { createBackend } = require('../stream-obs');
const { hlsReady } = require('../stream-hls');
const { EventEmitter } = require('node:events');
const { resolveHlsDirectory, hlsOptions, hlsArgs } = require('../stream-hls');

const config = { useRamCache: false, hlsDirectory: './stream-cache', hlsSegmentTime: 2, hlsListSize: 6 };

test('OBS HLS uses loopback ingest and the same directory resolver as the app', () => {
  const options = hlsOptions({}, config);
  assert.equal(options.ingestUrl, 'rtmp://127.0.0.1:19350/live/intellistar');
  assert.equal(options.directory, resolveHlsDirectory(config));
  assert.equal(resolveHlsDirectory({ ...config, hlsDirectory: "'./custom-cache'" }), path.resolve(__dirname, '../custom-cache'));
  assert.equal(hlsOptions({ OBS_RTMP_PORT: '19360' }, config).ingestPort, 19360);
  for (const port of ['no', '0', '80', '65536']) assert.throws(() => hlsOptions({ OBS_RTMP_PORT: port }, config), /OBS_RTMP_PORT/);
  assert.throws(() => hlsOptions({ OBS_RTMP_PORT: '7070' }, config), /differ/);
  assert.throws(() => hlsOptions({}, { ...config, hlsPlaylistName: '../index.m3u8' }), /filename/);
});

test('OBS HLS packages both streams without decoding or re-encoding', () => {
  const options = hlsOptions({}, config);
  const args = hlsArgs(options, 'test-session');
  assert.deepEqual(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2), ['-c', 'copy']);
  assert.ok(args.includes('0:v:0'));
  assert.ok(args.includes('0:a:0'));
  assert.ok(!args.includes('-vf'));
  assert.ok(args.includes('delete_segments+temp_file+independent_segments'));
  assert.equal(args.at(-1), path.join(options.directory, 'index.m3u8'));
  assert.throws(() => hlsArgs(options, '../unsafe'), /identifier/);
});

test('HLS selects its dedicated profile and starts streaming, NDI does not', () => {
  const options = obsOptions({ OBS_OUTPUT: 'hls' });
  assert.equal(options.profile, 'IntelliSTAR HLS');
  assert.ok(obsCommand(options, 'flatpak').args.includes('--startstreaming'));
  const ytOptions = obsOptions({ OBS_OUTPUT: 'youtube' });
  assert.equal(ytOptions.profile, 'IntelliSTAR YouTube');
  assert.ok(obsCommand(ytOptions, 'flatpak').args.includes('--startstreaming'));
  const dualOptions = obsOptions({ OBS_OUTPUT: 'dual' });
  assert.equal(dualOptions.profile, 'IntelliSTAR HLS');
  assert.ok(obsCommand(dualOptions, 'flatpak').args.includes('--startstreaming'));
  assert.ok(!obsCommand(obsOptions({}), 'flatpak').args.includes('--startstreaming'));
  assert.throws(() => obsOptions({ OBS_OUTPUT: 'unknown' }), /OBS_OUTPUT/);
});

test('OBS HLS packages dual streams using tee muxer when youtubeRtmpUrl is provided', () => {
  const options = hlsOptions({}, config, { youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/test-key' });
  const args = hlsArgs(options, 'test-dual-session');
  assert.ok(args.includes('-f'));
  assert.equal(args[args.indexOf('-f') + 1], 'tee');
  const teeTarget = args.at(-1);
  assert.ok(teeTarget.includes('[f=hls:'));
  assert.ok(teeTarget.includes('[f=flv:onfail=ignore]rtmp://a.rtmp.youtube.com/live2/test-key'));
});

test('HLS profile creation is separate, hardware encoded, and refuses overwrite or wrong ingest', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, 'basic', 'profiles', 'Original');
  fs.mkdirSync(original, { recursive: true });
  const contents = '[General]\nName=IntelliSTAR\n[Video]\nFPSCommon=60\n[Output]\nMode=Simple\n';
  fs.writeFileSync(path.join(original, 'basic.ini'), contents);
  const options = hlsOptions({}, config);
  const destination = createHlsProfile(root, 'IntelliSTAR', 'IntelliSTAR HLS', options);
  const profile = validateHlsProfile(root, 'IntelliSTAR HLS', options);
  assert.equal(profile.config.AdvOut.Encoder, 'ffmpeg_vaapi_tex');
  assert.equal(profile.config.Video.FPSCommon, '60');
  assert.equal(ini.parse(fs.readFileSync(path.join(destination, 'basic.ini'), 'utf8')).General.Name, 'IntelliSTAR HLS');
  assert.equal(fs.readFileSync(path.join(original, 'basic.ini'), 'utf8'), contents);
  assert.throws(() => createHlsProfile(root, 'IntelliSTAR', 'IntelliSTAR HLS', options), /already exists/);
  assert.throws(() => validateHlsProfile(root, 'IntelliSTAR HLS', { ...options, ingestPort: 19360 }), /must stream/);
});

test('HLS readiness requires recent segments from the current session', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-ready-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const options = { ...hlsOptions({}, config), directory };
  const playlist = path.join(directory, options.playlistName);
  fs.writeFileSync(playlist, '#EXTM3U\nobs-old-000001.ts\n');
  assert.equal(hlsReady(options, 'new'), false);
  fs.writeFileSync(playlist, '#EXTM3U\nobs-new-000001.ts\n');
  assert.equal(hlsReady(options, 'new'), false);
  fs.writeFileSync(path.join(directory, 'obs-new-000001.ts'), 'media');
  assert.equal(hlsReady(options, 'new'), true);
  fs.utimesSync(playlist, new Date(0), new Date(0));
  assert.equal(hlsReady(options, 'new'), false);
});

function hlsFixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-life-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const children = [];
  const stopped = [];
  let clock = 0;
  const backend = createBackend(obsOptions({ OBS_OUTPUT: 'hls' }), {
    preflight: () => ({ installation: 'native', hls: { ...hlsOptions({}, config), directory } }),
    requireFreePort: async () => {}, probeApp: async () => true,
    spawn: (command, args) => {
      const child = new EventEmitter();
      Object.assign(child, { pid: 100 + children.length, exitCode: null, signalCode: null, command, args });
      children.push(child);
      return child;
    },
    stopChild: async child => { if (child) stopped.push(child); },
    hlsReady: () => true, verifyHls: async () => {}, now: () => clock,
    delay: async milliseconds => { clock += milliseconds; }, hlsTimeout: 400,
    ...overrides,
  });
  return { backend, children, stopped };
}

test('HLS starts packager before OBS, verifies HTTP serving and cleans up both', async t => {
  let verified = false;
  const { backend, children, stopped } = hlsFixture(t, { verifyHls: async () => { verified = true; } });
  const status = await backend.start();
  assert.equal(children[0].command, 'ffmpeg');
  assert.equal(children[1].command, 'obs');
  assert.ok(children[1].args.includes('--startstreaming'));
  assert.ok(children[0].args.includes('copy'));
  assert.equal(status.hls.ready, true);
  assert.equal(verified, true);
  await backend.stop();
  assert.deepEqual(stopped, [children[1], children[0]]);
});

test('HLS timeout and HTTP directory mismatch fail startup with owned cleanup', async t => {
  for (const overrides of [
    { hlsReady: () => false },
    { verifyHls: async () => { throw new Error('directory mismatch'); } },
  ]) {
    const { backend, children, stopped } = hlsFixture(t, overrides);
    await assert.rejects(backend.start(), /timed out|directory mismatch/);
    assert.deepEqual(stopped, [children[1], children[0]]);
  }
});

test('HLS rejects occupied ingest without spawning and fails on packager crash', async t => {
  const occupied = hlsFixture(t, { requireFreePort: async () => { throw new Error('port occupied'); } });
  await assert.rejects(occupied.backend.start(), /occupied/);
  assert.equal(occupied.children.length, 0);
  const running = hlsFixture(t);
  await running.backend.start();
  running.children[0].exitCode = 1;
  running.children[0].emit('exit', 1);
  await running.backend.stop();
  assert.match(running.backend.status().error, /HLS packager exited/);
  assert.equal(running.backend.status().hls.ready, false);
});

test('YouTube profile creation is separate, hardware encoded, and verifies RTMP service settings', t => {
  const { createYouTubeProfile, validateYouTubeProfile, ensureYouTubeProfile } = require('../obs-hls-profile');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-yt-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, 'basic', 'profiles', 'Original');
  fs.mkdirSync(original, { recursive: true });
  const contents = '[General]\nName=IntelliSTAR\n[Video]\nFPSCommon=60\n[Output]\nMode=Simple\n';
  fs.writeFileSync(path.join(original, 'basic.ini'), contents);

  const destination = createYouTubeProfile(root, 'IntelliSTAR', 'IntelliSTAR YouTube', '0bwt-p2gw-q02k-0y0q-7vph');
  const profile = validateYouTubeProfile(root, 'IntelliSTAR YouTube');
  assert.equal(profile.config.AdvOut.Encoder, 'ffmpeg_vaapi_tex');
  assert.equal(profile.config.Video.FPSCommon, '60');
  const service = JSON.parse(fs.readFileSync(path.join(destination, 'service.json'), 'utf8'));
  assert.equal(service.type, 'rtmp_custom');
  assert.equal(service.settings.server, 'rtmp://a.rtmp.youtube.com/live2');
  assert.equal(service.settings.key, '0bwt-p2gw-q02k-0y0q-7vph');

  ensureYouTubeProfile(root, 'IntelliSTAR YouTube', { YOUTUBE_STREAM_KEY: 'new-key-123' });
  const updatedService = JSON.parse(fs.readFileSync(path.join(destination, 'service.json'), 'utf8'));
  assert.equal(updatedService.settings.key, 'new-key-123');
});