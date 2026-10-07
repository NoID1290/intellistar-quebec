'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Model = require('../webroot/js/editor-model');
const { radarEngine, startRadar, stopRadar, startSatellite, stopSatellite } = require('../webroot/js/radar');

test('editor model validates smoothRadar in appearanceSettings', () => {
    const validPreset = {
        schemaVersion: 1,
        name: 'Radar Smoothing Preset',
        config: {
            appearanceSettings: {
                graphicsPackage: 2026,
                iconSet: '2026',
                units: 'metric',
                ldlVisible: true,
                smoothRadar: true,
                marqueeAd: ['Test marquee']
            },
            slideSettings: {
                auto: false,
                bulletin: true,
                precip: true,
                endAttribution: true,
                order: [{ function: 'localDoppler', slideDelay: 9000 }]
            },
            audioSettings: {
                enableMusic: true,
                shuffle: true,
                randomStart: true,
                narrations: true,
                vocallocal: false,
                order: ['Track 1']
            },
            locationSettings: {
                mainCity: { autoFind: false, type: 'geocode', val: '45.503,-73.573', displayname: 'Montréal' },
                eightCities: { autoFind: false, cities: [] },
                mapCities: { leftPos: 0, topPos: 0, map: [], autoFind: false },
                radarCities: { local: [], regional: [] },
                regionalForecasts: [],
                canadaCities: [],
                quebecCities: [],
                resortCities: [],
                localDopplers: []
            },
            alertTestSettings: { enabled: false, includeCrawl: true }
        },
        layout: {}
    };

    assert.doesNotThrow(() => Model.validate(validPreset));

    // Turning it off (smoothRadar: false) should also be completely valid
    validPreset.config.appearanceSettings.smoothRadar = false;
    assert.doesNotThrow(() => Model.validate(validPreset));

    // Non-boolean smoothRadar should fail validation
    const invalidPreset = Model.clone(validPreset);
    invalidPreset.config.appearanceSettings.smoothRadar = 'yes';
    assert.throws(() => Model.validate(invalidPreset), /smoothRadar must be true or false/);
});

test('radarEngine detects interpolation option across appearanceSettings and locationConfig', () => {
    // 1. When appearanceSettings.smoothRadar is true
    global.appearanceSettings = { smoothRadar: true };
    global.locationConfig = {};
    assert.equal(radarEngine.isInterpolationEnabled(), true);

    // 2. When appearanceSettings.smoothRadar is explicitly false
    global.appearanceSettings = { smoothRadar: false };
    assert.equal(radarEngine.isInterpolationEnabled(), false);

    // 3. Fallback to locationConfig.smoothRadar if appearanceSettings is unset
    delete global.appearanceSettings;
    global.locationConfig = { smoothRadar: true };
    assert.equal(radarEngine.isInterpolationEnabled(), true);

    global.locationConfig = { smoothRadar: false };
    assert.equal(radarEngine.isInterpolationEnabled(), false);

    // Clean up globals
    delete global.appearanceSettings;
    delete global.locationConfig;
});

test('radarEngine mock canvas rendering for interpolated radar and satellite frames', () => {
    const drawCalls = [];
    const mockCtx = {
        globalAlpha: 1.0,
        fillStyle: '',
        shadowColor: '',
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 0,
        fillRect(...args) { drawCalls.push({ type: 'fillRect', args }); },
        drawImage(...args) { drawCalls.push({ type: 'drawImage', alpha: this.globalAlpha, args }); },
        save() { drawCalls.push({ type: 'save', alpha: this.globalAlpha }); },
        restore() { drawCalls.push({ type: 'restore' }); }
    };

    const mockLoc = {
        key: 'local_0',
        lon: -73.573,
        lat: 45.503,
        zoom: 9.8,
        shadowOffset: { x: 12, y: 8 }
    };

    // Populate mock tiles in imageCache
    const testUrlA = 'https://mock-tile/a.png';
    const testUrlB = 'https://mock-tile/b.png';
    radarEngine.imageCache.set(testUrlA, { complete: true, naturalWidth: 256, naturalHeight: 256 });
    radarEngine.imageCache.set(testUrlB, { complete: true, naturalWidth: 256, naturalHeight: 256 });

    // Mock getTileDescriptors
    const origGetTileDescriptors = radarEngine.getTileDescriptors;
    radarEngine.getTileDescriptors = (loc, ts, prod) => {
        return [{ url: ts === 1000 ? testUrlA : testUrlB, dx: 0, dy: 0, dw: 256, dh: 256 }];
    };

    try {
        // Test 1: Single frame rendering (backward compatibility)
        drawCalls.length = 0;
        radarEngine.renderFrame(mockCtx, mockLoc, null, 1000, 'radar');
        assert.ok(drawCalls.some(c => c.type === 'fillRect'));
        assert.ok(drawCalls.some(c => c.type === 'drawImage'));

        // Test 2: Interpolated radar frame at alpha = 0.5
        drawCalls.length = 0;
        radarEngine.renderInterpolatedFrame(mockCtx, mockLoc, null, 1000, 2000, 0.5, 'radar');
        assert.ok(drawCalls.some(c => c.type === 'fillRect'));
        // Drop shadows saved & drawn
        assert.ok(drawCalls.some(c => c.type === 'save'));
        // Precipitation drawn for both frames
        const precipDraws = drawCalls.filter(c => c.type === 'drawImage');
        assert.ok(precipDraws.length >= 4); // 2 shadow draws + 2 precip draws
        // Ensure no -3000 offset hack in drawImage coordinates
        for (const draw of precipDraws) {
            assert.equal(draw.args[1], 0, 'X coordinate must be normal dx (0), not -3000');
        }
        // Ensure shadow offset is normal (12, 8), not 3012
        assert.equal(mockCtx.shadowOffsetX, 12);
        assert.equal(mockCtx.shadowOffsetY, 8);

        // Test 3: Interpolated satellite frame at alpha = 0.5
        drawCalls.length = 0;
        radarEngine.renderInterpolatedFrame(mockCtx, mockLoc, null, 1000, 2000, 0.5, 'satellite');
        assert.ok(drawCalls.some(c => c.type === 'fillRect'));
        const satDraws = drawCalls.filter(c => c.type === 'drawImage');
        assert.equal(satDraws.length, 2); // 1 for tsA at 0.5, 1 for tsB at 0.5
        // Anti-dimming curve: both frames maintain >0.75 opacity at midpoint, eliminating the 50% luminance dip
        assert.ok(satDraws[0].alpha > 0.75, `Expected alpha > 0.75 but got ${satDraws[0].alpha}`);
        assert.ok(satDraws[1].alpha > 0.75, `Expected alpha > 0.75 but got ${satDraws[1].alpha}`);
    } finally {
        radarEngine.getTileDescriptors = origGetTileDescriptors;
        radarEngine.imageCache.delete(testUrlA);
        radarEngine.imageCache.delete(testUrlB);
    }
});

test('radarEngine double-buffering offscreen buffer eliminates tearing', () => {
    const mockBufCanvas = {
        width: 1620,
        height: 1080,
        getContext() { return { fillRect() {}, drawImage() {}, save() {}, restore() {} }; }
    };
    global.document = {
        createElement(tag) {
            if (tag === 'canvas') return mockBufCanvas;
            return {};
        }
    };
    try {
        radarEngine.renderBuffer = null;
        const buf = radarEngine.getRenderBuffer(1620, 1080);
        assert.equal(buf, mockBufCanvas);
        // Repeated calls must return the same cached instance (zero allocation)
        assert.equal(radarEngine.getRenderBuffer(), mockBufCanvas);
    } finally {
        radarEngine.renderBuffer = null;
        delete global.document;
    }
});

test('radarEngine playback lifecycle manages RAF and interval timers properly', () => {
    let rafScheduled = null;
    let rafCancelled = null;
    let intervalScheduled = null;
    let intervalCleared = null;

    global.requestAnimationFrame = (cb) => {
        rafScheduled = 999;
        return rafScheduled;
    };
    global.cancelAnimationFrame = (id) => {
        rafCancelled = id;
    };

    const mockContainer = {
        querySelector() { return null; },
        innerHTML: '',
        appendChild(child) { return child; }
    };
    const mockCanvas = {
        className: '',
        width: 1620,
        height: 1080,
        style: {},
        getContext() {
            return {
                fillRect() {},
                drawImage() {},
                save() {},
                restore() {}
            };
        }
    };
    global.document = {
        getElementById(id) { return mockContainer; },
        createElement(tag) { return mockCanvas; }
    };

    radarEngine.timestamps = [1000, 2000, 3000];
    radarEngine.basemapCache.set('regional', {});

    try {
        // Case A: Interpolation enabled -> should schedule RAF
        global.appearanceSettings = { smoothRadar: true };
        radarEngine.startPlayback('regradar', 'regional', 'radar');
        assert.equal(radarEngine.activeTarget, 'regradar');
        assert.equal(radarEngine.activeRaf, 999);
        assert.equal(radarEngine.activeInterval, null);

        // Stop playback
        radarEngine.stopPlayback();
        assert.equal(radarEngine.activeTarget, null);
        assert.equal(radarEngine.activeRaf, null);
        assert.equal(rafCancelled, 999);

        // Case B: Interpolation disabled -> should schedule setInterval
        global.appearanceSettings = { smoothRadar: false };
        radarEngine.startPlayback('regradar', 'regional', 'radar');
        assert.equal(radarEngine.activeTarget, 'regradar');
        assert.ok(radarEngine.activeInterval !== null);
        assert.equal(radarEngine.activeRaf, null);

        // Stop playback
        radarEngine.stopPlayback();
        assert.equal(radarEngine.activeTarget, null);
        assert.equal(radarEngine.activeInterval, null);
    } finally {
        radarEngine.stopPlayback();
        delete global.requestAnimationFrame;
        delete global.cancelAnimationFrame;
        delete global.document;
        delete global.appearanceSettings;
    }
});

test('radarEngine animation loop features smooth wrap-around dissolve to frame 0', () => {
    let tickFn = null;
    global.requestAnimationFrame = (cb) => {
        tickFn = cb;
        return 123;
    };
    global.cancelAnimationFrame = () => {};

    const calls = [];
    const origRender = radarEngine.renderInterpolatedFrame;
    radarEngine.renderInterpolatedFrame = (ctx, loc, basemap, tsA, tsB, alpha, layer) => {
        calls.push({ tsA, tsB, alpha, layer });
    };

    const mockContainer = {
        querySelector() { return null; },
        innerHTML: '',
        appendChild(child) { return child; }
    };
    const mockCanvas = {
        className: '',
        width: 1620,
        height: 1080,
        style: {},
        getContext() {
            return {
                fillRect() {},
                drawImage() {},
                save() {},
                restore() {}
            };
        }
    };
    global.document = {
        getElementById(id) { return mockContainer; },
        createElement(tag) { return mockCanvas; }
    };

    radarEngine.timestamps = [1000, 2000, 3000]; // 3 frames: transition = 2 * 240 = 480ms, dwell = 600ms, wrap = 240ms. Total = 1320ms
    radarEngine.basemapCache.set('regional', {});
    global.appearanceSettings = { smoothRadar: true };

    try {
        radarEngine.startPlayback('regradar', 'regional', 'radar');
        assert.ok(typeof tickFn === 'function');
        calls.length = 0;

        // Simulate tick at wrap phase: 480ms (trans) + 600ms (dwell) + 120ms (halfway wrap) = 1200ms
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        tickFn(now + 1200);

        const wrapCall = calls.find(c => c.tsA === 3000 && c.tsB === 1000);
        assert.ok(wrapCall, 'Expected wrap-around call from frame 3000 back to frame 1000');
        assert.ok(Math.abs(wrapCall.alpha - 0.5) < 0.05, `Expected alpha ~0.5 but got ${wrapCall.alpha}`);
    } finally {
        radarEngine.stopPlayback();
        radarEngine.renderInterpolatedFrame = origRender;
        delete global.requestAnimationFrame;
        delete global.cancelAnimationFrame;
        delete global.document;
        delete global.appearanceSettings;
    }
});

