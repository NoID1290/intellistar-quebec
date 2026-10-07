'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const Model = require('../webroot/js/editor-model');
const { createStore, readDefaults, installEditorAPI } = require('../editor-store');
const defaults = readDefaults(path.join(__dirname, '..'));
const base = {
    mainCity: { autoFind: false, displayname: 'Montréal', type: 'geocode', val: '45.503,-73.573' },
    units: 'imperial', graphicsPackage: 2009,
    slideOrder: [{ function: 'currentConditions', slideDelay: 8000 }],
    api_key: 'keep-on-server', customUnrelatedSetting: true
};
function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'intellistar-presets-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = createStore(directory, () => Model.clone(base), defaults);
    const preset = store.current(); preset.name = 'Morning broadcast';
    return { directory, store, preset };
}
test('normalizes legacy configuration and excludes credentials from portable presets', t => {
    const { preset } = fixture(t);
    assert.equal(preset.config.locationSettings.mainCity.displayname, 'Montréal');
    assert.equal(preset.config.appearanceSettings.units, 'imperial');
    assert.equal(preset.config.slideSettings.order.length, 1);
    assert.ok(!JSON.stringify(preset).includes('keep-on-server'));
    assert.doesNotThrow(() => Model.validate(preset));
});
test('atomically saves, reloads and copies presets without publishing', t => {
    const { directory, store, preset } = fixture(t);
    const first = store.save(preset);
    const second = store.save({ ...preset, name: 'Evening' });
    assert.notEqual(first.id, second.id);
    assert.equal(store.state().presets.length, 2);
    assert.equal(store.state().revision, 0);
    const reopened = createStore(directory, () => base, defaults);
    assert.deepEqual(reopened.get(first.id), first);
    assert.deepEqual(fs.readdirSync(directory), ['presets.json']);
    assert.equal(fs.statSync(path.join(directory, 'presets.json')).mode & 0o777, 0o600);
});
test('applies a snapshot, filters disabled slides, preserves base and supports rollback', t => {
    const { store, preset } = fixture(t);
    preset.config.appearanceSettings.units = 'metric';
    preset.config.locationSettings.mainCity.displayname = 'Québec';
    preset.config.slideSettings.order.push({ function: 'weekAhead', slideDelay: 7000, enabled: false });
    preset.layout['#main > .slides > .current-conditions > .header'] = { style: { left: 100 }, text: 'Bonjour' };
    const saved = store.save(preset); const applied = store.apply(saved.id);
    const broadcast = store.broadcast();
    assert.equal(broadcast.appearanceSettings.units, 'metric');
    assert.equal(broadcast.units, undefined);
    assert.equal(broadcast.mainCity, undefined);
    assert.equal(broadcast.slideOrder, undefined);
    assert.equal(broadcast.api_key, 'keep-on-server');
    assert.equal(broadcast.customUnrelatedSetting, true);
    assert.equal(broadcast.slideSettings.order.length, 1);
    assert.deepEqual(broadcast.editorLayout, preset.layout);
    assert.equal(broadcast.__editorRevision, applied.revision);
    saved.config.locationSettings.mainCity.displayname = 'Changed but not published'; store.save(saved, saved.id);
    assert.equal(store.broadcast().locationSettings.mainCity.displayname, 'Québec');
    assert.throws(() => store.remove(saved.id), /Restore/);
    const restored = store.apply(null); assert.ok(restored.revision > applied.revision);
    assert.equal(store.broadcast().mainCity.displayname, 'Montréal');
    assert.equal(store.broadcast().editorLayout, undefined);
    store.remove(saved.id); assert.equal(store.state().presets.length, 0);
});
test('rejects concurrent edits rather than silently overwriting', t => {
    const { store, preset } = fixture(t);
    const saved = store.save(preset); const stale = Model.clone(saved);
    store.save({ ...saved, name: 'First editor' }, saved.id);
    assert.throws(() => store.save({ ...stale, name: 'Second editor' }, saved.id), /another editor/);
    assert.equal(store.get(saved.id).name, 'First editor');
});
test('rejects bad versions, locations, slide timing, credentials and CSS injection', t => {
    const { preset } = fixture(t);
    const cases = [
        p => p.schemaVersion = 99,
        p => p.name = '',
        p => p.config.locationSettings.mainCity.val = '91,-73',
        p => p.config.locationSettings.mainCity.val = '45,NaN',
        p => p.config.slideSettings.order[0].slideDelay = 0,
        p => p.config.slideSettings.order[0].enabled = false,
        p => p.config.slideSettings.order[0].function = 'constructor',
        p => p.config.audioSettings.accessToken = 'secret',
        p => p.layout['body'] = { style: { left: 0 } },
        p => p.layout['#main > .slides'] = { style: { left: '0; color: red' } },
        p => p.layout['#main > .slides'] = { style: { backgroundImage: 'https://example.com/pixel.png' } },
        p => p.layout['#main > .slides'] = { style: { backgroundImage: 'images/../../MYCONFIG.json' } },
        p => p.layout['#main > .slides'] = { style: { backgroundImage: 'images/icon.svg");}' } }
    ];
    for (const mutate of cases) { const invalid = Model.clone(preset); mutate(invalid); assert.throws(() => Model.validate(invalid)); }
    assert.throws(() => Model.merge({}, JSON.parse('{"__proto__":{"polluted":true}}')), /Unsafe/);
    assert.equal({}.polluted, undefined);
});
test('serializes scoped important rules with validated values', () => {
    const css = Model.layoutCSS({ '#main > .slides > .current-conditions > .header': { style: { left: 120, color: '#ffffff', fontSize: 42, opacity: 0.8 } } });
    assert.match(css, /left:120px !important/);
    assert.match(css, /font-size:42px !important/);
    assert.match(css, /opacity:0.8 !important/);
    assert.ok(Model.selectorSafe('#main > .slides > .map > .map-cities > .city.i'));
    assert.ok(!Model.selectorSafe('#main > .slides, body'));
});
test('custom slide and global layers survive save, apply and restore', t => {
    const { store, preset } = fixture(t);
    preset.elements = [{ id: 'layer-test-text', scope: 'current-conditions', kind: 'text' }, { id: 'layer-test-logo', scope: 'global', kind: 'image' }];
    const selector = Model.customSelector(preset.elements[0]);
    preset.layout[selector] = { text: '<b>Literal text, not markup</b>', style: { position: 'absolute', left: 120, top: 220, fontSize: 48 } };
    assert.equal(selector, '#main > .slides > .current-conditions > .studio-layer.layer-test-text');
    assert.ok(Model.selectorSafe(Model.customSelector(preset.elements[1])));
    const saved = store.save(preset); store.apply(saved.id);
    assert.deepEqual(store.broadcast().editorElements, preset.elements);
    assert.deepEqual(store.current().elements, preset.elements);
    store.apply(null); assert.equal(store.broadcast().editorElements, undefined);
    const invalid = Model.clone(preset); invalid.elements.push(invalid.elements[0]);
    assert.throws(() => Model.validate(invalid), /Invalid custom layer/);
});
test('rejects malformed configurable collections and options before rendering', t => {
    const { preset } = fixture(t);
    for (const mutate of [p => p.config.locationSettings.radarCities = null, p => p.config.locationSettings.quebecCities = {}, p => p.config.appearanceSettings.marqueeAd = 'not an array', p => p.config.slideSettings.auto = 'false', p => p.config.locationSettings.mapCities.citiesPerSlide = 99]) {
        const bad = Model.clone(preset); mutate(bad); assert.throws(() => Model.validate(bad));
    }
});
test('editor API supports CRUD and refuses cross-origin, oversized and stale writes', async t => {
    const { store, preset } = fixture(t);
    const app = express(); installEditorAPI(app, store);
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://127.0.0.1:${server.address().port}/api/editor`;
    const request = (endpoint, method = 'GET', body, extra = {}) => fetch(`${url}${endpoint}`, { method, ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body || {}) } : {}) });
    const response = await request('/presets', 'POST', preset);
    assert.equal(response.status, 201); const saved = await response.json();
    assert.equal((await request('/state')).headers.get('cache-control'), 'no-store');
    assert.equal((await request('/presets', 'POST', preset, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/presets', 'POST', { ...preset, name: 'x'.repeat(2200000) })).status, 413);
    assert.equal((await request(`/presets/${saved.id}`, 'PUT', { ...saved, updatedAt: 'stale' })).status, 409);
    assert.equal((await request('/presets/missing')).status, 404);
    assert.equal((await request(`/presets/${saved.id}/apply`, 'POST')).status, 200);
    assert.equal((await request(`/presets/${saved.id}`, 'DELETE')).status, 409);
    assert.equal((await request('/restore', 'POST')).status, 200);
    assert.equal((await request(`/presets/${saved.id}`, 'DELETE')).status, 200);
});