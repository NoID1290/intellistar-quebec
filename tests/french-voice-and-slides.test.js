'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('French vocal audio routing and slide narration', async (t) => {
    const vocalJsPath = path.join(__dirname, '..', 'webroot', 'js', 'vocallocal.js');
    const audioJsPath = path.join(__dirname, '..', 'webroot', 'js', 'audio.js');

    await t.test('getVocallocalPath resolves French directory when vocalLanguage is fr or units is metric', () => {
        global.audioSettings = { vocalLanguage: 'fr' };
        global.appearanceSettings = { units: 'metric' };
        const vocal = require(vocalJsPath);
        assert.equal(vocal.getVocallocalPath(), '/vocallocal_fr/');

        global.audioSettings = { vocalLanguage: 'en' };
        global.appearanceSettings = { units: 'imperial' };
        assert.equal(vocal.getVocallocalPath(), '/vocallocal/');

        // Metric default implies fr
        delete global.audioSettings.vocalLanguage;
        global.appearanceSettings = { units: 'metric' };
        assert.equal(vocal.getVocallocalPath(), '/vocallocal_fr/');
    });

    await t.test('vocallocalCC generates valid French paths and formats negative temperatures', () => {
        global.audioSettings = { vocalLanguage: 'fr' };
        global.appearanceSettings = { units: 'metric' };
        global.weatherInfo = {
            currentConditions: { temp: -8, icon: 26 },
            bulletin: {}
        };
        const vocal = require(vocalJsPath);
        const queue = vocal.vocallocalCC();
        assert.ok(Array.isArray(queue) && queue.length >= 2);
        assert.ok(queue.every(item => typeof item === 'string' && item.startsWith('/vocallocal_fr/')));
        assert.ok(queue.some(item => item.includes('/temp/M8.wav')));
        assert.ok(!queue.some(item => item.includes('undefined')));
    });

    await t.test('vocallocalLF correctly handles French day names, temperatures, and wind directions', () => {
        global.audioSettings = { vocalLanguage: 'fr' };
        global.appearanceSettings = { units: 'metric' };
        global.weatherInfo = {
            dayDesc: {
                days: [
                    {
                        name: "Aujourd'hui",
                        rawName: "Today",
                        desc: "Généralement ensoleillé. Max 22. Vents SO de 15 à 25 km/h.",
                        rawDesc: "Mostly sunny. High 22. Winds SW at 15 to 25 mph.",
                        iconCode: 32
                    },
                    {
                        name: "Ce soir",
                        desc: "Partiellement nuageux. Min -4. Vents ONO de 10 à 20 km/h.",
                        iconCode: 29
                    }
                ]
            }
        };
        const vocal = require(vocalJsPath);
        
        // Test day 0 with raw English and French text
        const queue0 = vocal.vocallocalLF(0, 8000);
        assert.ok(Array.isArray(queue0) && queue0.length >= 3);
        assert.ok(queue0.every(item => typeof item === 'string' && item.startsWith('/vocallocal_fr/')));
        assert.ok(queue0.includes('/vocallocal_fr/dayname/Today.wav'));
        assert.ok(queue0.includes('/vocallocal_fr/highlow/HIGH_22.wav'));
        assert.ok(!queue0.some(item => item.includes('undefined')));

        // Test day 1 with French-only text and negative minimum temperature
        const queue1 = vocal.vocallocalLF(1, 8000);
        assert.ok(Array.isArray(queue1) && queue1.length >= 2);
        assert.ok(queue1.every(item => typeof item === 'string' && item.startsWith('/vocallocal_fr/')));
        assert.ok(queue1.includes('/vocallocal_fr/dayname/Tonight.wav'));
        assert.ok(queue1.includes('/vocallocal_fr/highlow/LOW_M4.wav'));
        assert.ok(!queue1.some(item => item.includes('undefined')));
    });

    await t.test('vocallocalBulletin maps French alert names to appropriate wav tracks', () => {
        global.audioSettings = { vocalLanguage: 'fr' };
        global.appearanceSettings = { units: 'metric' };
        const vocal = require(vocalJsPath);

        global.weatherInfo = {
            bulletin: { alerts: [{ name: "Alerte de tornade" }] }
        };
        const tornadoQueue = vocal.vocallocalBulletin();
        assert.deepEqual(tornadoQueue, ['/vocallocal_fr/TORNADO_DEFAULT.wav']);

        global.weatherInfo = {
            bulletin: { alerts: [{ name: "Alerte d'orage violent" }] }
        };
        const tstormQueue = vocal.vocallocalBulletin();
        assert.deepEqual(tstormQueue, ['/vocallocal_fr/TSTORM_DEFAULT.wav']);

        global.weatherInfo = {
            bulletin: { alerts: [{ name: "Alerte de crue subite" }] }
        };
        const floodQueue = vocal.vocallocalBulletin();
        assert.deepEqual(floodQueue, ['/vocallocal_fr/FFLOOD_DEFAULT.wav']);

        global.weatherInfo = {
            bulletin: { alerts: [{ name: "Avis de gel" }] }
        };
        const defaultQueue = vocal.vocallocalBulletin();
        assert.deepEqual(defaultQueue, ['/vocallocal_fr/BULLETIN_DEFAULT.wav']);
    });

    await t.test('AudioManager playSevere correctly dispatches French alert wavs', () => {
        global.audioSettings = { vocalLanguage: 'fr' };
        global.appearanceSettings = { units: 'metric' };
        global.window = {};
        global.document = { baseURI: '/' };
        global.$ = () => ({ jPlayer: () => {}, append: () => {} });

        const audioJsCode = fs.readFileSync(audioJsPath, 'utf8');
        const player = new Function('global', 'window', 'document', '$', 'audioSettings', 'appearanceSettings', 'getVocallocalPath', `${audioJsCode}; return audioPlayer;`)(global, global.window, global.document, global.$, global.audioSettings, global.appearanceSettings, require(vocalJsPath).getVocallocalPath);
        let playedQueue = [];
        player.startPlaying = (queue) => { playedQueue = queue; };

        player.playSevere("Alerte de tornade");
        assert.deepEqual(playedQueue, [
            '/vocallocal_fr/beep.wav',
            '/vocallocal_fr/TORNADO_DEFAULT.wav',
            '/vocallocal_fr/beep.wav'
        ]);

        player.playSevere("Alerte d'orage violent");
        assert.deepEqual(playedQueue, [
            '/vocallocal_fr/beep.wav',
            '/vocallocal_fr/TSTORM_DEFAULT.wav',
            '/vocallocal_fr/beep.wav'
        ]);

        player.playSevere("Alerte de crue subite");
        assert.deepEqual(playedQueue, [
            '/vocallocal_fr/beep.wav',
            '/vocallocal_fr/FFLOOD_DEFAULT.wav',
            '/vocallocal_fr/beep.wav'
        ]);
    });

    await t.test('Configuration prevents duplicate Montreal slides', () => {
        const myConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'MYCONFIG.json'), 'utf8'));
        const mapCurrentInMyConfig = myConfig.slideSettings.order.filter(s => s && s.function === 'mapCurrent');
        assert.equal(mapCurrentInMyConfig.length, 1, 'mapCurrent must only appear once in MYCONFIG.json');

        const configJsCode = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'js', 'config.js'), 'utf8');
        const parsedSlideSettings = new Function(`${configJsCode}; return slideSettings;`)();
        const weekAheadInConfig = parsedSlideSettings.order.filter(s => s && s.function === 'weekAhead');
        assert.equal(weekAheadInConfig.length, 0, 'weekAhead must not duplicate quebecWeekAhead in config.js');
    });
});
