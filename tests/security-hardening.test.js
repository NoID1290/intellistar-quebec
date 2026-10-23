'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  isNodeRuntimePatched,
  inspectIncomingRequest,
  resolveSafeChildPath,
} = require('../security-guard');
const app = require('../app');
const { app: launcherApp } = require('../launcher-ui');
const { createStandbyServer } = require('../standby-server');

function rawRequest(port, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method: options.method || 'GET',
        path: options.path || '/',
        headers: options.headers || {},
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('October 2026 Security Patch Verification (Node2Shell CVE-2026-111497 & PHP2Shell)', async t => {
  await t.test('Active Node.js runtime meets October 21, 2026 security release minimum', () => {
    assert.equal(isNodeRuntimePatched(process.versions.node), true, `Expected patched Node runtime, got ${process.versions.node}`);
    assert.equal(isNodeRuntimePatched('24.20.0'), false);
    assert.equal(isNodeRuntimePatched('24.22.0'), false);
    assert.equal(isNodeRuntimePatched('24.22.1'), true);
    assert.equal(isNodeRuntimePatched('22.23.3'), false);
    assert.equal(isNodeRuntimePatched('22.23.4'), true);
    assert.equal(isNodeRuntimePatched('26.12.0'), false);
    assert.equal(isNodeRuntimePatched('26.12.1'), true);
  });

  await t.test('Main app server blocks Node2Shell (Content-Encoding: br), PHP2Shell probes, NUL bytes, and traversal', async () => {
    const server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();

    try {
      // 1. Health check includes security status & hardening headers
      const health = await rawRequest(port, { path: '/api/health' });
      assert.equal(health.status, 200);
      assert.equal(health.json.securityPatched, true);
      assert.equal(health.headers['x-content-type-options'], 'nosniff');
      assert.equal(health.headers['x-frame-options'], 'SAMEORIGIN');
      assert.equal(health.headers['x-powered-by'], undefined);

      // 2. CVE-2026-111497 (Node2Shell): reject Brotli-compressed request bodies before body-parser
      const brRes = await rawRequest(port, {
        method: 'POST',
        path: '/api/message',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'br',
        },
        body: 'malicious-brotli-payload',
      });
      assert.equal(brRes.status, 415);
      assert.equal(brRes.json.code, 'BROTLI_INPUT_BLOCKED');

      // 3. CVE-2026-109618 / CVE-2026-109619 (PHP2Shell): reject .php and CGI probes
      const phpRes = await rawRequest(port, { path: '/vendor/phpunit/eval-stdin.php' });
      assert.equal(phpRes.status, 403);
      assert.equal(phpRes.json.code, 'PHP_PROBE_BLOCKED');

      const cgiRes = await rawRequest(port, { path: '/index.html?-d+allow_url_include%3d1' });
      assert.equal(cgiRes.status, 403);
      assert.equal(cgiRes.json.code, 'PHP_PROBE_BLOCKED');

      // 4. CVE-2026-105482: reject NUL byte (%00) in URL
      const nulRes = await rawRequest(port, { path: '/api/health%00.json' });
      assert.equal(nulRes.status, 400);
      assert.equal(nulRes.json.code, 'NUL_BYTE_BLOCKED');

      // 5. CVE-2026-105483: reject fullwidth / non-ASCII Host header
      const hostRes = inspectIncomingRequest({
        url: '/api/health',
        headers: { host: '１２７.0.0.1:7070' },
      });
      assert.ok(hostRes);
      assert.equal(hostRes.status, 400);
      assert.equal(hostRes.code, 'NON_ASCII_HOST_BLOCKED');

      // 6. Path traversal blocked
      const travRes = await rawRequest(port, { path: '/stream/%2e%2e/package.json' });
      assert.equal(travRes.status, 403);
      assert.equal(travRes.json.code, 'PATH_TRAVERSAL_BLOCKED');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await t.test('Launcher server enforces security middleware and script allowlist', async () => {
    const server = await new Promise(resolve => {
      const s = launcherApp.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();

    try {
      const brRes = await rawRequest(port, {
        method: 'POST',
        path: '/api/launcher/action',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip, br',
        },
        body: '{}',
      });
      assert.equal(brRes.status, 415);
      assert.equal(brRes.json.code, 'BROTLI_INPUT_BLOCKED');

      const badScript = await rawRequest(port, {
        method: 'POST',
        path: '/api/launcher/action',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run-script', script: '--eval=evil' }),
      });
      assert.equal(badScript.status, 400);
      assert.match(badScript.json.error, /Disallowed or unknown script/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  await t.test('Standby server blocks exploit probes and enforces safe child paths', async () => {
    const tmpHls = fs.mkdtempSync(path.join(os.tmpdir(), 'intellistar-sec-hls-'));
    fs.writeFileSync(path.join(tmpHls, 'stream.m3u8'), '#EXTM3U\n', 'utf8');

    const probeSrv = http.createServer();
    await new Promise(r => probeSrv.listen(0, '127.0.0.1', r));
    const freePort = probeSrv.address().port;
    await new Promise(r => probeSrv.close(r));

    const standby = createStandbyServer({ port: freePort, hlsDirectory: tmpHls });
    await standby.start();

    try {
      const okHls = await rawRequest(freePort, { path: '/stream/stream.m3u8' });
      assert.equal(okHls.status, 200);

      const phpProbe = await rawRequest(freePort, { path: '/shell.php' });
      assert.equal(phpProbe.status, 403);

      const travProbe = await rawRequest(freePort, { path: '/stream/%2e%2e/MYCONFIG.json' });
      assert.equal(travProbe.status, 403);

      assert.equal(resolveSafeChildPath(tmpHls, '../MYCONFIG.json'), null);
      assert.equal(resolveSafeChildPath(tmpHls, '%2e%2e/MYCONFIG.json'), null);
      assert.equal(resolveSafeChildPath(tmpHls, 'stream.m3u8'), path.join(tmpHls, 'stream.m3u8'));
    } finally {
      await standby.stop();
      fs.rmSync(tmpHls, { recursive: true, force: true });
    }
  });
});

