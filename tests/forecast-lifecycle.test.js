'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

function createTestServer() {
    const app = express();
    app.use(express.json());

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
        res.json({ success: true, message: 'Forecast start command sent', forecast: currentForecastCommand });
    });

    app.all('/api/forecast/stop', (req, res) => {
        currentForecastCommand = {
            id: Date.now(),
            action: 'stop',
            state: 'idle',
            timestamp: Date.now()
        };
        res.json({ success: true, message: 'Forecast stop command sent', forecast: currentForecastCommand });
    });

    app.all('/api/forecast/reset', (req, res) => {
        currentForecastCommand = {
            id: 0,
            action: 'status',
            state: 'idle',
            timestamp: Date.now()
        };
        res.json({ success: true, message: 'Forecast command state reset to idle', forecast: currentForecastCommand });
    });

    return app;
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

test('forecast API initializes at idle, transitions between start, stop and reset', async (t) => {
    const app = createTestServer();
    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    t.after(() => server.close());
    const port = server.address().port;
    const base = `http://127.0.0.1:${port}`;

    // 1. Initial state must be idle with id 0
    let res = await fetchJson(`${base}/api/forecast`);
    assert.equal(res.state, 'idle');
    assert.equal(res.action, 'status');
    assert.equal(res.id, 0);

    // 2. Start command transitions to running with timestamp id
    res = await fetchJson(`${base}/api/forecast/start`);
    assert.equal(res.forecast.state, 'running');
    assert.equal(res.forecast.action, 'start');
    assert.ok(res.forecast.id > 0);

    // 3. Stop command transitions to idle with timestamp id
    res = await fetchJson(`${base}/api/forecast/stop`);
    assert.equal(res.forecast.state, 'idle');
    assert.equal(res.forecast.action, 'stop');
    assert.ok(res.forecast.id > 0);

    // 4. Start again
    res = await fetchJson(`${base}/api/forecast/start`);
    assert.equal(res.forecast.state, 'running');

    // 5. Reset command resets back to clean startup state (id: 0, action: 'status', state: 'idle')
    res = await fetchJson(`${base}/api/forecast/reset`);
    assert.equal(res.forecast.state, 'idle');
    assert.equal(res.forecast.action, 'status');
    assert.equal(res.forecast.id, 0);

    // 6. Verify subsequent get returns reset state
    res = await fetchJson(`${base}/api/forecast`);
    assert.equal(res.state, 'idle');
    assert.equal(res.action, 'status');
    assert.equal(res.id, 0);
});

test('forecast listener establishes baseline ID on initial poll without replaying stale start', () => {
    let lastProcessedForecastCommandId = null;
    let startedCount = 0;
    let stoppedCount = 0;

    function processForecastPoll(data) {
        if (!data) return;
        if (lastProcessedForecastCommandId === null) {
            lastProcessedForecastCommandId = data.id || 0;
            return;
        }
        if (!data.id || data.id === lastProcessedForecastCommandId) return;
        lastProcessedForecastCommandId = data.id;

        if (data.action === 'start') startedCount++;
        else if (data.action === 'stop') stoppedCount++;
    }

    // Server has a stale 'start' command from hours ago
    const staleServerCommand = { id: 1788905687708, action: 'start', state: 'running' };

    // Poll 1: Browser connects. Must establish baseline and NOT start presentation
    processForecastPoll(staleServerCommand);
    assert.equal(lastProcessedForecastCommandId, 1788905687708);
    assert.equal(startedCount, 0, 'Must NOT trigger start on initial poll with stale command');

    // Poll 2: Same server state. Must NOT trigger
    processForecastPoll(staleServerCommand);
    assert.equal(startedCount, 0);

    // Poll 3: User actually issues a NEW stop command
    const newStopCommand = { id: 1788905687999, action: 'stop', state: 'idle' };
    processForecastPoll(newStopCommand);
    assert.equal(stoppedCount, 1);
    assert.equal(lastProcessedForecastCommandId, 1788905687999);

    // Poll 4: User issues a NEW start command
    const newStartCommand = { id: 1788905690000, action: 'start', state: 'running' };
    processForecastPoll(newStartCommand);
    assert.equal(startedCount, 1, 'Must trigger start on NEW command');
});

