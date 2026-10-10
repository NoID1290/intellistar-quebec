'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { resolveHlsDirectory } = require('./stream-hls');
const streamConfig = require('./stream-config');

const DEFAULT_STANDBY_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>IntelliSTAR · Signal Standby</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body, html {
      width: 100%; height: 100%;
      background: #000000;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .standby-card {
      background: rgba(12, 18, 28, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      padding: 42px 54px;
      text-align: center;
      max-width: 780px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 16px;
    }
    .status-dot {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #f59e0b;
      box-shadow: 0 0 10px #f59e0b;
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .brand-title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #94a3b8;
    }
    .main-status {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #ffffff;
      margin-bottom: 14px;
    }
    .sub-msg {
      font-size: 16px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 22px;
    }
    .badge-pill {
      display: inline-block;
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      background: rgba(255, 255, 255, 0.05);
      padding: 8px 18px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
  </style>
</head>
<body>
  <div class="standby-card">
    <div class="brand-row">
      <div class="status-dot"></div>
      <div class="brand-title">INTELLISTAR · QUÉBEC</div>
    </div>
    <div class="main-status">SIGNAL EN ATTENTE</div>
    <div class="sub-msg">
      L'application météo est temporairement fermée ou en cours de maintenance.<br>
      La diffusion de l'encodeur reste active en continu.
    </div>
    <div class="badge-pill">Reprise automatique dès le redémarrage...</div>
  </div>
  <script>
    setInterval(async () => {
      try {
        const res = await fetch('/api/health?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (data && data.service === 'intellistar' && !data.standby) {
            window.location.reload();
          }
        }
      } catch (e) {}
    }, 1000);
  </script>
</body>
</html>`;

function createStandbyServer(options = {}, dependencies = {}) {
  const port = Number(options.port || process.env.PORT || 7070);
  const hlsDir = options.hlsDirectory || resolveHlsDirectory(options.streamConfig || streamConfig);
  const log = dependencies.log || (() => {});
  let server = null;
  let isListening = false;

  function start() {
    if (isListening || server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        let pathname = '/';
        try {
          const url = new URL(req.url, `http://127.0.0.1:${port}`);
          pathname = url.pathname;
        } catch {
          pathname = req.url || '/';
        }

        // Health endpoint
        if (pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify({ service: 'intellistar', version: 1, standby: true, app: 'offline', encoder: 'active' }));
        }

        // Standby yield request (when real app starts and needs port 7070)
        if (pathname === '/api/standby/yield') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ success: true, message: 'Standby server yielding port' }));
          setImmediate(() => { void stop(); });
          return;
        }

        // Fallback forecast endpoint (so frontend listeners get structured response)
        if (pathname === '/api/forecast') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          return res.end(JSON.stringify({ id: 0, action: 'standby', state: 'standby', standby: true }));
        }

        // Serve HLS files directly from hlsDirectory (keeps IPTV playback alive without interruption)
        if (pathname.startsWith('/stream/')) {
          const relative = pathname.slice('/stream/'.length);
          const safePath = path.normalize(relative).replace(/^(\.\.[\/\\])+/, '');
          const filePath = path.join(hlsDir, safePath);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const mime = ext === '.m3u8' ? 'application/vnd.apple.mpegurl' : (ext === '.ts' ? 'video/mp2t' : 'application/octet-stream');
            res.writeHead(200, {
              'Content-Type': mime,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
            return fs.createReadStream(filePath).pipe(res);
          }
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('HLS segment not found');
        }

        // Standby page for everything else (including /?iptv, /, /index.html)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(options.html || DEFAULT_STANDBY_HTML);
      });

      server.on('error', err => {
        isListening = false;
        reject(err);
      });

      server.listen(port, '0.0.0.0', () => {
        isListening = true;
        log(`Standby HTTP server active on port ${port} (holding HLS and standby display)`);
        resolve();
      });
    });
  }

  function stop() {
    if (!server) return Promise.resolve();
    return new Promise(resolve => {
      const s = server;
      server = null;
      isListening = false;
      s.close(() => resolve());
    });
  }

  return { start, stop, isListening: () => isListening };
}

module.exports = { createStandbyServer, DEFAULT_STANDBY_HTML };

