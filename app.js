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
    logger.alert('Cleared active alert test', logger.c.green('✓'));
    res.json({ success: true, message: 'Alert test cleared', alert: currentAlertCommand });
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

app.listen(port, '0.0.0.0', () => {
    if (!process.env.INTELLISTAR_IPTV_RUNNER) {
        logger.printBanner();
    }
    logger.server(`Webroot online at http://127.0.0.1:${port}`);
    logger.stream(`HLS stream cache mounted at ${hlsDirectory}`);
});
