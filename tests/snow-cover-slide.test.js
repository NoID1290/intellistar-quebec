'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Neige au Sol (Snow accumulation) layout, sequence pairing, and radar integration', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const myConfigPath = path.join(rootDir, 'MYCONFIG.json');
    const configJsPath = path.join(rootDir, 'webroot', 'js', 'config.js');
    const extrasJsPath = path.join(rootDir, 'webroot', 'js', 'extras.js');
    const settingsJsPath = path.join(rootDir, 'webroot', 'js', 'settings.js');
    const editorModelPath = path.join(rootDir, 'webroot', 'js', 'editor-model.js');
    const radarJsPath = path.join(rootDir, 'webroot', 'js', 'radar.js');
    const indexHtmlPath = path.join(rootDir, 'webroot', 'index.html');
    const previewHtmlPath = path.join(rootDir, 'webroot', 'preview.html');

    await t.test('MYCONFIG.json pairs every couvertureNuageuse slide with a corresponding neigeAuSol slide', () => {
        const myConfig = JSON.parse(fs.readFileSync(myConfigPath, 'utf8'));
        const order = myConfig.slideSettings.order;
        assert.ok(Array.isArray(order) && order.length > 0);

        const cloudSlides = order.filter(s => s && typeof s.function === 'string' && s.function.startsWith('couvertureNuageuse'));
        assert.ok(cloudSlides.length > 0, 'MYCONFIG.json must have couvertureNuageuse slides');

        for (let i = 0; i < order.length; i++) {
            const slide = order[i];
            if (slide && typeof slide.function === 'string' && slide.function.startsWith('couvertureNuageuse')) {
                const next = order[i + 1];
                assert.ok(next, `Slide ${slide.function} at index ${i} must have a following slide`);
                assert.ok(
                    next.function.startsWith('neigeAuSol'),
                    `Slide ${slide.function} must be directly followed by a neigeAuSol slide, but got ${next.function}`
                );
            }
        }
    });

    await t.test('config.js pairs every couvertureNuageuse slide with a corresponding neigeAuSol slide', () => {
        const code = fs.readFileSync(configJsPath, 'utf8');
        const parsedSlideSettings = new Function(`${code}; return slideSettings;`)();
        const order = parsedSlideSettings.order;
        assert.ok(Array.isArray(order) && order.length > 0);

        for (let i = 0; i < order.length; i++) {
            const slide = order[i];
            if (slide && typeof slide.function === 'string' && slide.function.startsWith('couvertureNuageuse')) {
                const next = order[i + 1];
                assert.ok(next, `Slide ${slide.function} in config.js must have a following slide`);
                assert.ok(
                    next.function.startsWith('neigeAuSol'),
                    `Slide ${slide.function} in config.js must be directly followed by neigeAuSol, but got ${next.function}`
                );
            }
        }
    });

    await t.test('extras.js flavor presets pair every couvertureNuageuse with neigeAuSol', () => {
        const code = fs.readFileSync(extrasJsPath, 'utf8');
        const flavors = new Function(`${code}; return slideFlavors;`)();
        assert.ok(flavors);

        for (const [duration, presetList] of Object.entries(flavors)) {
            for (let p = 0; p < presetList.length; p++) {
                const preset = presetList[p];
                if (!Array.isArray(preset.order)) continue;

                for (let i = 0; i < preset.order.length; i++) {
                    const slide = preset.order[i];
                    if (slide && typeof slide.function === 'string' && slide.function.startsWith('couvertureNuageuse')) {
                        const next = preset.order[i + 1];
                        assert.ok(
                            next && next.function.startsWith('neigeAuSol'),
                            `Preset ${duration}[${p}] slide ${slide.function} must be directly followed by neigeAuSol, but got ${next ? next.function : 'none'}`
                        );
                    }
                }
            }
        }
    });

    await t.test('settings.js normalizeToLocalDoppler automatically pairs neigeAuSol after couvertureNuageuse', () => {
        // Provide mock browser environment required by settings.js
        global.window = {};
        global.document = {
            addEventListener: () => {},
            getElementById: () => ({ remove: () => {} })
        };
        global.$ = () => ({
            val: () => '',
            on: () => {},
            find: () => ({ length: 0 }),
            html: () => {},
            fadeOut: () => {},
            children: () => ({ remove: () => {} }),
            text: () => {}
        });
        global.localStorage = { getItem: () => null, setItem: () => {} };
        global.location = { search: '' };
        global.defaultSettings = {};
        global.mainSettings = {};
        global.appearanceSettings = {};
        global.audioSettings = {};
        global.locationSettings = {};
        global.slideSettings = { auto: false, order: [] };
        global.modes = {};
        global.regionalCities = [];

        const settings = require(settingsJsPath);
        assert.equal(typeof settings.normalizeToLocalDoppler, 'function');
        assert.equal(typeof settings.getSnowSlideForCloud, 'function');

        // Test getSnowSlideForCloud mappings
        assert.equal(settings.getSnowSlideForCloud('couvertureNuageuse'), 'neigeAuSol');
        assert.equal(settings.getSnowSlideForCloud('couvertureNuageuse1'), 'neigeAuSol');
        assert.equal(settings.getSnowSlideForCloud('couvertureNuageuse2'), 'neigeAuSol2');
        assert.equal(settings.getSnowSlideForCloud('couvertureNuageuse10'), 'neigeAuSol10');
        assert.equal(settings.getSnowSlideForCloud('canadaSatellite'), 'canadaNeigeAuSol');

        // Test normalizeToLocalDoppler pairing: when given only couvertureNuageuse, neigeAuSol is added
        const testOrder1 = [
            { function: 'couvertureNuageuse', slideDelay: 8500 }
        ];
        const res1 = settings.normalizeToLocalDoppler(testOrder1);
        assert.equal(res1.length, 2);
        assert.equal(res1[0].function, 'couvertureNuageuse');
        assert.equal(res1[1].function, 'neigeAuSol');

        // Test when given localDoppler alone: both couvertureNuageuse and neigeAuSol are added
        const testOrder2 = [
            { function: 'localDoppler', slideDelay: 9000 }
        ];
        const res2 = settings.normalizeToLocalDoppler(testOrder2);
        assert.equal(res2.length, 3);
        assert.equal(res2[0].function, 'localDoppler');
        assert.equal(res2[1].function, 'couvertureNuageuse');
        assert.equal(res2[2].function, 'neigeAuSol');

        // Test when already properly paired: no duplicate neigeAuSol added
        const testOrder3 = [
            { function: 'couvertureNuageuse', slideDelay: 8500 },
            { function: 'neigeAuSol', slideDelay: 8500 }
        ];
        const res3 = settings.normalizeToLocalDoppler(testOrder3);
        assert.equal(res3.length, 2);
    });

    await t.test('editor-model.js includes Neige au Sol in slides catalog and validates correctly', () => {
        const editorModel = require(editorModelPath);
        assert.ok(editorModel && editorModel.slides, 'editorModel must export slides');

        const snowEntries = editorModel.slides.filter(s => s.label && s.label.startsWith('Neige au sol'));
        assert.ok(snowEntries.length >= 10, 'There should be at least 10 Neige au Sol numbered slides');
        assert.ok(snowEntries.some(s => s.function === 'neigeAuSol'));
        assert.ok(snowEntries.some(s => s.function === 'neigeAuSol2'));
        assert.ok(snowEntries.some(s => s.function === 'neigeAuSol10'));

        const { readDefaults } = require(path.join(rootDir, 'editor-store'));
        const defaults = readDefaults(rootDir);
        const normalized = editorModel.normalize({
            mainCity: { autoFind: false, displayname: 'Montréal', type: 'geocode', val: '45.503,-73.573' },
            slideOrder: [
                { function: 'couvertureNuageuse', slideDelay: 8500 },
                { function: 'neigeAuSol', slideDelay: 8500 }
            ]
        }, defaults);
        assert.doesNotThrow(() => editorModel.validate({
            schemaVersion: 1,
            name: 'Winter Broadcast',
            config: normalized,
            layout: {},
            elements: []
        }));
    });

    await t.test('radar.js defines and exports snow cover engine functions', () => {
        const radarCode = fs.readFileSync(radarJsPath, 'utf8');
        assert.ok(radarCode.includes('startSnowCover'), 'radar.js must define startSnowCover');
        assert.ok(radarCode.includes('stopSnowCover'), 'radar.js must define stopSnowCover');
        assert.ok(radarCode.includes('fetchSnowAccumulationForCities'), 'radar.js must define fetchSnowAccumulationForCities');
        assert.ok(radarCode.includes('addSnowCities'), 'radar.js must define addSnowCities');
        assert.ok(radarCode.includes('snowProduct'), 'radar.js must configure snowProduct');
        assert.ok(radarCode.includes('snowParticles'), 'radar.js must configure snowParticles');
        assert.ok(radarCode.includes('renderSnowAccumulationLayer'), 'radar.js must define renderSnowAccumulationLayer');
    });

    await t.test('HTML templates and assets are in place for Neige au Sol presentation', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        assert.ok(indexHtml.includes('snowLegend.png'), 'index.html preloads snowLegend.png');
        assert.ok(indexHtml.includes('id="radarsnow"'), 'index.html must include #radarsnow container');
        assert.ok(indexHtml.includes('snow-cover'), 'index.html must include .snow-cover container');
        assert.ok(indexHtml.includes('NEIGE AU SOL'), 'index.html must include NEIGE AU SOL header/banner');

        const previewHtml = fs.readFileSync(previewHtmlPath, 'utf8');
        assert.ok(previewHtml.includes('id="radarsnow"'), 'preview.html must include #radarsnow container');
        assert.ok(previewHtml.includes('Neige au Sol') || previewHtml.includes('NEIGE AU SOL'), 'preview.html must list Neige au Sol');

        // Check image assets
        const legendPath = path.join(rootDir, 'webroot', 'images', 'snowLegend.png');
        const legend2026Path = path.join(rootDir, 'webroot', 'images', '2026', 'snowLegend.png');
        assert.ok(fs.existsSync(legendPath), 'webroot/images/snowLegend.png must exist');
        assert.ok(fs.existsSync(legend2026Path), 'webroot/images/2026/snowLegend.png must exist');
    });
});
