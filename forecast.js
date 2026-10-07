#!/usr/bin/env node
// forecast.js - CLI command to control the forecast presentation on a running IntelliSTAR stream
const http = require('http');
const logger = require('./console-view');
const { c } = logger;

const args = process.argv.slice(2);
const command = (args[0] || 'help').toLowerCase();
const port = process.env.PORT || 7070;

const HELP_TEXT = `
${c.bold(c.cyan('IntelliSTAR Forecast Control CLI'))}
${c.dim('Usage:')}
  ${c.white('node forecast.js start')}            ${c.dim('Start the weather forecast presentation')}
  ${c.white('node forecast.js stop')}             ${c.dim('Stop the forecast and return to color bars (stream stays alive)')}
  ${c.white('node forecast.js status')}           ${c.dim('Check current forecast presentation state')}

${c.dim('Examples:')}
  ${c.cyan('node forecast.js start')}
  ${c.cyan('node forecast.js stop')}
  ${c.cyan('npm run forecast:start')}
  ${c.cyan('npm run forecast:stop')}
`;

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(HELP_TEXT);
  process.exit(0);
}

let endpoint = '';
if (command === 'start' || command === 'play' || command === 'run') {
  endpoint = '/api/forecast/start';
} else if (command === 'stop' || command === 'colorbar' || command === 'pause') {
  endpoint = '/api/forecast/stop';
} else if (command === 'status' || command === 'state' || command === 'info') {
  endpoint = '/api/forecast';
} else {
  logger.error(`Unknown command: "${command}"`);
  console.log(HELP_TEXT);
  process.exit(1);
}

const req = http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (command === 'status' || command === 'state' || command === 'info') {
        const state = data.state || (data.forecast && data.forecast.state) || 'idle';
        const action = data.action || (data.forecast && data.forecast.action) || 'status';
        logger.log('FORECAST', `Current state: ${c.bold(state.toUpperCase())} ${c.dim(`(last action: ${action})`)}`);
      } else {
        logger.forecast(data.message || 'Command executed successfully.');
      }
    } catch (e) {
      logger.forecast(`Server response: ${body}`);
    }
  });
});

req.on('error', (err) => {
  logger.error(`Could not connect to server at 127.0.0.1:${port} (${err.message})`);
  console.error(c.dim('Make sure the IntelliStar server (npm start or npm run start-iptv) is running.'));
});
