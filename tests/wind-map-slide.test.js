'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Wind map (Champ des Vents) slide layout, streamflow engine, legend, and regional pairing', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const myConfigPath = path.join(rootDir, 'MYCONFIG.json');
    const configJsPath = path.join(rootDir, 'webroot', 'js', 'config.js');
    const extrasJsPath = path.join(rootDir, 'webroot', 'js', 'extras.js');
    const settingsJsPath = path.join(rootDir, 'webroot', 'js', 'settings.js');
    const editorModelPath = path.join(rootDir, 'webroot', 'js', 'editor-model.js');
    const radarJsPath = path.join(rootDir, 'webroot', 'js', 'radar.js');
    const slidesJsPath = path.join(rootDir, 'webroot', 'js', 'slides.js');
    const indexHtmlPath = path.join(rootDir, 'webroot', 'index.html');
    const previewHtmlPath = path.join(rootDir, 'webroot', 'preview.html');

    await t.test('editor-model.js registers Carte des Vents slides in catalog and validates presets', () => {
        const editorModel = require(editorModelPath);
        assert.ok(editorModel && editorModel.slides, 'editorModel must export slides');

        const windEntries = editorModel.slides.filter(s => s.label && (s.label.toLowerCase().includes('carte des vents') || s.label.toLowerCase().includes('vents')));
        assert.ok(windEntries.length >= 10, 'There should be numbered Carte des Vents slides for regions');
        assert.ok(windEntries.some(s => s.function === 'carteVents'));
        assert.ok(windEntries.some(s => s.function === 'carteVents2'));
        assert.ok(windEntries.some(s => s.function === 'carteVents10'));
        assert.ok(windEntries.some(s => s.function === 'canadaVents'));

        const { readDefaults } = require(path.join(rootDir, 'editor-store'));
        const defaults = readDefaults(rootDir);
        const normalized = editorModel.normalize({
            mainCity: { autoFind: false, displayname: 'Montréal', type: 'geocode', val: '45.503,-73.573' },
            slideOrder: [
                { function: 'couvertureNuageuse', slideDelay: 8500 },
                { function: 'carteVents', slideDelay: 8500 },
                { function: 'neigeAuSol', slideDelay: 8500 }
            ]
        }, defaults);
        assert.doesNotThrow(() => editorModel.validate({
            schemaVersion: 1,
            name: 'Wind Streamflow Broadcast',
            config: normalized,
            layout: {},
            elements: []
        }));
    });

    await t.test('slides.js defines slideDivs mappings and slidePrograms runners for carteVents', () => {
        const slidesCode = fs.readFileSync(slidesJsPath, 'utf8');
        assert.ok(slidesCode.includes('"carteVents": ".wind-map"'));
        assert.ok(slidesCode.includes('"carteVents2": ".wind-map"'));
        assert.ok(slidesCode.includes('"carteVents10": ".wind-map"'));
        assert.ok(slidesCode.includes('"canadaVents": ".wind-map"'));
        assert.ok(slidesCode.includes('async carteVents(dopplerIdx = 0)'));
        assert.ok(slidesCode.includes('Champ des Vents'));
        assert.ok(slidesCode.includes('startWindMap'));
        assert.ok(slidesCode.includes('stopWindMap'));
    });

    await t.test('radar.js defines and exports wind map streaming and animation functions', () => {
        // Setup minimal browser mocks for radar.js
        global.window = {};
        global.document = {
            createElement: () => ({
                getContext: () => ({
                    drawImage: () => {},
                    fillRect: () => {},
                    beginPath: () => {},
                    arc: () => {},
                    fill: () => {},
                    stroke: () => {},
                    moveTo: () => {},
                    lineTo: () => {},
                    save: () => {},
                    restore: () => {},
                    createRadialGradient: () => ({ addColorStop: () => {} })
                }),
                style: {}
            }),
            getElementById: () => null
        };
        global.Image = class {
            constructor() {
                this.src = '';
            }
        };

        const radar = require(radarJsPath);
        assert.equal(typeof radar.startWindMap, 'function');
        assert.equal(typeof radar.stopWindMap, 'function');
        assert.equal(typeof radar.addWindCities, 'function');
        assert.equal(typeof radar.fetchWindDataForCities, 'function');
        assert.ok(radar.radarEngine, 'radarEngine must be exported');
        assert.equal(typeof radar.radarEngine.startWindAnimation, 'function');
        assert.equal(typeof radar.radarEngine.getInterpolatedWindAt, 'function');
        assert.equal(typeof radar.radarEngine.renderWindField, 'function');
        assert.equal(typeof radar.radarEngine.renderWindStreamlines, 'function');

        // Test vector field interpolation
        const vector = radar.radarEngine.getInterpolatedWindAt(800, 500);
        assert.ok(typeof vector.u === 'number');
        assert.ok(typeof vector.v === 'number');
        assert.ok(typeof vector.speed === 'number' && vector.speed > 0);
    });

    await t.test('fetchWindDataForCities matches weatherInfo, API data, and produces non-identical variations', async () => {
        const radar = require(radarJsPath);

        // 1. Test weatherInfo matching
        global.weatherInfo = {
            currentConditions: {
                wind: 'SO 14',
                windRaw: { direction: 'SO', deg: 225, speed: 14 }
            },
            quebecCities: {
                cities: [
                    { name: 'Montréal', wind: 'SSO 18', windRaw: { direction: 'SSO', deg: 202.5, speed: 18 }, gusts: 28 },
                    { name: 'Québec', wind: 'NE 25', windRaw: { direction: 'NE', deg: 45, speed: 25 }, gusts: 35 }
                ]
            }
        };

        const testCities = [
            { name: 'Montréal', lat: 45.50, lon: -73.57 },
            { name: 'Québec', lat: 46.81, lon: -71.21 },
            { name: 'Sherbrooke', lat: 45.40, lon: -71.89 },
            { name: 'Gatineau', lat: 45.43, lon: -75.70 }
        ];

        const data = await radar.fetchWindDataForCities(testCities);
        assert.ok(data['montréal'], 'Montréal data exists');
        assert.equal(data['montréal'].speedKmH, 18);
        assert.equal(data['montréal'].dirDeg, 202.5);
        assert.equal(data['montréal'].gustsKmH, 28);

        assert.ok(data['québec'], 'Québec data exists');
        assert.equal(data['québec'].speedKmH, 25);
        assert.equal(data['québec'].dirDeg, 45);

        // Cities not in weatherInfo have generated realistic localized variations (not identical lockstep)
        assert.ok(data['sherbrooke']);
        assert.ok(data['gatineau']);
        assert.ok(data['sherbrooke'].speedKmH > 0);
        assert.ok(data['gatineau'].speedKmH > 0);
        // Verify that cities across different coordinates do NOT have identical wind vectors
        const speeds = Object.values(data).map(d => d.speedKmH);
        const uniqueSpeeds = new Set(speeds);
        assert.ok(uniqueSpeeds.size > 1, 'Cities must show varied, realistic wind speeds, not all identical');
    });

    await t.test('HTML templates and asset images exist for wind map and extended radar legend', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        assert.ok(indexHtml.includes('id="radarwind"'), 'index.html must have #radarwind');
        assert.ok(indexHtml.includes('wind-map'), 'index.html must include .wind-map container');
        assert.ok(indexHtml.includes('windLegend.png'), 'index.html must include windLegend.png');

        const previewHtml = fs.readFileSync(previewHtmlPath, 'utf8');
        assert.ok(previewHtml.includes('id="radarwind"'), 'preview.html must have #radarwind');
        assert.ok(previewHtml.includes('wind-map'), 'preview.html must include .wind-map container');

        // Verify assets exist on disk
        const windLegend2026 = path.join(rootDir, 'webroot', 'images', '2026', 'windLegend.png');
        const windLegendCompat = path.join(rootDir, 'webroot', 'images', 'windLegend.png');
        const radarLegend2026 = path.join(rootDir, 'webroot', 'images', '2026', 'radarLegend.png');
        const radarLegendCompat = path.join(rootDir, 'webroot', 'images', 'radarLegend.png');

        assert.ok(fs.existsSync(windLegend2026), '2026 windLegend.png exists');
        assert.ok(fs.existsSync(windLegendCompat), 'compat windLegend.png exists');
        assert.ok(fs.existsSync(radarLegend2026), '2026 radarLegend.png exists');
        assert.ok(fs.existsSync(radarLegendCompat), 'compat radarLegend.png exists');

        // Verify legend asset generator script includes PLUIE, MIXTE, NEIGE, and CALME
        const genScriptPath = path.join(rootDir, 'scripts', 'generate-2026-assets.js');
        const genScript = fs.readFileSync(genScriptPath, 'utf8');
        assert.ok(genScript.includes('MIXTE'));
        assert.ok(genScript.includes('NEIGE'));
        assert.ok(genScript.includes('PLUIE'));
        assert.ok(genScript.includes('CALME'));
        assert.ok(genScript.includes('80+ KM/H'));
    });

    await t.test('CSS stylesheets define full styling for .wind-map across all packages', () => {
        const css2026 = fs.readFileSync(path.join(rootDir, 'webroot', 'css', 'intellistar-32-2026.css'), 'utf8');
        const css2007 = fs.readFileSync(path.join(rootDir, 'webroot', 'css', 'intellistar-32-2007.css'), 'utf8');
        const css2008 = fs.readFileSync(path.join(rootDir, 'webroot', 'css', 'intellistar-32-2008.css'), 'utf8');
        const css2009 = fs.readFileSync(path.join(rootDir, 'webroot', 'css', 'intellistar-32-2009.css'), 'utf8');
        const mainCss = fs.readFileSync(path.join(rootDir, 'webroot', 'main.css'), 'utf8');

        assert.ok(css2026.includes('.wind-map'));
        assert.ok(css2026.includes('#radarwind'));
        assert.ok(css2026.includes('.city-wind-badge'));
        assert.ok(css2026.includes('.city-wind-arrow'));
        assert.ok(css2026.includes('.city-gust-badge'));
        assert.ok(css2026.includes('.wind-map .banner'), '2026 CSS must include .wind-map .banner for blue top header');
        assert.ok(css2026.includes('.wind-map .header'), '2026 CSS must include .wind-map .header for title styling');

        assert.ok(mainCss.includes('.wind-map .banner'), 'main.css must include .wind-map .banner');
        assert.ok(mainCss.includes('.wind-map .header'), 'main.css must include .wind-map .header');

        assert.ok(css2007.includes('.wind-map'));
        assert.ok(css2007.includes('.wind-map .banner'));
        assert.ok(css2007.includes('#radarwind'));

        assert.ok(css2008.includes('.wind-map'));
        assert.ok(css2008.includes('.wind-map .banner'));
        assert.ok(css2008.includes('#radarwind'));

        assert.ok(css2009.includes('.wind-map'));
        assert.ok(css2009.includes('.wind-map .banner'));
        assert.ok(css2009.includes('#radarwind'));
    });
});
