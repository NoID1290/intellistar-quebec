'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../launcher-ui');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const port = options.port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => JSON.parse(data),
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

test('Touchscreen UI launcher API and static assets', async (t) => {
  let server;
  let testPort;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  await t.test('serves launcher.html with touch metadata', async () => {
    const res = await request('/launcher.html', { port: testPort });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /<!DOCTYPE html>/i);
    assert.match(res.body, /user-scalable=no/);
    assert.match(res.body, /IntelliSTAR · Touch Launcher/);
    assert.match(res.body, /quick-control-grid/);
    assert.match(res.body, /Weather Alert Center/);
    assert.match(res.body, /btn-start-hls/);
    assert.match(res.body, /btn-start-ndi/);
    assert.match(res.body, /btn-start-youtube/);
    assert.match(res.body, /btn-start-dual/);
    assert.match(res.body, /btn-stop-obs/);
    assert.match(res.body, /btn-close-instance/);
    assert.match(res.body, /btn-sleep-monitors/);
    assert.match(res.body, /btn-header-sleep-monitors/);
    assert.match(res.body, /sleep-monitors-modal/);
    assert.match(res.body, /pc-stats-card/);
    assert.match(res.body, /CPU USAGE/);
    assert.match(res.body, /CPU TEMP/);
    assert.match(res.body, /GPU USAGE/);
    assert.match(res.body, /RAM/);
    assert.match(res.body, /DISK/);
  });

  await t.test('serves launcher CSS and JS client', async () => {
    const cssRes = await request('/css/launcher.css', { port: testPort });
    assert.equal(cssRes.statusCode, 200);
    assert.match(cssRes.body, /touch-action:\s*manipulation/);
    assert.match(cssRes.body, /--card:/);
    assert.match(cssRes.body, /\.stats-card/);

    const jsRes = await request('/js/launcher-client.js', { port: testPort });
    assert.equal(jsRes.statusCode, 200);
    assert.match(jsRes.body, /touchFeedback/);
    assert.match(jsRes.body, /refreshStatus/);
    assert.match(jsRes.body, /updateSystemStatsUI/);
  });

  await t.test('GET / redirects to /launcher.html', async () => {
    const res = await request('/', { port: testPort });
    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, '/launcher.html');
  });

  await t.test('GET /api/launcher/status returns structured telemetry', async () => {
    const res = await request('/api/launcher/status', { port: testPort });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.ok(typeof json.obs === 'object');
    assert.ok(typeof json.app === 'object');
    assert.ok(typeof json.forecast === 'object');
    assert.ok(typeof json.alert === 'object');
    assert.ok(typeof json.message === 'object');
    assert.ok(typeof json.system === 'object');
    assert.ok(typeof json.system.cpu === 'object');
    assert.equal(typeof json.system.cpu.usage, 'number');
    assert.ok(typeof json.system.gpu === 'object');
    assert.equal(typeof json.system.gpu.usage, 'number');
    assert.ok(typeof json.system.ram === 'object');
    assert.ok(typeof json.system.disk === 'object');
    assert.ok(Array.isArray(json.ips));
    assert.ok(typeof json.encoding === 'object');
    assert.ok(['720p', '1080p', '4k'].includes(json.encoding.resolution));
    assert.ok([24, 30, 60].includes(json.encoding.fps));
    assert.ok(typeof json.displays === 'object');
    assert.ok(Array.isArray(json.displays.outputs));
    assert.equal(typeof json.displays.allAsleep, 'boolean');
  });

  await t.test('POST /api/launcher/action set-encoding updates encoding preset', async () => {
    const res = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'set-encoding', resolution: '1080p', fps: 60 },
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.success, true);
    assert.equal(json.encoding.resolution, '1080p');
    assert.equal(json.encoding.fps, 60);
    assert.equal(json.encoding.width, 1920);
    assert.equal(json.encoding.height, 1080);
    assert.equal(typeof json.encoding.iconsSynced, 'boolean');
  });

  await t.test('POST /api/launcher/action sleep-monitors triggers display sleep', async () => {
    const res = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'sleep-monitors' },
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.success, true);
    assert.match(json.message, /monitors/i);
    assert.ok(typeof json.displays === 'object');
  });

  await t.test('POST /api/launcher/action wake-monitors triggers display wake', async () => {
    const res = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'wake-monitors' },
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.success, true);
    assert.match(json.message, /woken/i);
    assert.ok(typeof json.displays === 'object');
  });

  await t.test('POST /api/launcher/action close-instance responds with success', async () => {
    const res = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'close-instance' },
    });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.equal(json.success, true);
    assert.match(json.message, /closing/i);
  });

  await t.test('GET /api/launcher/scripts lists package.json scripts', async () => {
    const res = await request('/api/launcher/scripts', { port: testPort });
    assert.equal(res.statusCode, 200);
    const json = res.json();
    assert.ok(Array.isArray(json.scripts));
    assert.ok(json.scripts.includes('start-obs'));
    assert.ok(json.scripts.includes('test'));
  });

  await t.test('GET /api/launcher/logs returns text without throwing', async () => {
    const res = await request('/api/launcher/logs', { port: testPort });
    assert.equal(res.statusCode, 200);
    assert.equal(typeof res.body, 'string');
  });

  await t.test('POST /api/launcher/action validates input', async () => {
    const invalidRes = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'unknown-action-xyz' },
    });
    assert.equal(invalidRes.statusCode, 400);

    const missingMsgRes = await request('/api/launcher/action', {
      port: testPort,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { action: 'message' },
    });
    assert.equal(missingMsgRes.statusCode, 400);
  });
});

