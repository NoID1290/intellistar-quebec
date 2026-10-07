#!/usr/bin/env node
// message.js - CLI command to inject custom marquee messages into the LDL crawl at any time
const http = require('http');
const logger = require('./console-view');
const { c } = logger;

const args = process.argv.slice(2);
const port = process.env.PORT || 7070;

if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
  console.log(`
${c.bold(c.magentaBright('IntelliSTAR Custom LDL Message CLI'))}
${c.dim('Usage:')}
  ${c.white('node message.js "<message text>"')}     ${c.dim('Inject custom text to crawl across the LDL immediately')}
  ${c.white('node message.js clear')}                 ${c.dim('Clear the active message command')}

${c.dim('Examples:')}
  ${c.cyan('node message.js "Bienvenue sur le canal météo IntelliSTAR"')}
  ${c.cyan('node message.js "Visitez notre site Web pour les alertes en direct"')}
  ${c.cyan('node message.js "Suivez notre bulletin spécial ce soir à 20h"')}
  ${c.cyan('npm run message -- "Message en direct"')}
`);
  process.exit(0);
}

let endpoint = '';
if (args[0].toLowerCase() === 'clear') {
  endpoint = '/api/message/clear';
} else {
  const messageText = args.join(' ').trim();
  endpoint = `/api/message/send?text=${encodeURIComponent(messageText)}`;
}

const req = http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      logger.message(data.message || 'Custom message command sent successfully.');
    } catch (e) {
      logger.message(`Server response: ${body}`);
    }
  });
});

req.on('error', (err) => {
  logger.error(`Could not connect to server at 127.0.0.1:${port} (${err.message})`);
  console.error(c.dim('Make sure the IntelliStar server (npm start or npm run start-iptv) is running.'));
});
