#!/usr/bin/env node
// alert.js - CLI command to inject alert tests into running IntelliStar
const http = require('http');
const logger = require('./console-view');
const { c } = logger;

const args = process.argv.slice(2);
const command = (args[0] || 'help').toLowerCase();
const port = process.env.PORT || 7070;

const HELP_TEXT = `
${c.bold(c.redBright('IntelliSTAR Alert Injection CLI'))}
${c.dim('Usage:')}
  ${c.white('node alert.js <type> [--duration <sec>]')} ${c.dim('Trigger an alert test (optional auto-expiry duration)')}
  ${c.white('node alert.js clear')}                     ${c.dim('Clear active alert test')}
  ${c.white('node alert.js quebec [--duration <sec>]')} ${c.dim('Trigger Québec En Alerte suite')}
  ${c.white('node alert.js all [--duration <sec>]')}    ${c.dim('Trigger all disaster alerts')}
  ${c.white('node alert.js list')}                      ${c.dim('Show all available alert types')}

${c.dim('Examples:')}
  ${c.cyan('node alert.js tornado')}
  ${c.cyan('node alert.js tornado --duration 30')}
  ${c.cyan('node alert.js severe -d 60')}
  ${c.cyan('node alert.js amber')}
  ${c.cyan('node alert.js blizzard')}
  ${c.cyan('node alert.js flash-flood')}
  ${c.cyan('node alert.js "Winter Storm Warning"')}
  ${c.cyan('node alert.js clear')}
`;

const ALERT_TYPES = [
  "AMBER Alert",
  "Tornado Warning",
  "Severe Thunderstorm Warning",
  "Flash Flood Warning",
  "Flood Warning",
  "Hurricane Warning",
  "Tsunami Warning",
  "Blizzard Warning",
  "Winter Storm Warning",
  "Ice Storm Warning",
  "Wind Warning",
  "Heat Warning",
  "Fire Warning",
  "Earthquake Warning",
  "Volcano Warning",
  "Ashfall Warning",
  "Avertissement de smog",
  "Dense Fog Advisory",
  "Avertissement de pluie",
  "Special Weather Statement",
  "Avis de gel",
  "Freeze Warning",
  "Frost Advisory",
  "Squall Watch",
  "Squall Warning",
  "Snow Squall Warning",
  "Veille de rafales",
  "Avertissement de rafales",
  "Veille de bourrasques"
];

if (command === 'help' || command === '--help' || command === '-h') {
  console.log(HELP_TEXT);
  process.exit(0);
}

if (command === 'list') {
  console.log(`\n${c.bold(c.cyan('Available Alert Types:'))}`);
  ALERT_TYPES.forEach(t => console.log(`  ${c.redBright('•')} ${c.white(t)}`));
  console.log(`\n${c.dim('Common Aliases:')} ${c.yellow('amber, tornado, severe, flash-flood, flood, hurricane, blizzard, winter-storm, ice-storm, wind, heat, fire, smog, fog, rain, statement, squall, rafale, bourrasque, gel, gelee, freeze, frost')}\n`);
  process.exit(0);
}

let duration = 0;
let filteredArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--duration' || args[i] === '-d') {
    if (args[i + 1] !== undefined) {
      duration = parseInt(args[i + 1], 10) || 0;
      i++;
    }
  } else if (/^--duration=(\d+)$/.test(args[i])) {
    duration = parseInt(args[i].split('=')[1], 10) || 0;
  } else {
    filteredArgs.push(args[i]);
  }
}

const subCommand = (filteredArgs[0] || '').toLowerCase();
let endpoint = '';
const durParam = duration > 0 ? `duration=${duration}` : '';

if (subCommand === 'clear') {
  endpoint = `/api/alert/clear`;
} else if (subCommand === 'quebec') {
  endpoint = `/api/alert/quebec${durParam ? '?' + durParam : ''}`;
} else if (subCommand === 'all') {
  endpoint = `/api/alert/all${durParam ? '?' + durParam : ''}`;
} else {
  const typeParam = `type=${encodeURIComponent(filteredArgs.join(' '))}`;
  endpoint = `/api/alert/trigger?${typeParam}${durParam ? '&' + durParam : ''}`;
}

const req = http.get(`http://127.0.0.1:${port}${endpoint}`, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      logger.alert(data.message || 'Command executed successfully.');
    } catch (e) {
      logger.alert(`Server response: ${body}`);
    }
  });
});

req.on('error', (err) => {
  logger.error(`Could not connect to server at 127.0.0.1:${port} (${err.message})`);
  console.error(c.dim('Make sure the IntelliStar server (npm start or npm run start-iptv) is running.'));
});
