'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('ECCC is used by default across newlocation.js, weather.js, and radar.js without calling api.weather.com', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const extrasCode = fs.readFileSync(path.join(rootDir, 'webroot', 'js', 'extras.js'), 'utf8');
    const configCode = fs.readFileSync(path.join(rootDir, 'webroot', 'js', 'config.js'), 'utf8');
    const newlocationCode = fs.readFileSync(path.join(rootDir, 'webroot', 'js', 'newlocation.js'), 'utf8');
    const weatherCode = fs.readFileSync(path.join(rootDir, 'webroot', 'js', 'weather.js'), 'utf8');
    const { radarEngine } = require(path.join(rootDir, 'webroot', 'js', 'radar.js'));

    await t.test('radarEngine uses ECCC GeoMet WMS by default for radar, satellite cloud, and snow radar', async () => {
        assert.equal(radarEngine.useEcccWms, true);
        await radarEngine.fetchAllTimestamps(12);
        assert.equal(radarEngine.timestamps.length, 12);
        assert.equal(radarEngine.satProduct, 'HRDPS.CONTINENTAL_NT');
        assert.equal(radarEngine.snowProduct, 'RADAR_1KM_RSNO');

        const loc = { lon: -73.573, lat: 45.503, zoom: 7.7 };
        const radarTiles = radarEngine.getTileDescriptors(loc, radarEngine.timestamps[11], 'twcRadarMosaic');
        assert.equal(radarTiles.length, 1);
        assert.ok(radarTiles[0].url.startsWith('https://geo.weather.gc.ca/geomet?SERVICE=WMS'));
        assert.ok(radarTiles[0].url.includes('LAYERS=RADAR_1KM_RRAI'));
        assert.ok(radarTiles[0].url.includes('STYLES=Radar-Rain_14colors'));
        assert.ok(radarTiles[0].url.includes('WIDTH=1620&HEIGHT=1080'));

        // Regional / local satellite uses 2.5km HRDPS
        const satTiles = radarEngine.getTileDescriptors(loc, radarEngine.satTimestamps[0], radarEngine.satProduct);
        assert.equal(satTiles.length, 1);
        assert.ok(satTiles[0].url.includes('LAYERS=HRDPS.CONTINENTAL_NT&STYLES=CLOUD'));
        assert.ok(satTiles[0].url.includes('WIDTH=1620&HEIGHT=1080'));

        // Broad national satellite uses RDPS_10km_TotalCloudCover (no Atlantic cutoff)
        const nationalLoc = { lon: -96.0, lat: 56.0, zoom: 4.8, name: 'Radar National Canada' };
        const nationalSatTiles = radarEngine.getTileDescriptors(nationalLoc, radarEngine.satTimestamps[0], 'satellite');
        assert.equal(nationalSatTiles.length, 1);
        assert.ok(nationalSatTiles[0].url.includes('LAYERS=RDPS_10km_TotalCloudCover&STYLES=CLOUD'));
        assert.ok(nationalSatTiles[0].url.includes('WIDTH=1620&HEIGHT=1080'));

        const snowTiles = radarEngine.getTileDescriptors(loc, radarEngine.snowTimestamps[11], radarEngine.snowProduct);
        assert.equal(snowTiles.length, 1);
        assert.ok(snowTiles[0].url.includes('LAYERS=RADAR_1KM_RSNO'));
        assert.ok(snowTiles[0].url.includes('STYLES=Radar-Snow_14colors'));
        assert.ok(snowTiles[0].url.includes('WIDTH=1620&HEIGHT=1080'));
    });

    await t.test('newlocation.js and weather.js populate all weather structures from ECCC without calling api.weather.com', async () => {
        const requestedUrls = [];
        const mockEcccFeature = {
            id: 'qc-147',
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-73.58, 45.51, 0] },
            properties: {
                name: { en: 'Montréal', fr: 'Montréal' },
                currentConditions: {
                    temperature: { value: { en: 12.4, fr: 12.4 } },
                    dewpoint: { value: { en: 4.1, fr: 4.1 } },
                    relativeHumidity: { value: { en: 58, fr: 58 } },
                    wind: {
                        speed: { value: { en: 18, fr: 18 } },
                        gust: { value: { en: 32, fr: 32 } },
                        direction: { value: { en: 'SW', fr: 'SO' } },
                        bearing: { value: { en: 225, fr: 225 } }
                    },
                    pressure: {
                        value: { en: 101.6, fr: 101.6 },
                        tendency: { en: 'rising', fr: 'à la hausse' }
                    },
                    visibility: { value: { en: 24.1, fr: 24.1 } },
                    condition: { en: 'Partly Cloudy', fr: 'Partiellement nuageux' },
                    iconCode: { value: 2 }
                },
                forecastGroup: {
                    regionalNormals: {
                        temperature: [
                            { class: { en: 'high', fr: 'high' }, value: { en: 11, fr: 11 } },
                            { class: { en: 'low', fr: 'low' }, value: { en: 3, fr: 3 } }
                        ]
                    },
                    forecasts: [
                        {
                            period: { textForecastName: { en: 'Today', fr: "Aujourd'hui" } },
                            temperatures: { temperature: [{ class: { en: 'high', fr: 'high' }, value: { en: 14, fr: 14 } }] },
                            abbreviatedForecast: { icon: { value: 2 }, textSummary: { en: 'A mix of sun and cloud', fr: 'Alternance de soleil et de nuages' } },
                            textSummary: { en: 'A mix of sun and cloud. High 14.', fr: 'Alternance de soleil et de nuages. Maximum 14.' }
                        },
                        {
                            period: { textForecastName: { en: 'Tonight', fr: 'Ce soir et cette nuit' } },
                            temperatures: { temperature: [{ class: { en: 'low', fr: 'low' }, value: { en: 4, fr: 4 } }] },
                            abbreviatedForecast: { icon: { value: 32 }, textSummary: { en: 'Partly cloudy', fr: 'Partiellement nuageux' } },
                            textSummary: { en: 'Partly cloudy. Low plus 4.', fr: 'Partiellement nuageux. Minimum plus 4.' }
                        },
                        {
                            period: { textForecastName: { en: 'Saturday', fr: 'Samedi' } },
                            temperatures: { temperature: [{ class: { en: 'high', fr: 'high' }, value: { en: 11, fr: 11 } }] },
                            abbreviatedForecast: { icon: { value: 12 }, textSummary: { en: 'Showers', fr: 'Averses' } },
                            textSummary: { en: 'Showers. High 11.', fr: 'Averses. Maximum 11.' }
                        },
                        {
                            period: { textForecastName: { en: 'Saturday night', fr: 'Samedi soir et nuit' } },
                            temperatures: { temperature: [{ class: { en: 'low', fr: 'low' }, value: { en: 2, fr: 2 } }] },
                            abbreviatedForecast: { icon: { value: 32 }, textSummary: { en: 'Clearing', fr: 'Dégagement' } },
                            textSummary: { en: 'Clearing. Low plus 2.', fr: 'Dégagement. Minimum plus 2.' }
                        }
                    ]
                },
                hourlyForecastGroup: {
                    hourlyForecasts: Array.from({ length: 24 }, (_, idx) => ({
                        timestamp: new Date(Date.now() + idx * 3600000).toISOString(),
                        condition: { en: 'Sunny', fr: 'Ensoleillé' },
                        temperature: { value: { en: 10 + (idx % 5), fr: 10 + (idx % 5) } },
                        iconCode: { value: 1 },
                        lop: { value: { en: 10, fr: 10 } },
                        wind: {
                            speed: { value: { en: 15, fr: 15 } },
                            direction: { value: { en: 'SW', fr: 'SO' } }
                        }
                    }))
                },
                riseSet: {
                    sunrise: { en: '2026-10-23T11:21:00Z', fr: '2026-10-23T11:21:00Z' },
                    sunset: { en: '2026-10-23T21:55:00Z', fr: '2026-10-23T21:55:00Z' }
                }
            }
        };

        const myConfigJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'MYCONFIG.json'), 'utf8'));
        const jqElem = {
            text() { return jqElem; },
            html() { return jqElem; },
            fadeOut() { return jqElem; },
            fadeIn() { return jqElem; },
            css() { return jqElem; },
            addClass() { return jqElem; },
            removeClass() { return jqElem; },
            empty() { return jqElem; },
            append() { return jqElem; }
        };
        const mockJQuery = (arg) => {
            if (typeof arg === 'function') return jqElem;
            return jqElem;
        };
        mockJQuery.getJSON = (url, cb) => {
            requestedUrls.push(url);
            const p = {
                fail(failCb) {
                    if (url.includes('api.weather.com')) {
                        failCb({ status: 401 });
                    }
                    return p;
                }
            };
            if (url.includes('api.weather.com')) {
                throw new Error(`Unexpected call to throttled api.weather.com: ${url}`);
            }
            setImmediate(() => {
                if (url.includes('citypageweather-realtime')) {
                    cb(mockEcccFeature);
                } else if (url.includes('climate-daily')) {
                    cb({
                        features: [
                            { properties: { CLIMATE_IDENTIFIER: '7025251', LOCAL_DAY: 22, MAX_TEMPERATURE: 13.2, MIN_TEMPERATURE: 5.4, TOTAL_PRECIPITATION: 14.6 } }
                        ]
                    });
                } else if (url.includes('ltce-temperature')) {
                    cb({
                        features: [
                            { properties: { RECORD_HIGH_MAX_TEMP: 24.5, RECORD_HIGH_MAX_TEMP_YR: 1979, RECORD_LOW_MIN_TEMP: -4.2, RECORD_LOW_MIN_TEMP_YR: 1969 } }
                        ]
                    });
                } else if (url.includes('aqhi-')) {
                    cb({
                        features: [
                            { properties: { aqhi: 2 } }
                        ]
                    });
                } else if (url.includes('weather-alerts')) {
                    cb({ features: [] });
                } else {
                    cb({});
                }
            });
            return p;
        };

        const sandbox = {
            window: null,
            globalThis: null,
            console,
            setTimeout: () => 1,
            clearTimeout: () => {},
            setInterval: () => 1,
            clearInterval: () => {},
            onLocationInit: () => {},
            isMetric: () => true,
            getUnits: () => 'm',
            startAlertCrawl: () => {},
            Promise,
            Date,
            Math,
            Number,
            String,
            Object,
            Array,
            RegExp,
            JSON,
            isNaN,
            parseFloat,
            parseInt,
            $: mockJQuery,
            fetch: async (url) => {
                if (String(url).includes('/api/config')) {
                    return { ok: true, json: async () => myConfigJson };
                }
                return { ok: true, json: async () => ({ rules: [], version: 1 }) };
            },
            dateFns: {
                getHours: (d) => new Date(d).getHours(),
                format: () => '10',
                addMonths: (d) => d
            }
        };
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;

        vm.createContext(sandbox);
        vm.runInContext(extrasCode, sandbox);
        vm.runInContext(configCode, sandbox);
        vm.runInContext(newlocationCode, sandbox);
        vm.runInContext(weatherCode, sandbox);

        // 1. Verify ECCC station index and icon mapping
        assert.ok(Array.isArray(sandbox.ECCC_STATION_INDEX));
        assert.ok(sandbox.ECCC_STATION_INDEX.length > 800);
        const mtlStation = sandbox.resolveEcccStation(45.503, -73.573);
        assert.equal(mtlStation.id, 'qc-147');

        // 2. Verify grabLocation resolves without hitting api.weather.com
        await sandbox.grabLocation();
        assert.equal(sandbox.locationConfig.mainCity.lat, 45.503);
        assert.equal(sandbox.locationConfig.mainCity.lon, -73.573);
        assert.equal(sandbox.locationConfig.mainCity.state, 'QC');
        assert.ok(sandbox.locationConfig.eightCities.cities.length >= 8);

        // 3. Verify weather fetchers populate weatherInfo from ECCC
        await sandbox.grabCC();
        assert.equal(sandbox.weatherInfo.currentConditions.noReport, false);
        assert.equal(sandbox.weatherInfo.currentConditions.temp, 12);
        assert.equal(sandbox.weatherInfo.currentConditions.cond, 'Partiellement nuageux');

        await sandbox.grabLocalForecast();
        assert.equal(sandbox.weatherInfo.dayDesc.days.length, 4);
        assert.equal(sandbox.weatherInfo.dayDesc.days[0].name, "Aujourd'hui");
        assert.equal(sandbox.weatherInfo.dayDesc.days[1].name, 'Ce soir');
        assert.equal(sandbox.weatherInfo.weekAhead.days.length, 7);
        assert.equal(sandbox.weatherInfo.almanac.days.length, 2);

        await sandbox.grabDaypartForecast();
        assert.equal(sandbox.weatherInfo.daypartForecast.times.length, 4);

        await sandbox.grabOutdoorActivityData();
        assert.equal(sandbox.weatherInfo.outdoorActivity.noReport, false);

        await sandbox.grabNearbyCC();
        assert.equal(sandbox.weatherInfo.eightCities.cities.length, 8);
        assert.equal(sandbox.weatherInfo.eightCities.cities[0].temp, 12);

        await sandbox.grabQuebecCities();
        assert.ok(sandbox.weatherInfo.quebecCities.cities.length > 0);

        await sandbox.grabQuebecWeekAhead();
        assert.ok(sandbox.weatherInfo.quebecWeekAhead.cities.length > 0);
        assert.equal(sandbox.weatherInfo.quebecWeekAhead.cities[0].days.length, 7);

        await sandbox.grabRegionalForecasts();
        assert.ok(sandbox.weatherInfo.regionalForecasts.regions.length > 0);

        await sandbox.grabCanadaCities();
        assert.ok(sandbox.weatherInfo.canadaCities.cities.length > 0);

        await sandbox.grabResortCities();
        assert.ok(sandbox.weatherInfo.resortCities.cities.length > 0);

        await sandbox.grabMapCityData();
        assert.ok(sandbox.weatherInfo.map.mapCities.length > 0);

        await sandbox.grabAlmanac();
        assert.equal(sandbox.weatherInfo.almanac.average.high, 11);
        assert.equal(sandbox.weatherInfo.almanac.average.low, 3);
        assert.equal(sandbox.weatherInfo.almanac.record.high, 25);
        assert.equal(sandbox.weatherInfo.almanac.record.recordYearHigh, 1979);
        assert.equal(sandbox.weatherInfo.almanac.yesterday.high, 13);

        await sandbox.grabMonthlyPrecip();
        assert.equal(sandbox.weatherInfo.monthlyPrecip, '14.6');

        await sandbox.grabAirQuality();
        assert.equal(sandbox.weatherInfo.airQuality.categoryIndex, 1);
        assert.equal(sandbox.weatherInfo.airQuality.category, 'BON');

        await sandbox.grabAlerts();
        assert.ok(requestedUrls.every(u => !u.includes('api.weather.com')), 'Zero calls should be made to api.weather.com when ECCC is online');
    });
});
