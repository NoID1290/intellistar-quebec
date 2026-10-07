'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { obsOptions, selectInstallation, obsCommand, requireDesktop } = require('../stream-obs');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { validateSavedSetup, probeApp, stopChild, createBackend } = require('../stream-obs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { controlRequest, listenControl } = require('../obs-control');
const { desktopEnvironments, desktopAvailable, resolveDesktopEnvironment } = require('../stream-obs');

test('OBS options default to a dedicated scene and support the configured app port', () => {
  assert.equal(obsOptions({}).url, 'http://127.0.0.1:7070/?iptv');
  assert.equal(obsOptions({ PORT: '7171' }).url, 'http://127.0.0.1:7171/?iptv');
  assert.equal(obsOptions({}).profile, 'IntelliSTAR');
  for (const port of ['abc', '0', '-1', '65536', '1.5']) assert.throws(() => obsOptions({ PORT: port }), /PORT/);
});

test('OBS names are passed as separate arguments without shell interpretation', () => {
  const options = obsOptions({ OBS_PROFILE: 'My Profile; $(touch never)', OBS_COLLECTION: 'Weather', OBS_SCENE: 'Main Scene' });
  const launch = obsCommand(options, 'native');
  assert.equal(launch.command, 'obs');
  assert.deepEqual(launch.args, ['--profile', options.profile, '--collection', 'Weather', '--scene', 'Main Scene', '--minimize-to-tray']);
  for (const name of ['', '  ', ' padded', 'newline\n', 'a'.repeat(101)]) {
    assert.throws(() => obsOptions({ OBS_SCENE: name }), /OBS_SCENE/);
  }
});

test('Flatpak launch captures the owned instance identity and does not start RTMP', () => {
  const launch = obsCommand(obsOptions({}), 'flatpak');
  assert.equal(launch.command, 'flatpak');
  assert.deepEqual(launch.args.slice(0, 4), ['run', '--die-with-parent', '--instance-id-fd=3', 'com.obsproject.Studio']);
  assert.ok(!launch.args.includes('--startstreaming'));
  assert.ok(!launch.args.includes('--multi'));
});

test('installation detection refuses ambiguity and missing executables', () => {
  assert.equal(selectInstallation('auto', { flatpak: true }), 'flatpak');
  assert.equal(selectInstallation('auto', { native: true }), 'native');
  assert.equal(selectInstallation('flatpak', { native: true, flatpak: true }), 'flatpak');
  assert.throws(() => selectInstallation('auto', { native: true, flatpak: true }), /Both/);
  assert.throws(() => selectInstallation('auto', {}), /unavailable/);
  assert.throws(() => selectInstallation('native', { flatpak: true }), /unavailable/);
  assert.throws(() => obsOptions({ OBS_INSTALLATION: 'other' }), /OBS_INSTALLATION/);
});

test('OBS requires an explicit desktop session, not an invented display number', () => {
  assert.throws(() => requireDesktop({}), /logged-in desktop/);
  requireDesktop({ DISPLAY: ':1' });
  requireDesktop({ WAYLAND_DISPLAY: 'wayland-0' });
});

test('SSH resolves only desktop session variables and preserves unrelated application settings', () => {
  const desktop = { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', XDG_RUNTIME_DIR: '/run/user/1000',
    DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XAUTHORITY: '/run/user/1000/xauth',
    XDG_SESSION_TYPE: 'wayland', PATH: '/not-inherited', SECRET: 'not-inherited' };
  const shell = { PATH: '/original', PORT: '7171', XDG_SESSION_TYPE: 'tty', XDG_RUNTIME_DIR: '/run/user/1000' };
  const resolved = resolveDesktopEnvironment(shell, { discover: () => [desktop], available: () => true });
  assert.equal(resolved.DISPLAY, ':0');
  assert.equal(resolved.WAYLAND_DISPLAY, 'wayland-0');
  assert.equal(resolved.XAUTHORITY, desktop.XAUTHORITY);
  assert.equal(resolved.DBUS_SESSION_BUS_ADDRESS, desktop.DBUS_SESSION_BUS_ADDRESS);
  assert.equal(resolved.XDG_SESSION_TYPE, 'wayland');
  assert.equal(resolved.PATH, '/original');
  assert.equal(resolved.PORT, '7171');
  assert.equal(resolved.SECRET, undefined);
  assert.equal(shell.DISPLAY, undefined);
  assert.deepEqual(resolveDesktopEnvironment({ DISPLAY: ':9' }, { discover: () => assert.fail('explicit display must win') }), { DISPLAY: ':9' });
});

test('SSH resolution rejects missing, stale, mismatched or ambiguous desktop sessions', () => {
  const desktop = { DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000' };
  assert.throws(() => resolveDesktopEnvironment({}, { discover: () => [], available: () => true }), /No accessible desktop/);
  assert.throws(() => resolveDesktopEnvironment({}, { discover: () => [desktop], available: () => false }), /No accessible desktop/);
  assert.throws(() => resolveDesktopEnvironment({ XDG_RUNTIME_DIR: '/another' }, { discover: () => [desktop], available: () => true }), /No accessible desktop/);
  assert.throws(() => resolveDesktopEnvironment({}, { discover: () => [desktop, { ...desktop, DISPLAY: ':1' }], available: () => true }), /Multiple desktop/);
  assert.equal(resolveDesktopEnvironment({}, { discover: () => [desktop, desktop], available: () => true }).DISPLAY, ':0');
});

test('desktop discovery filters process owner, process name and environment keys', t => {
  const directory = tempDirectory(t);
  for (const [pid, name] of [['100', 'plasmashell'], ['101', 'unrelated']]) {
    fs.mkdirSync(path.join(directory, pid));
    fs.writeFileSync(path.join(directory, pid, 'comm'), `${name}\n`);
    fs.writeFileSync(path.join(directory, pid, 'environ'), 'DISPLAY=:0\0XAUTHORITY=/run/user/1000/auth\0SECRET=private\0');
  }
  assert.deepEqual(desktopEnvironments(directory), [{ DISPLAY: ':0', XAUTHORITY: '/run/user/1000/auth' }]);
  assert.deepEqual(desktopEnvironments(directory, process.getuid() + 1), []);
});

test('desktop discovery requires a live same-user Wayland socket', async t => {
  const directory = tempDirectory(t);
  const socketPath = path.join(directory, 'wayland-test');
  const env = { XDG_RUNTIME_DIR: directory, WAYLAND_DISPLAY: 'wayland-test' };
  assert.equal(desktopAvailable(env), false);
  const server = require('node:net').createServer();
  await new Promise(resolve => server.listen(socketPath, resolve));
  try {
    assert.equal(desktopAvailable(env), true);
    assert.equal(desktopAvailable(env, process.getuid() + 1), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.equal(desktopAvailable(env), false);
});

function savedCollection(url = 'http://127.0.0.1:7070/?iptv') {
  return { name: 'IntelliSTAR', sources: [
    { id: 'scene', name: 'IntelliSTAR', settings: { items: [{ name: 'Weather', visible: true }] } },
    { id: 'browser_source', name: 'Weather', settings: { url } },
  ] };
}

test('saved setup must name a real profile, scene and visible direct Browser Source', () => {
  const options = obsOptions({});
  const profiles = [{ General: { Name: 'IntelliSTAR' } }];
  validateSavedSetup(options, profiles, [savedCollection()]);
  assert.throws(() => validateSavedSetup(options, [], [savedCollection()]), /profile/);
  assert.throws(() => validateSavedSetup(options, profiles, []), /scene/);
  assert.throws(() => validateSavedSetup(options, profiles, [savedCollection('http://127.0.0.1:7171/?iptv')]), /Browser Source/);
  assert.throws(() => validateSavedSetup(options, profiles, [savedCollection('http://127.0.0.1:7070/stream/index.m3u8')]), /Browser Source/);
  const hidden = savedCollection();
  hidden.sources[0].settings.items[0].visible = false;
  assert.throws(() => validateSavedSetup(options, profiles, [hidden]), /visible/);
});

test('saved Browser Source can be in a group referenced by UUID', () => {
  const collection = savedCollection();
  collection.sources[0].settings.items = [{ source_uuid: 'group-id' }];
  collection.sources.push({ id: 'group', uuid: 'group-id', settings: { items: [{ name: 'Weather' }] } });
  validateSavedSetup(obsOptions({}), [{ General: { Name: 'IntelliSTAR' } }], [collection]);
});

test('saved Browser Source accepts localhost as the IPv4 loopback alias but not other origins', () => {
  const profiles = [{ General: { Name: 'IntelliSTAR' } }];
  for (const host of ['localhost', '127.0.0.1']) {
    const collection = savedCollection(`http://${host}:7070/?iptv`);
    collection.sources[1].uuid = 'browser-id';
    collection.sources[0].settings.items = [{ source_uuid: 'browser-id', visible: true }];
    validateSavedSetup(obsOptions({}), profiles, [collection]);
  }
  for (const url of ['http://localhost:7171/?iptv', 'https://localhost:7070/?iptv',
    'http://localhost.example:7070/?iptv', 'http://user@localhost:7070/?iptv', 'http://localhost:7070/']) {
    assert.throws(() => validateSavedSetup(obsOptions({}), profiles, [savedCollection(url)]), /Browser Source/);
  }
});

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

test('app probe recognizes IntelliSTAR and rejects unrelated or stalled HTTP servers', async t => {
  const good = await serve(t, (request, response) => {
    assert.equal(request.url, '/api/health');
    response.end(JSON.stringify({ service: 'intellistar', version: 1 }));
  });
  assert.equal(await probeApp(good), true);
  const wrong = await serve(t, (request, response) => response.end('{}'));
  await assert.rejects(probeApp(wrong), /unrecognized server/);
  const stalled = await serve(t, () => {});
  await assert.rejects(probeApp(stalled, 20), /Timed out/);
});

function fakeChild(pid = 100) {
  const child = new EventEmitter();
  Object.assign(child, { pid, exitCode: null, signalCode: null, stdio: [null, null, null, new EventEmitter()] });
  child.kill = signal => { child.signalCode = signal; child.emit('exit', null, signal); };
  return child;
}

function backendFixture(overrides = {}) {
  const spawned = [];
  const stopped = [];
  let clock = 0;
  const backend = createBackend(obsOptions({ PORT: '7171' }), {
    preflight: () => ({ installation: 'native' }),
    probeApp: async () => true,
    spawn: (command, args, options) => {
      const child = fakeChild(spawned.length + 100);
      spawned.push({ command, args, options, child });
      return child;
    },
    stopChild: async child => { if (child) { stopped.push(child); child.kill('SIGINT'); } },
    delay: async milliseconds => { clock += milliseconds; }, now: () => clock,
    startupTimeout: 200, ...overrides,
  });
  return { backend, spawned, stopped };
}

test('reuse leaves a preexisting app server alone and never launches legacy capture', async () => {
  const { backend, spawned, stopped } = backendFixture();
  const status = await backend.start();
  assert.equal(status.app.owned, false);
  assert.equal(status.phase, 'running');
  assert.match(status.ndi, /unverified/);
  assert.deepEqual(spawned.map(item => item.command), ['obs']);
  await backend.stop();
  await backend.stop();
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0], spawned[0].child);
});

test('resolved desktop environment reaches both owned app and OBS processes', async () => {
  let probes = 0;
  const env = { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', XAUTHORITY: '/actual/auth' };
  const { backend, spawned } = backendFixture({
    preflight: () => ({ installation: 'native', env }), probeApp: async () => ++probes > 1,
  });
  await backend.start();
  assert.equal(spawned[0].options.env.XAUTHORITY, env.XAUTHORITY);
  assert.deepEqual(spawned[1].options.env, env);
  await backend.stop();
});

test('new app server is ready before OBS starts and both owned children are stopped', async () => {
  let probes = 0;
  const { backend, spawned, stopped } = backendFixture({ probeApp: async () => ++probes > 2 });
  const status = await backend.start();
  assert.equal(status.app.owned, true);
  assert.equal(spawned[0].args[0], require('node:path').resolve(__dirname, '../app.js'));
  assert.equal(spawned[0].options.env.PORT, '7171');
  assert.equal(spawned[1].command, 'obs');
  assert.equal(spawned.length, 2);
  await backend.stop();
  assert.deepEqual(stopped, [spawned[1].child, spawned[0].child]);
});

test('preflight and occupied port errors spawn nothing', async () => {
  for (const overrides of [
    { preflight: () => { throw new Error('OBS already running'); } },
    { probeApp: async () => { throw new Error('port occupied'); } },
  ]) {
    const { backend, spawned } = backendFixture(overrides);
    await assert.rejects(backend.start(), /already running|port occupied/);
    assert.equal(spawned.length, 0);
  }
});

test('server startup timeout cleans up only the partial startup', async () => {
  const { backend, spawned, stopped } = backendFixture({ probeApp: async () => false });
  await assert.rejects(backend.start(), /timed out/);
  assert.equal(spawned.length, 1);
  assert.deepEqual(stopped, [spawned[0].child]);
});

test('stopping during readiness prevents OBS from spawning', async () => {
  let release;
  const { backend, spawned } = backendFixture({ probeApp: () => new Promise(resolve => { release = resolve; }) });
  const starting = backend.start();
  await backend.stop();
  release(false);
  await assert.rejects(starting, /cancelled/);
  assert.equal(spawned.length, 0);
});

test('OBS spawn failure and unexpected exit clean up owned resources', async () => {
  const { backend, spawned, stopped } = backendFixture();
  await backend.start();
  spawned[0].child.emit('error', new Error('spawn failed'));
  await backend.stop();
  assert.equal(backend.status().phase, 'failed');
  assert.match(backend.status().error, /spawn failed/);
  assert.equal(stopped.length, 1);
  const other = backendFixture();
  await other.backend.start();
  other.spawned[0].child.kill('SIGABRT');
  await other.backend.stop();
  assert.match(other.backend.status().error, /OBS exited/);
});

test('bounded shutdown escalates only a live owned child', async () => {
  const child = fakeChild();
  const signals = [];
  let forced = 0;
  child.kill = signal => { signals.push(signal); };
  await stopChild(child, { timeout: 10, force: () => { forced++; } });
  assert.deepEqual(signals, ['SIGINT', 'SIGKILL']);
  assert.equal(forced, 1);
  child.exitCode = 0;
  await stopChild(child, { force: () => { forced++; } });
  assert.equal(forced, 1);
});

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('private controller reports status, refuses duplicates and routes stop only to its owner', async t => {
  const socketPath = path.join(tempDirectory(t), 'control.sock');
  let stopCount = 0;
  const control = await listenControl(socketPath, '/workspace', () => ({ phase: 'running' }), () => { stopCount++; });
  try {
    assert.equal((await controlRequest(socketPath, 'status', '/workspace')).phase, 'running');
    await assert.rejects(listenControl(socketPath, '/workspace', () => ({}), () => {}), /already running/);
    await assert.rejects(controlRequest(socketPath, 'stop', '/other-workspace'), /another workspace/);
    assert.equal(stopCount, 0);
    await controlRequest(socketPath, 'stop', '/workspace');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopCount, 1);
  } finally { await control.close(); }
  assert.equal(await controlRequest(socketPath, 'status', '/workspace'), null);
});

test('a stale socket from a crashed launcher can be reclaimed', async t => {
  const socketPath = path.join(tempDirectory(t), 'control.sock');
  const child = spawn(process.execPath, ['-e', 'require("node:net").createServer().listen(process.argv[1], () => process.exit(0));', socketPath]);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`fixture exited ${code}`)));
  });
  assert.ok(fs.existsSync(socketPath));
  const control = await listenControl(socketPath, '/workspace', () => ({ phase: 'running' }), () => {});
  assert.equal((await controlRequest(socketPath, 'status', '/workspace')).phase, 'running');
  await control.close();
});

test('control directory must be private and non-socket files are never deleted', async t => {
  const directory = tempDirectory(t);
  const socketPath = path.join(directory, 'control.sock');
  fs.chmodSync(directory, 0o755);
  await assert.rejects(listenControl(socketPath, '/workspace', () => ({}), () => {}), /private/);
  fs.chmodSync(directory, 0o700);
  fs.writeFileSync(socketPath, 'not a socket');
  await assert.rejects(listenControl(socketPath, '/workspace', () => ({}), () => {}), /not owned|changed/);
  assert.equal(fs.readFileSync(socketPath, 'utf8'), 'not a socket');
});

test('Flatpak cleanup addresses only the instance obtained from its launch pipe', async () => {
  const killed = [];
  const { backend, spawned } = backendFixture({
    preflight: () => ({ installation: 'flatpak' }), killFlatpak: instance => killed.push(instance),
  });
  await backend.start();
  spawned[0].child.stdio[3].emit('data', Buffer.from('123456\n'));
  await backend.stop();
  assert.deepEqual(killed, ['123456']);
  const other = backendFixture({
    preflight: () => ({ installation: 'flatpak' }), killFlatpak: () => assert.fail('invalid instance must never be killed'),
  });
  await other.backend.start();
  other.spawned[0].child.stdio[3].emit('data', Buffer.from('com.obsproject.Studio; anything'));
  await other.backend.stop();
});

async function waitFor(check, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('Test readiness timed out.');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function commandProcess(args, env) {
  const child = spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..'), env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve({ code, stdout, stderr }));
  });
  return { child, exited };
}

test('real CLI starts/stops twice, rejects duplicates, and preserves a reused real app server', { timeout: 25000 }, async t => {
  const directory = tempDirectory(t);
  const binaryDir = path.join(directory, 'bin');
  const configDir = path.join(directory, 'config');
  const profilesDir = path.join(configDir, 'obs-studio', 'basic', 'profiles', 'IntelliSTAR');
  const scenesDir = path.join(configDir, 'obs-studio', 'basic', 'scenes');
  for (const target of [binaryDir, profilesDir, scenesDir]) fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(binaryDir, 'obs'), `#!${process.execPath}\nif (process.argv.includes('--version')) { console.log('OBS test fixture'); process.exit(0); }\nsetInterval(() => {}, 1000);\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(profilesDir, 'basic.ini'), '[General]\nName=IntelliSTAR\n');
  const reservation = require('node:net').createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, PATH: `${binaryDir}:${process.env.PATH}`, PORT: String(port), DISPLAY: ':test',
    OBS_INSTALLATION: 'native', OBS_PROFILE: 'IntelliSTAR', OBS_COLLECTION: 'IntelliSTAR', OBS_SCENE: 'IntelliSTAR',
    XDG_CONFIG_HOME: configDir, XDG_RUNTIME_DIR: directory, INTELLISTAR_PRESET_DIR: path.join(directory, 'presets'),
    STREAM_USE_RAM_CACHE: 'false', STREAM_HLS_DIRECTORY: path.join(directory, 'hls') };
  fs.writeFileSync(path.join(scenesDir, 'IntelliSTAR.json'), JSON.stringify(savedCollection(obsOptions(env).url)));
  const socketPath = obsOptions(env).socketPath;
  const workspace = path.resolve(__dirname, '..');
  let reusedServer = null;
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle === 1) {
      reusedServer = commandProcess(['app.js'], env);
      t.after(() => stopChild(reusedServer.child));
      await waitFor(() => probeApp(port));
    }
    const launcher = commandProcess(['start-obs.js', 'start'], env);
    t.after(() => stopChild(launcher.child));
    await waitFor(async () => {
      if (launcher.child.exitCode !== null) assert.fail(JSON.stringify(await launcher.exited));
      return (await controlRequest(socketPath, 'status', workspace))?.phase === 'running';
    });
    const statusCommand = await commandProcess(['start-obs.js', 'status'], env).exited;
    assert.equal(statusCommand.code, 0, statusCommand.stderr);
    const status = JSON.parse(statusCommand.stdout);
    assert.equal(status.app.health, 'ready');
    assert.equal(status.app.owned, cycle === 0);
    assert.equal(status.obs.processAlive, true);
    assert.equal(status.url, obsOptions(env).url);
    const duplicate = await commandProcess(['start-obs.js', 'start'], env).exited;
    assert.equal(duplicate.code, 1);
    assert.match(`${duplicate.stderr}${duplicate.stdout}`, /already running/);
    const stopping = await commandProcess(['start-obs.js', 'stop'], env).exited;
    assert.equal(stopping.code, 0, stopping.stderr);
    assert.equal((await launcher.exited).code, 0);
    assert.equal(await controlRequest(socketPath, 'status', workspace), null);
    assert.equal(await probeApp(port), cycle === 1);
    assert.throws(() => process.kill(status.obs.pid, 0), { code: 'ESRCH' });
  }
  assert.equal(reusedServer.child.exitCode, null);
  await stopChild(reusedServer.child);
});