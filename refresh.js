#!/usr/bin/env node
// refresh.js - CLI command to hot-reload all frontend JavaScript files in running IntelliStar without killing stream
const http = require('http');
const logger = require('./console-view');
const { c } = logger;

const port = process.env.PORT || 7070;
const args = process.argv.slice(2);

if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  console.log(`
${c.bold(c.cyan('IntelliSTAR Live JS Refresh CLI'))}
${c.dim('Usage:')}
  ${c.white('node refresh.js')}          ${c.dim('Trigger live hot-reload of all frontend JS files')}
  ${c.white('npm run refresh')}          ${c.dim('Run via npm script')}
  ${c.white('refresh.bat')}              ${c.dim('Windows batch wrapper')}
  ${c.white('./refresh.sh')}             ${c.dim('Linux/macOS shell wrapper')}

${c.dim('Description:')}
  ${c.dim('Hot-reloads all JavaScript modules in the running browser client (slides.js,')}
  ${c.dim('ldl.js, radar.js, weather.js, settings.js, config.js, audio.js, etc.) with')}
  ${c.dim('cache-busting query strings without reloading the web page or dropping the stream.')}
`);
  process.exit(0);
}

const req = http.get(`http://127.0.0.1:${port}/api/refresh?trigger=1`, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      logger.refresh(data.message || 'Live JS refresh triggered successfully.');
      logger.log('REFRESH', 'All frontend JavaScript files reloaded in the live stream', c.green('✓'));
    } catch (e) {
      logger.refresh(`Server response: ${body}`);
    }
  });
});

req.on('error', (err) => {
  logger.error(`Could not connect to server at 127.0.0.1:${port} (${err.message})`);
  console.error(c.dim('Make sure the IntelliStar server (npm start or npm run start-iptv) is running.'));
});
