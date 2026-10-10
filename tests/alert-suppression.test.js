'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Request helper for testing HTTP endpoints
function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json: () => JSON.parse(data),
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

test('Active alert list and suppression choices', async (t) => {
  // Require main app
  const app = require('../app');
  let server;
  let port;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
    // Clean up alert-filters.json if generated
    const filterPath = path.join(__dirname, '..', 'alert-filters.json');
    try {
      if (fs.existsSync(filterPath)) fs.unlinkSync(filterPath);
    } catch (e) {}
  });

  // Start with clean slate
  await request(port, '/api/alerts/suppress/clear', { method: 'POST' });

  await t.test('POST /api/alerts/report stores active alerts and returns filters', async () => {
    const alertsToReport = [
      {
        key: 'Tornado Warning|dkey123',
        name: 'Tornado Warning',
        description: 'Tornado warning in effect for metropolitan sector.',
        cityName: 'Montréal, Laval',
        expiresAt: Date.now() + 3600000,
        priority: 25,
        severe: true,
        color: 'red'
      },
      {
        key: 'Avertissement de smog|dkey456',
        name: 'Avertissement de smog',
        description: 'Smog élevé pour les prochaines 24 heures.',
        cityName: 'Montréal',
        expiresAt: Date.now() + 7200000,
        priority: 125,
        severe: false,
        color: 'yellow'
      }
    ];

    const reportRes = await request(port, '/api/alerts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { alerts: alertsToReport }
    });

    assert.equal(reportRes.statusCode, 200);
    const reportData = reportRes.json();
    assert.ok(Array.isArray(reportData.rules));

    // Now check GET /api/alerts/active
    const activeRes = await request(port, '/api/alerts/active');
    assert.equal(activeRes.statusCode, 200);
    const activeData = activeRes.json();
    assert.equal(activeData.alerts.length, 2);
    assert.equal(activeData.alerts[0].name, 'Tornado Warning');
    assert.equal(activeData.alerts[0].blockedBy, null);
    assert.equal(activeData.alerts[1].name, 'Avertissement de smog');
    assert.equal(activeData.alerts[1].blockedBy, null);
  });

  await t.test('Option 1: Suppress current alert only (instance mode)', async () => {
    // Suppress ONLY this exact instance of Tornado Warning
    const res = await request(port, '/api/alerts/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        mode: 'instance',
        key: 'Tornado Warning|dkey123',
        name: 'Tornado Warning'
      }
    });

    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.success, true);
    assert.equal(data.rule.mode, 'instance');

    // Fetch active alerts - Tornado Warning should now be blockedBy the instance rule
    const activeRes = await request(port, '/api/alerts/active');
    const activeData = activeRes.json();
    const tornado = activeData.alerts.find(a => a.name === 'Tornado Warning');
    assert.ok(tornado.blockedBy);
    assert.equal(tornado.blockedBy.mode, 'instance');

    // If a NEW alert of the same type comes in with a different key, it is NOT blocked
    await request(port, '/api/alerts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        alerts: [
          {
            key: 'Tornado Warning|NEW_UPDATE_KEY_789',
            name: 'Tornado Warning',
            description: 'Updated tornado track.',
            cityName: 'Montréal',
            priority: 25,
            severe: true,
            color: 'red'
          }
        ]
      }
    });

    const activeRes2 = await request(port, '/api/alerts/active');
    const activeData2 = activeRes2.json();
    const updatedTornado = activeData2.alerts.find(a => a.key === 'Tornado Warning|NEW_UPDATE_KEY_789');
    assert.ok(updatedTornado);
    assert.equal(updatedTornado.blockedBy, null, 'New alert instance must NOT be blocked under instance mode');
  });

  await t.test('Option 2: Future current alert of this type of warning (type-active mode)', async () => {
    // Suppress all current & updated alerts of this storm event
    const res = await request(port, '/api/alerts/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        mode: 'type-active',
        name: 'Tornado Warning'
      }
    });

    assert.equal(res.statusCode, 200);

    // Both previous and updated alerts of Tornado Warning are now blocked
    const activeRes = await request(port, '/api/alerts/active');
    const activeData = activeRes.json();
    const tornado = activeData.alerts.find(a => a.name === 'Tornado Warning');
    assert.ok(tornado.blockedBy);
    assert.equal(tornado.blockedBy.mode, 'type-active');

    // When the storm passes and Environment Canada / TWC returns 0 alerts:
    await request(port, '/api/alerts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { alerts: [] }
    });

    // The type-active rule should auto-prune itself since the active storm has cleared!
    const activeRes2 = await request(port, '/api/alerts/active');
    const activeData2 = activeRes2.json();
    const activeRule = activeData2.rules.find(r => r.type === 'Tornado Warning' && r.mode === 'type-active');
    assert.equal(activeRule, undefined, 'type-active rule should auto-prune when event clears');
  });

  await t.test('Option 3: Always block this type of alert (type-always mode)', async () => {
    const res = await request(port, '/api/alerts/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        mode: 'type-always',
        name: 'Avertissement de smog'
      }
    });

    assert.equal(res.statusCode, 200);

    // Report smog alert again
    await request(port, '/api/alerts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        alerts: [
          {
            key: 'Avertissement de smog|brand_new_key',
            name: 'Avertissement de smog',
            cityName: 'Montréal',
            priority: 125,
            severe: false
          }
        ]
      }
    });

    const activeRes = await request(port, '/api/alerts/active');
    const activeData = activeRes.json();
    const smog = activeData.alerts.find(a => a.name === 'Avertissement de smog');
    assert.ok(smog.blockedBy);
    assert.equal(smog.blockedBy.mode, 'type-always');

    // Rule does NOT auto-prune when empty list is reported
    await request(port, '/api/alerts/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { alerts: [] }
    });
    const filtersRes = await request(port, '/api/alerts/filters');
    const filters = filtersRes.json();
    const alwaysRule = filters.rules.find(r => r.mode === 'type-always');
    assert.ok(alwaysRule, 'type-always rule must persist even after feed clears');
  });

  await t.test('Option 4: Timed mute suppression (type-timed mode)', async () => {
    const res = await request(port, '/api/alerts/suppress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        mode: 'type-timed',
        name: 'Flash Flood Warning',
        hours: 6
      }
    });

    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.rule.mode, 'type-timed');
    assert.ok(data.rule.until > Date.now());

    // Unblock the rule by ID
    const delRes = await request(port, `/api/alerts/suppress/${data.rule.id}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.statusCode, 200);
  });

  await t.test('launcher.html contains active alert UI and suppression modal choices', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'launcher.html'), 'utf8');
    assert.match(html, /id="active-alerts-container"/, 'Active alerts container exists');
    assert.match(html, /id="active-alerts-count"/, 'Active alerts counter exists');
    assert.match(html, /id="btn-manage-rules"/, 'Manage rules button exists');
    assert.match(html, /id="alert-remove-modal"/, 'Alert remove modal exists');
    assert.match(html, /data-choice="instance"/, 'Choice: Current alert only exists');
    assert.match(html, /data-choice="type-active"/, 'Choice: Future current alert of this type exists');
    assert.match(html, /data-choice="type-always"/, 'Choice: Always block exists');
    assert.match(html, /data-choice="type-timed-6"/, 'Choice: Mute 6h exists');
    assert.match(html, /data-choice="type-timed-24"/, 'Choice: Mute 24h exists');
    assert.match(html, /id="alert-rules-modal"/, 'Alert rules modal exists');
  });
});

