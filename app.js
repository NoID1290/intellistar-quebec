const compression = require('compression');
const express = require('express');
const path = require('path');
const fs = require('fs');
const streamConfig = require('./stream-config');
const { resolveHlsDirectory } = require('./stream-hls');
const logger = require('./console-view');
const app = express();
const port = process.env.PORT || 7070;

app.use(compression());

app.get('/api/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ service: 'intellistar', version: 1 });
});

app.all(['/api/app/stop', '/api/app/shutdown'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, message: 'IntelliSTAR app server shutting down...' });
    logger.info('Received remote shutdown request via /api/app/stop. Exiting...');
    setTimeout(() => {
        process.exit(0);
    }, 100);
});

const hlsDirectory = resolveHlsDirectory(streamConfig);
if (!fs.existsSync(hlsDirectory)) {
    fs.mkdirSync(hlsDirectory, { recursive: true });
}

function resolveConfigPath() {
    const preferredPath = path.join(__dirname, 'myConfig.json');
    const fallbackPath = path.join(__dirname, 'MYCONFIG.json');
    if (fs.existsSync(preferredPath)) return preferredPath;
    if (fs.existsSync(fallbackPath)) return fallbackPath;
    return null;
}
let cachedConfigPath = resolveConfigPath();

const { createStore, readDefaults, installEditorAPI } = require('./editor-store');
const editorStore = createStore(
    process.env.INTELLISTAR_PRESET_DIR || path.join(__dirname, 'presets'),
    () => {
        cachedConfigPath = resolveConfigPath();
        return cachedConfigPath ? JSON.parse(fs.readFileSync(cachedConfigPath, 'utf8')) : {};
    },
    readDefaults(__dirname)
);
installEditorAPI(app, editorStore);

app.use('/stream', express.static(hlsDirectory, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.m3u8') || filePath.endsWith('.ts')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Serve MYCONFIG.json from project root so the frontend can auto-load it
app.get('/api/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(editorStore.broadcast()); }
    catch (error) { res.status(500).json({ error: 'Could not load broadcast configuration' }); }
});

// Toggle or set radar/satellite frame interpolation
app.all('/api/interpolation', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const enabledQuery = req.query.enabled ?? req.body?.enabled;
    const enabled = (enabledQuery === 'true' || enabledQuery === true || enabledQuery === '1');
    const targetFile = cachedConfigPath || resolveConfigPath() || path.join(__dirname, 'MYCONFIG.json');
    try {
        if (fs.existsSync(targetFile)) {
            const raw = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
            raw.smoothRadar = enabled;
            if (raw.appearanceSettings) {
                raw.appearanceSettings.smoothRadar = enabled;
            }
            fs.writeFileSync(targetFile, JSON.stringify(raw, null, '\t'), 'utf8');
        }
        // Notify running display pages (they poll /api/refresh every second).
        currentRefreshCommand = { id: Date.now(), action: 'interpolation', enabled, timestamp: Date.now() };
        res.json({ success: true, enabled, message: `Interpolation ${enabled ? 'enabled' : 'disabled'}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Scan and return all custom music files from webroot/music/custom (or webroot/music)
app.get('/api/music', (req, res) => {
    const customDir = path.join(__dirname, 'webroot', 'music', 'custom');
    const baseDir = path.join(__dirname, 'webroot', 'music');
    const audioExts = new Set(['.wav', '.mp3', '.ogg', '.oga', '.m4a', '.flac', '.aac', '.webm']);
    
    let tracks = [];
    if (fs.existsSync(customDir)) {
        try {
            const files = fs.readdirSync(customDir);
            tracks = files
                .filter(file => audioExts.has(path.extname(file).toLowerCase()))
                .map(file => `music/custom/${file}`);
        } catch (e) {}
    }
    
    if (tracks.length === 0 && fs.existsSync(baseDir)) {
        try {
            const files = fs.readdirSync(baseDir);
            tracks = files
                .filter(file => audioExts.has(path.extname(file).toLowerCase()))
                .map(file => `music/${file}`);
        } catch (e) {}
    }
    
    res.json({ tracks, count: tracks.length });
});

let currentAlertCommand = {
    id: 0,
    action: 'none',
    type: '',
    includeCrawl: true,
    timestamp: Date.now()
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/alert', (req, res) => {
    res.json(currentAlertCommand);
});

app.all('/api/alert/trigger', (req, res) => {
    const type = (req.body && req.body.type) || req.query.type || 'tornado';
    const crawlVal = (req.body && req.body.includeCrawl !== undefined) ? req.body.includeCrawl : req.query.includeCrawl;
    const includeCrawl = crawlVal !== false && crawlVal !== 'false' && crawlVal !== '0';
    const duration = Number((req.body && req.body.duration) || req.query.duration || 0);
    currentAlertCommand = {
        id: Date.now(),
        action: 'trigger',
        type: type,
        includeCrawl: includeCrawl,
        duration: duration > 0 ? duration : undefined,
        timestamp: Date.now()
    };
    lastAlertReport = {
        reportedAt: Date.now(),
        alerts: [{
            key: `${type}|simulation`,
            name: type,
            description: `Simulation alert test for ${type}.`,
            cityName: "Simulation Test",
            priority: 25,
            severe: true,
            color: 'red'
        }]
    };
    logger.alert(`Triggered alert test: "${type}" (crawl: ${includeCrawl}${duration > 0 ? `, duration: ${duration}s` : ''})`);
    res.json({ success: true, message: `Alert test triggered: ${type}`, alert: currentAlertCommand });
});

app.all('/api/alert/quebec', (req, res) => {
    const crawlVal = (req.body && req.body.includeCrawl !== undefined) ? req.body.includeCrawl : req.query.includeCrawl;
    const includeCrawl = crawlVal !== false && crawlVal !== 'false' && crawlVal !== '0';
    const duration = Number((req.body && req.body.duration) || req.query.duration || 0);
    currentAlertCommand = {
        id: Date.now(),
        action: 'quebec',
        type: 'quebec',
        includeCrawl: includeCrawl,
        duration: duration > 0 ? duration : undefined,
        timestamp: Date.now()
    };
    lastAlertReport = {
        reportedAt: Date.now(),
        alerts: [{
            key: `quebec|simulation`,
            name: "Alerte Québec En Alerte",
            description: "CECI EST UN TEST DU SYSTÈME QUÉBEC EN ALERTE.",
            cityName: "Québec, QC",
            priority: 10,
            severe: true,
            color: 'red'
        }]
    };
    logger.alert(`Triggered Québec En Alerte test${duration > 0 ? ` (duration: ${duration}s)` : ''}`);
    res.json({ success: true, message: 'Québec En Alerte test triggered', alert: currentAlertCommand });
});

app.all('/api/alert/all', (req, res) => {
    const crawlVal = (req.body && req.body.includeCrawl !== undefined) ? req.body.includeCrawl : req.query.includeCrawl;
    const includeCrawl = crawlVal !== false && crawlVal !== 'false' && crawlVal !== '0';
    const duration = Number((req.body && req.body.duration) || req.query.duration || 0);
    currentAlertCommand = {
        id: Date.now(),
        action: 'all',
        type: 'all',
        includeCrawl: includeCrawl,
        duration: duration > 0 ? duration : undefined,
        timestamp: Date.now()
    };
    lastAlertReport = {
        reportedAt: Date.now(),
        alerts: [
            { key: "Tornado Warning|sim", name: "Tornado Warning", cityName: "Montréal", priority: 1, severe: true, color: 'red', description: "Simulation Tornado Warning" },
            { key: "Severe Thunderstorm Warning|sim", name: "Severe Thunderstorm Warning", cityName: "Laval", priority: 2, severe: true, color: 'red', description: "Simulation Severe Storm" },
            { key: "Flash Flood Warning|sim", name: "Flash Flood Warning", cityName: "Longueuil", priority: 3, severe: true, color: 'red', description: "Simulation Flood" }
        ]
    };
    logger.alert(`Triggered All Alerts test${duration > 0 ? ` (duration: ${duration}s)` : ''}`);
    res.json({ success: true, message: 'All alerts test triggered', alert: currentAlertCommand });
});

app.all('/api/alert/clear', (req, res) => {
    currentAlertCommand = {
        id: Date.now(),
        action: 'clear',
        type: '',
        includeCrawl: false,
        timestamp: Date.now()
    };
    lastAlertReport = {
        reportedAt: Date.now(),
        alerts: []
    };
    logger.alert('Cleared active alert test', logger.c.green('✓'));
    res.json({ success: true, message: 'Alert test cleared', alert: currentAlertCommand });
});

// -----------------------------------------------------------------------------
// Live alert list + suppression rules
// The display page reports every alert it fetched (before filtering) to
// /api/alerts/report and receives the suppression rules to apply.
// Rule modes:
//   instance     - hide this exact alert only; new/updated alerts still show
//   type-active  - hide this type (incl. updates/re-issues) until no alert of
//                  this type is active anymore, then the rule removes itself
//   type-timed   - hide this type until `until` (ms timestamp)
//   type-always  - always block this type
// -----------------------------------------------------------------------------
const ALERT_FILTERS_PATH = path.join(__dirname, 'alert-filters.json');
let alertFilterState = { version: 1, rules: [] };
try {
    const saved = JSON.parse(fs.readFileSync(ALERT_FILTERS_PATH, 'utf8'));
    if (saved && Array.isArray(saved.rules)) alertFilterState = { version: Date.now(), rules: saved.rules };
} catch (e) {}
let lastAlertReport = { alerts: [], reportedAt: 0 };

const ALERT_RULE_MODES = ['instance', 'type-active', 'type-timed', 'type-always'];
const normType = (s) => String(s || '').trim().toLowerCase();

function saveAlertFilters() {
    alertFilterState.version = Date.now();
    try {
        fs.writeFileSync(ALERT_FILTERS_PATH, JSON.stringify({ rules: alertFilterState.rules }, null, 2));
    } catch (e) {
        logger.alert(`Could not save alert filters: ${e.message}`);
    }
}

function pruneAlertRules(reportedAlerts) {
    const now = Date.now();
    const before = alertFilterState.rules.length;
    alertFilterState.rules = alertFilterState.rules.filter((r) => {
        if (r.mode === 'type-timed') return r.until > now;
        if (!reportedAlerts) return true;
        if (r.mode === 'instance') return reportedAlerts.some((a) => a.key === r.key);
        if (r.mode === 'type-active') return reportedAlerts.some((a) => normType(a.name) === normType(r.type));
        return true;
    });
    if (alertFilterState.rules.length !== before) saveAlertFilters();
}

function findBlockingRule(alert) {
    const now = Date.now();
    return alertFilterState.rules.find((r) => {
        if (r.mode === 'instance') return r.key === alert.key;
        if (r.mode === 'type-timed' && r.until <= now) return false;
        return normType(r.type) === normType(alert.name);
    }) || null;
}

function alertFilterPayload() {
    return { version: alertFilterState.version, rules: alertFilterState.rules };
}

app.get('/api/alerts/filters', (req, res) => {
    pruneAlertRules(null);
    res.json(alertFilterPayload());
});

app.post('/api/alerts/report', (req, res) => {
    const alerts = Array.isArray(req.body && req.body.alerts) ? req.body.alerts.slice(0, 200) : [];
    lastAlertReport = {
        reportedAt: Date.now(),
        alerts: alerts.map((a) => ({
            key: String(a.key || ''),
            name: String(a.name || ''),
            description: String(a.description || '').slice(0, 2000),
            cityName: String(a.cityName || ''),
            expiresAt: Number(a.expiresAt) || null,
            priority: Number(a.priority) || 0,
            severe: !!a.severe,
            color: a.color || ''
        }))
    };
    pruneAlertRules(lastAlertReport.alerts);
    res.json(alertFilterPayload());
});

app.get('/api/alerts/active', (req, res) => {
    pruneAlertRules(null);
    res.json({
        reportedAt: lastAlertReport.reportedAt,
        alerts: lastAlertReport.alerts.map((a) => ({ ...a, blockedBy: findBlockingRule(a) })),
        rules: alertFilterState.rules
    });
});

app.post('/api/alerts/suppress', (req, res) => {
    const { mode, key, name, hours } = req.body || {};
    if (!ALERT_RULE_MODES.includes(mode)) return res.status(400).json({ error: 'Invalid mode' });
    if (mode === 'instance' && !key) return res.status(400).json({ error: 'Missing alert key' });
    if (mode !== 'instance' && !name) return res.status(400).json({ error: 'Missing alert type' });

    const rule = { id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`, mode, createdAt: Date.now() };
    if (mode === 'instance') { rule.key = String(key); rule.label = String(name || key); }
    else rule.type = String(name);
    if (mode === 'type-timed') rule.until = Date.now() + Math.max(0.25, Number(hours) || 6) * 3600 * 1000;

    // Replace any existing rule for the same target
    alertFilterState.rules = alertFilterState.rules.filter((r) =>
        mode === 'instance' ? r.key !== rule.key : normType(r.type) !== normType(rule.type));
    alertFilterState.rules.push(rule);
    saveAlertFilters();
    logger.alert(`Alert suppression added: ${mode} → ${rule.type || rule.label}`);
    res.json({ success: true, rule, ...alertFilterPayload() });
});

app.delete('/api/alerts/suppress/:id', (req, res) => {
    alertFilterState.rules = alertFilterState.rules.filter((r) => r.id !== req.params.id);
    saveAlertFilters();
    res.json({ success: true, ...alertFilterPayload() });
});

app.post('/api/alerts/suppress/clear', (req, res) => {
    alertFilterState.rules = [];
    saveAlertFilters();
    res.json({ success: true, ...alertFilterPayload() });
});

let currentForecastCommand = {
    id: 0,
    action: 'status',
    state: 'idle',
    timestamp: Date.now()
};

app.get('/api/forecast', (req, res) => {
    res.json(currentForecastCommand);
});

app.all('/api/forecast/start', (req, res) => {
    currentForecastCommand = {
        id: Date.now(),
        action: 'start',
        state: 'running',
        timestamp: Date.now()
    };
    logger.forecast('Triggered forecast start command');
    res.json({ success: true, message: 'Forecast start command sent', forecast: currentForecastCommand });
});

app.all('/api/forecast/stop', (req, res) => {
    currentForecastCommand = {
        id: Date.now(),
        action: 'stop',
        state: 'idle',
        timestamp: Date.now()
    };
    logger.forecast('Triggered forecast stop command (returning to standby)');
    res.json({ success: true, message: 'Forecast stop command sent (returning to color bars)', forecast: currentForecastCommand });
});

app.all('/api/forecast/reset', (req, res) => {
    currentForecastCommand = {
        id: 0,
        action: 'status',
        state: 'idle',
        timestamp: Date.now()
    };
    logger.forecast('Reset forecast command state to idle');
    res.json({ success: true, message: 'Forecast command state reset to idle', forecast: currentForecastCommand });
});

let currentMessageCommand = {
    id: 0,
    action: 'none',
    text: '',
    timestamp: Date.now()
};

app.get('/api/message', (req, res) => {
    if (req.query.text || req.query.msg) {
        const text = req.query.text || req.query.msg;
        currentMessageCommand = {
            id: Date.now(),
            action: 'send',
            text: `${text}`,
            timestamp: Date.now()
        };
        logger.message(`Dispatched custom LDL crawl: "${text}"`);
        return res.json({ success: true, message: `Custom LDL message sent: "${text}"`, command: currentMessageCommand });
    }
    res.json(currentMessageCommand);
});

app.all(['/api/message/send', '/api/message/trigger'], (req, res) => {
    const text = (req.body && req.body.text) || req.query.text || (req.query.msg || req.body.msg) || '';
    if (!text) {
        return res.status(400).json({ error: 'Message text is required (use ?text=... or JSON body { text: "..." })' });
    }
    currentMessageCommand = {
        id: Date.now(),
        action: 'send',
        text: `${text}`,
        timestamp: Date.now()
    };
    logger.message(`Dispatched custom LDL crawl: "${text}"`);
    res.json({ success: true, message: `Custom LDL message sent: "${text}"`, command: currentMessageCommand });
});

app.post('/api/message', (req, res) => {
    const text = (req.body && req.body.text) || req.query.text || (req.query.msg || req.body.msg) || '';
    if (!text) {
        return res.status(400).json({ error: 'Message text is required (use JSON body { text: "..." })' });
    }
    currentMessageCommand = {
        id: Date.now(),
        action: 'send',
        text: `${text}`,
        timestamp: Date.now()
    };
    logger.message(`Dispatched custom LDL crawl: "${text}"`);
    res.json({ success: true, message: `Custom LDL message sent: "${text}"`, command: currentMessageCommand });
});

app.all('/api/message/clear', (req, res) => {
    currentMessageCommand = {
        id: Date.now(),
        action: 'clear',
        text: '',
        timestamp: Date.now()
    };
    logger.message('Cleared custom message command', logger.c.green('✓'));
    res.json({ success: true, message: 'Message command cleared', command: currentMessageCommand });
});

let currentRefreshCommand = {
    id: 0,
    action: 'status',
    timestamp: Date.now()
};

app.get('/api/refresh', (req, res) => {
    if (req.query.trigger === '1' || req.query.now === '1') {
        currentRefreshCommand = {
            id: Date.now(),
            action: 'refresh',
            timestamp: Date.now()
        };
        logger.refresh('Triggered live JS hot-reload');
        return res.json({ success: true, message: 'Live JS refresh triggered', refresh: currentRefreshCommand });
    }
    res.json(currentRefreshCommand);
});

app.all(['/api/refresh/trigger', '/api/refresh/all'], (req, res) => {
    currentRefreshCommand = {
        id: Date.now(),
        action: 'refresh',
        timestamp: Date.now()
    };
    logger.refresh('Triggered live JS hot-reload');
    res.json({ success: true, message: 'Live JS refresh triggered', refresh: currentRefreshCommand });
});

app.post('/api/refresh', (req, res) => {
    currentRefreshCommand = {
        id: Date.now(),
        action: 'refresh',
        timestamp: Date.now()
    };
    logger.refresh('Triggered live JS hot-reload');
    res.json({ success: true, message: 'Live JS refresh triggered', refresh: currentRefreshCommand });
});

require('./tts').installTTSAPI(app, logger);

try {
    const { createLauncherRouter } = require('./launcher-ui');
    app.use('/api/launcher', createLauncherRouter(port));
} catch (e) {
    logger.warn(`Could not mount launcher API in app.js: ${e.message}`);
}

app.use(express.static(path.join(__dirname, 'webroot'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        // Revalidate code and markup so a Studio publish/reload cannot reuse old logic.
        if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
        if (filePath.endsWith('.m3u8') || filePath.endsWith('.ts')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

if (require.main === module) {
    (async () => {
        try {
            const probe = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
            if (probe.ok) {
                const data = await probe.json();
                if (data && data.standby) {
                    await fetch(`http://127.0.0.1:${port}/api/standby/yield`, { signal: AbortSignal.timeout(800) });
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
        } catch (e) {}

        app.listen(port, '0.0.0.0', () => {
            if (!process.env.INTELLISTAR_IPTV_RUNNER) {
                logger.printBanner();
            }
            logger.server(`Webroot online at http://127.0.0.1:${port}`);
            logger.stream(`HLS stream cache mounted at ${hlsDirectory}`);
        });
    })();
}

module.exports = app;
