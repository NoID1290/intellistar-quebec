'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

function controlRequest(socketPath, action, workspace, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let body = '';
    const timer = setTimeout(() => socket.destroy(new Error('OBS controller did not respond.')), timeout);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ action, workspace })}\n`));
    socket.on('data', chunk => {
      body += chunk;
      if (body.length > 65536) socket.destroy(new Error('Invalid OBS controller response.'));
    });
    socket.on('close', () => clearTimeout(timer));
    socket.on('error', error => {
      if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) resolve(null);
      else reject(error);
    });
    socket.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.error) throw new Error(data.error);
        if (data.service !== 'intellistar-obs') throw new Error('Unrecognized OBS controller.');
        resolve(data);
      } catch (error) { reject(error); }
    });
  });
}

async function listenControl(socketPath, workspace, status, stop) {
  if (Buffer.byteLength(socketPath) > 100) throw new Error('OBS control socket path is too long; use a shorter XDG_RUNTIME_DIR.');
  const directory = path.dirname(socketPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.uid !== process.getuid() || (directoryStat.mode & 0o077)) {
    throw new Error(`OBS control directory must be private, owned by you, and not a symlink: ${directory}`);
  }
  const server = net.createServer(socket => {
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('error', () => {});
    socket.setEncoding('utf8');
    let input = '';
    let handled = false;
    socket.on('data', chunk => {
      if (handled) return;
      input += chunk;
      if (input.length > 4096) { socket.destroy(); return; }
      if (!input.includes('\n')) return;
      handled = true;
      try {
        const request = JSON.parse(input.trim());
        if (!['status', 'stop'].includes(request.action)) throw new Error('Unknown OBS control action.');
        if (request.workspace !== workspace) throw new Error('An OBS launcher from another workspace owns this session.');
        socket.end(JSON.stringify({ service: 'intellistar-obs', workspace, ...status() }));
        if (request.action === 'stop') setImmediate(stop);
      } catch (error) { socket.end(JSON.stringify({ error: error.message })); }
    });
  });
  const listen = () => new Promise((resolve, reject) => {
    const onError = error => { server.removeListener('listening', onListening); reject(error); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });
  const before = fs.existsSync(socketPath) ? fs.lstatSync(socketPath) : null;
  try { await listen(); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    if (await controlRequest(socketPath, 'status', workspace)) throw new Error('The OBS launcher is already running. Use npm run obs:status.');
    const current = fs.lstatSync(socketPath);
    if (!before?.isSocket() || before.ino !== current.ino || before.dev !== current.dev || current.uid !== process.getuid()) {
      throw new Error('OBS control socket changed or is not owned by you; retry after checking the existing launcher.');
    }
    fs.unlinkSync(socketPath);
    await listen();
  }
  return { close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

module.exports = { controlRequest, listenControl };