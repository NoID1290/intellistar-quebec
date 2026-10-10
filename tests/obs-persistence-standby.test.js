'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createBackend, obsOptions } = require('../stream-obs');
const { createStandbyServer, DEFAULT_STANDBY_HTML } = require('../standby-server');
const { app } = require('../launcher-ui');

function fakeChild(pid = 100) {
  const child = new EventEmitter();
  Object.assign(child, { pid, exitCode: null, signalCode: null, stdio: [null, null, null, new EventEmitter()] });
  child.kill = signal => {
    child.signalCode = signal;
    child.exitCode = signal === 'SIGKILL' ? 137 : 0;
    child.emit('exit', child.exitCode, signal);
  };
  return child;
}

test('OBS backend continues broadcasting when IntelliSTAR app server shuts down', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-persist-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const spawned = [];
  const stopped = [];
  let logs = [];
  let probes = 0;

  const backend = createBackend(obsOptions({ PORT: '7172', XDG_RUNTIME_DIR: tempDir }), {
    preflight: () => ({ installation: 'native' }),
    probeApp: async () => ++probes > 1,
    spawn: (command, args, options) => {
      const child = fakeChild(spawned.length + 200);
      spawned.push({ command, args, options, child });
      return child;
    },
    stopChild: async child => {
      if (child) {
        stopped.push(child);
        child.kill('SIGINT');
      }
    },
    log: msg => logs.push(msg),
    disableStandby: true,
  });

  const status = await backend.start();
  assert.equal(status.phase, 'running');
  assert.equal(status.obs.processAlive, true);
  assert.equal(status.app.owned, true);
  assert.equal(status.app.processAlive, true);

  const appChild = spawned[0].child;
  const obsChild = spawned[1].child;

  // Simulate IntelliSTAR app server being shut down
  appChild.exitCode = 0;
  appChild.emit('exit', 0, null);

  // OBS must continue running!
  const statusAfterShutdown = backend.status();
  assert.equal(statusAfterShutdown.phase, 'running', 'Backend must stay in running phase');
  assert.equal(statusAfterShutdown.obs.processAlive, true, 'OBS process must continue alive');
  assert.equal(statusAfterShutdown.app.processAlive, false, 'App process is marked not alive');
  assert.ok(logs.some(m => m.includes('OBS encoder continues broadcasting')), 'Logs persistence notification');

  // Verify stopping OBS later still stops the OBS encoder child cleanly
  await backend.stop();
  assert.equal(backend.status().phase, 'stopped');
  assert.ok(stopped.includes(obsChild), 'OBS child stopped on explicit stop');
});

test('Standby server serves HLS stream segments, standby page and yields on request', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-standby-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  // Create dummy HLS playlist and segment in tempDir
  fs.writeFileSync(path.join(tempDir, 'index.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.000,\nsegment-0.ts\n');
  fs.writeFileSync(path.join(tempDir, 'segment-0.ts'), 'DUMMY_MPEGTS_STREAM_DATA');

  const standby = createStandbyServer({
    port: 0,
    hlsDirectory: tempDir,
  });

  // Start on an ephemeral port
  const server = http.createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const testPort = server.address().port;
  await new Promise(r => server.close(r));

  const customStandby = createStandbyServer({
    port: testPort,
    hlsDirectory: tempDir,
  });

  await customStandby.start();
  assert.equal(customStandby.isListening(), true);

  // 1. Check /api/health
  const healthRes = await fetch(`http://127.0.0.1:${testPort}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.service, 'intellistar');
  assert.equal(healthData.version, 1);
  assert.equal(healthData.standby, true);
  assert.equal(healthData.app, 'offline');
  assert.equal(healthData.encoder, 'active');

  // 2. Check /api/forecast fallback
  const forecastRes = await fetch(`http://127.0.0.1:${testPort}/api/forecast`);
  assert.equal(forecastRes.status, 200);
  const forecastData = await forecastRes.json();
  assert.equal(forecastData.standby, true);

  // 3. Check HLS stream serving (prevent IPTV loading errors)
  const m3u8Res = await fetch(`http://127.0.0.1:${testPort}/stream/index.m3u8`);
  assert.equal(m3u8Res.status, 200);
  assert.match(m3u8Res.headers.get('content-type'), /mpegurl/);
  assert.match(await m3u8Res.text(), /#EXTM3U/);

  const tsRes = await fetch(`http://127.0.0.1:${testPort}/stream/segment-0.ts`);
  assert.equal(tsRes.status, 200);
  assert.match(tsRes.headers.get('content-type'), /video\/mp2t/);
  assert.equal(await tsRes.text(), 'DUMMY_MPEGTS_STREAM_DATA');

  // 4. Check standby HTML page for Browser Source (/?iptv and /)
  const iptvRes = await fetch(`http://127.0.0.1:${testPort}/?iptv`);
  assert.equal(iptvRes.status, 200);
  const html = await iptvRes.text();
  assert.match(html, /SIGNAL EN ATTENTE/);
  assert.match(html, /INTELLISTAR/);

  // 5. Check /api/standby/yield
  const yieldRes = await fetch(`http://127.0.0.1:${testPort}/api/standby/yield`);
  assert.equal(yieldRes.status, 200);
  const yieldData = await yieldRes.json();
  assert.equal(yieldData.success, true);

  // Wait for server to yield socket
  await new Promise(r => setTimeout(r, 100));
  assert.equal(customStandby.isListening(), false);
});

test('Remote distance control endpoints on Touch UI launcher', async t => {
  let server;
  let testPort;

  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  // Verify dedicated distance routes
  const obsStatusRes = await fetch(`http://127.0.0.1:${testPort}/api/launcher/obs/status`);
  assert.equal(obsStatusRes.status, 200);
  const obsStatusData = await obsStatusRes.json();
  assert.ok(obsStatusData.obs);

  const appStatusRes = await fetch(`http://127.0.0.1:${testPort}/api/launcher/app/status`);
  assert.equal(appStatusRes.status, 200);
  const appStatusData = await appStatusRes.json();
  assert.ok(appStatusData.health);

  // Verify stop-obs action when broadcast is not running
  const stopObsRes = await fetch(`http://127.0.0.1:${testPort}/api/launcher/obs/stop`);
  assert.equal(stopObsRes.status, 200);
  const stopObsData = await stopObsRes.json();
  assert.equal(stopObsData.success, true);

  // Verify action dispatcher for app control
  const stopAppActionRes = await fetch(`http://127.0.0.1:${testPort}/api/launcher/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'stop-app' }),
  });
  assert.equal(stopAppActionRes.status, 200);
  const stopAppActionData = await stopAppActionRes.json();
  assert.equal(stopAppActionData.success, true);
});

test('Standby blackout overlay layout and audio muting integrity', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'main.css'), 'utf8');
  const settingsJs = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'js', 'settings.js'), 'utf8');

  // Verify standby-offline-screen does NOT use .container (which would cause translate(-50%, -50%) scaling issues)
  assert.doesNotMatch(html, /id="standby-offline-screen"[^>]*class="[^"]*container/);
  assert.match(html, /id="standby-offline-screen"[^>]*position:\s*fixed/);

  // Verify main.css enforces full-screen fixed dimensions
  assert.match(css, /#standby-offline-screen\s*\{[^}]*position:\s*fixed\s*!important/);
  assert.match(css, /#standby-offline-screen\s*\{[^}]*width:\s*100vw\s*!important/);
  assert.match(css, /#standby-offline-screen\s*\{[^}]*height:\s*100vh\s*!important/);

  // Verify settings.js cleanly hides color bars and stops test tone
  assert.match(settingsJs, /function showStandbyScreen\(\)/);
  assert.match(settingsJs, /\$\('#colorbar-screen'\)\.hide\(\)/);
  assert.match(settingsJs, /stopTestTone\(\)/);
});

