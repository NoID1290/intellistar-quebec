const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const radarJs = require('../webroot/js/radar.js');

test('Alert Map engine exports required functions', () => {
    assert.equal(typeof radarJs.startAlertMap, 'function');
    assert.equal(typeof radarJs.stopAlertMap, 'function');
    assert.equal(typeof radarJs.addAlertMapCities, 'function');
    assert.equal(typeof radarJs.getAlertColorTheme, 'function');
});

test('Alert Map getAlertColorTheme maps alert types to proper visual theme colors', () => {
    // 1. Heat Warning (Avertissement de chaleur) -> vibrant pink/magenta as in broadcast screenshot
    const heatTheme = radarJs.getAlertColorTheme({ name: "Avertissement de chaleur", type: "Heat Warning" });
    assert.equal(heatTheme.swatch, '#ff1493');
    assert.ok(heatTheme.fill.includes('233, 30, 99'));
    assert.equal(heatTheme.stroke, '#ff4081');

    // 2. Severe Thunderstorm (Orages violents) -> emergency red
    const severeTheme = radarJs.getAlertColorTheme({ name: "Avertissement d'orages violents", color: "red", severe: true });
    assert.equal(severeTheme.swatch, '#ef4444');
    assert.equal(severeTheme.stroke, '#ff1744');

    // 3. Wind Warning (Vent) -> vivid orange
    const windTheme = radarJs.getAlertColorTheme({ name: "Avertissement de vent", color: "orange" });
    assert.equal(windTheme.swatch, '#f97316');
    assert.equal(windTheme.stroke, '#ff6d00');

    // 4. Winter Storm (Tempête hivernale) -> purple / ice pink
    const winterTheme = radarJs.getAlertColorTheme({ name: "Avertissement de tempête hivernale" });
    assert.equal(winterTheme.swatch, '#ec4899');

    // 5. Yellow Watch (Surveillance / Veille) -> yellow
    const watchTheme = radarJs.getAlertColorTheme({ name: "Veille météorologique", color: "yellow", severe: false });
    assert.equal(watchTheme.swatch, '#eab308');
    assert.equal(watchTheme.stroke, '#ffd600');
});

test('Alert Map slide markup exists in index.html and preview.html', () => {
    const indexPath = path.join(__dirname, '..', 'webroot', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    assert.ok(indexHtml.includes('class="bulletin-map"'));
    assert.ok(indexHtml.includes('id="alertmap-canvas"'));
    assert.ok(indexHtml.includes('class="alertmap-banner"'));
    assert.ok(indexHtml.includes('class="alertmap-icon-box"'));
    assert.ok(indexHtml.includes('class="alertmap-title"'));
    assert.ok(indexHtml.includes('class="alertmap-subtitle"'));
    assert.ok(indexHtml.includes('class="alertmap-status-blocks"'));
    assert.ok(indexHtml.includes('class="alertmap-subbar"'));
    assert.ok(indexHtml.includes('class="alertmap-eccc-logo"'));
    assert.ok(indexHtml.includes('class="alertmap-legend"'));
    assert.ok(indexHtml.includes('class="alertmap-legend-color"'));
    assert.ok(indexHtml.includes('class="alertmap-legend-text"'));
    assert.ok(indexHtml.includes('class="alertmap-cities"'));
    assert.ok(indexHtml.includes('class="alertmap-cities-trans"'));

    const previewPath = path.join(__dirname, '..', 'webroot', 'preview.html');
    const previewHtml = fs.readFileSync(previewPath, 'utf8');

    assert.ok(previewHtml.includes('class="bulletin-map"'));
    assert.ok(previewHtml.includes('id="alertmap-canvas"'));
    assert.ok(previewHtml.includes('id: "bulletin-map"'));
    assert.ok(previewHtml.includes('startAlertMap'));
});

test('CSS styles for bulletin-map exist across 2026, 2007, 2008, and 2009 stylesheets', () => {
    const css2026Path = path.join(__dirname, '..', 'webroot', 'css', 'intellistar-32-2026.css');
    const css2026 = fs.readFileSync(css2026Path, 'utf8');

    assert.ok(css2026.includes('.bulletin-map'));
    assert.ok(css2026.includes('.alertmap-canvas'));
    assert.ok(css2026.includes('.alertmap-banner'));
    assert.ok(css2026.includes('.alertmap-icon-box'));
    assert.ok(css2026.includes('.alertmap-status-blocks'));
    assert.ok(css2026.includes('.alertmap-subbar'));
    assert.ok(css2026.includes('.alertmap-legend'));

    for (const year of ['2007', '2008', '2009']) {
        const cssYearPath = path.join(__dirname, '..', 'webroot', 'css', `intellistar-32-${year}.css`);
        const cssContent = fs.readFileSync(cssYearPath, 'utf8');
        assert.ok(cssContent.includes('.bulletin-map'), `Missing .bulletin-map in ${year} CSS`);
        assert.ok(cssContent.includes('.alertmap-banner'), `Missing .alertmap-banner in ${year} CSS`);
        assert.ok(cssContent.includes('.alertmap-legend'), `Missing .alertmap-legend in ${year} CSS`);
    }
});

test('slides.js and editor-model.js register bulletinMap in slides catalog', () => {
    const slidesJsPath = path.join(__dirname, '..', 'webroot', 'js', 'slides.js');
    const slidesCode = fs.readFileSync(slidesJsPath, 'utf8');

    assert.ok(slidesCode.includes('"bulletinMap": ".bulletin-map"'));
    assert.ok(slidesCode.includes('bulletinMap()'));

    const editorModelPath = path.join(__dirname, '..', 'webroot', 'js', 'editor-model.js');
    const editorModelCode = fs.readFileSync(editorModelPath, 'utf8');

    assert.ok(editorModelCode.includes("['bulletinMap', 'Alert regions map', 'bulletin-map']"));
});

test('weather.js includes geometry retrieval in grabAlertsEccc and generates polygons for test bulletin', () => {
    const weatherJsPath = path.join(__dirname, '..', 'webroot', 'js', 'weather.js');
    const weatherCode = fs.readFileSync(weatherJsPath, 'utf8');

    assert.ok(!weatherCode.includes('&skipGeometry=true'), 'Should not skip geometry in GeoMet queries');
    assert.ok(weatherCode.includes('generateSectorPolygon'));
    assert.ok(weatherCode.includes('buildTestBulletinAlert'));
});

test('Alert Map bakeAlertBasemap does not use World_Boundaries_and_Places tile layer', () => {
    const radarCode = fs.readFileSync(path.join(__dirname, '..', 'webroot', 'js', 'radar.js'), 'utf8');
    assert.ok(!radarCode.includes('Reference/World_Boundaries_and_Places'), 'Should not load World_Boundaries_and_Places which adds duplicate city text and US/NB labels');
    assert.ok(typeof radarJs.radarEngine.drawQuebecBoundary === 'function', 'drawQuebecBoundary should be a function');
});

test('Alert Map extractWarningRegions identifies distinct Quebec active regions and ideal zoom', () => {
    assert.equal(typeof radarJs.extractWarningRegions, 'function');
    assert.equal(typeof radarJs.getAlertRegionsCount, 'function');

    const multiAlerts = [
        {
            name: "Avertissement d'orages violents",
            cityName: "Montréal",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-73.8, 45.4],
                    [-73.4, 45.4],
                    [-73.4, 45.7],
                    [-73.8, 45.7],
                    [-73.8, 45.4]
                ]]
            }
        },
        {
            name: "Avertissement de vent",
            cityName: "Sherbrooke",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-72.1, 45.3],
                    [-71.7, 45.3],
                    [-71.7, 45.6],
                    [-72.1, 45.6],
                    [-72.1, 45.3]
                ]]
            }
        },
        {
            name: "Avertissement jaune - Onde de tempête",
            cityName: "Québec",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-71.4, 46.7],
                    [-71.0, 46.7],
                    [-71.0, 47.0],
                    [-71.4, 47.0],
                    [-71.4, 46.7]
                ]]
            }
        }
    ];

    const regions = radarJs.extractWarningRegions(multiAlerts, { lon: -73.573, lat: 45.503 });
    assert.equal(regions.length, 3, 'Should extract 3 distinct warning regions in Quebec');
    assert.equal(radarJs.getAlertRegionsCount(multiAlerts), 3);

    // Verify all regions are in Quebec and have close-up zoom (>= 8.3)
    for (const r of regions) {
        assert.ok(r.lat >= 45.0 && r.lat <= 48.0, `Lat ${r.lat} should be in Quebec`);
        assert.ok(r.lon >= -75.0 && r.lon <= -70.0, `Lon ${r.lon} should be in Quebec`);
        assert.ok(r.zoom >= 8.3, `Zoom ${r.zoom} should be close-up detail for warning area`);
    }

    // Verify region 0 is around Montreal
    assert.ok(Math.abs(regions[0].lon - (-73.6)) < 0.3);
    assert.ok(Math.abs(regions[0].lat - 45.55) < 0.3);

    // Verify region 1 is around Sherbrooke
    assert.ok(Math.abs(regions[1].lon - (-71.9)) < 0.3);
    assert.ok(Math.abs(regions[1].lat - 45.45) < 0.3);

    // Verify region 2 is around Quebec City
    assert.ok(Math.abs(regions[2].lon - (-71.2)) < 0.3);
    assert.ok(Math.abs(regions[2].lat - 46.85) < 0.3);
});

test('Alert Map Quebec boundary coordinates file exists and is valid GeoJSON MultiPolygon', () => {
    const qcBnd = require('../webroot/js/quebec-boundary.js');
    assert.ok(Array.isArray(qcBnd), 'Quebec boundary must be an array of polygon rings');
    assert.ok(qcBnd.length >= 1, 'Should contain polygon rings');
    const mainPoly = qcBnd[qcBnd.length - 1];
    assert.ok(Array.isArray(mainPoly) && mainPoly[0].length > 100, 'Main Quebec land ring should have high resolution coordinates');
});

test('Alert Map extractWarningRegions accurately sequences multi-alert scenarios (Storm Surge + Rain Warning)', () => {
    const alerts = [
        {
            name: "Avertissement jaune - Onde de tempête",
            cityName: "Québec",
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-71.35, 46.72],
                    [-71.05, 46.72],
                    [-71.05, 47.02],
                    [-71.35, 47.02],
                    [-71.35, 46.72]
                ]]
            }
        },
        {
            name: "Avertissement jaune - Pluie",
            cityName: "Montréal",
            geometries: [
                {
                    type: "Polygon",
                    coordinates: [[
                        [-73.8, 45.4],
                        [-73.5, 45.4],
                        [-73.5, 45.7],
                        [-73.8, 45.7],
                        [-73.8, 45.4]
                    ]]
                },
                {
                    type: "Polygon",
                    coordinates: [[
                        [-73.9, 45.5],
                        [-73.6, 45.5],
                        [-73.6, 45.8],
                        [-73.9, 45.8],
                        [-73.9, 45.5]
                    ]]
                }
            ]
        }
    ];

    const regions = radarJs.extractWarningRegions(alerts, { lon: -73.573, lat: 45.503 });
    assert.equal(regions.length, 2, 'Should extract exactly 2 distinct alert regions for the 2 active alerts');

    // Primary region 0 should be Storm Surge at Quebec City
    assert.equal(regions[0].alert.name, "Avertissement jaune - Onde de tempête");
    assert.ok(Math.abs(regions[0].lon - (-71.2)) < 0.3);
    assert.ok(Math.abs(regions[0].lat - 46.87) < 0.3);

    // Primary region 1 should be Rain Warning around Montreal
    assert.equal(regions[1].alert.name, "Avertissement jaune - Pluie");
    assert.ok(Math.abs(regions[1].lon - (-73.7)) < 0.3);
    assert.ok(Math.abs(regions[1].lat - 45.6) < 0.3);
});

test('Alert Map updateAlertMapUI dynamically updates legend pill, banner title, and subtitle', () => {
    assert.equal(typeof radarJs.updateAlertMapUI, 'function');

    // Mock jQuery DOM elements
    const dom = {
        title: '',
        subtitle: '',
        legendText: '',
        legendColor: {},
        iconBox: {}
    };

    global.$ = (selector) => {
        return {
            text(val) {
                if (val !== undefined) {
                    if (selector === '.alertmap-title') dom.title = val;
                    if (selector === '.alertmap-subtitle') dom.subtitle = val;
                    if (selector === '.alertmap-legend-text') dom.legendText = val;
                    return this;
                }
                if (selector === '.alertmap-title') return dom.title;
                if (selector === '.alertmap-subtitle') return dom.subtitle;
                if (selector === '.alertmap-legend-text') return dom.legendText;
                return '';
            },
            css(styles) {
                if (selector === '.alertmap-legend-color') Object.assign(dom.legendColor, styles);
                if (selector === '.alertmap-icon-box') Object.assign(dom.iconBox, styles);
                return this;
            },
            empty() {
                return this;
            },
            append() {
                return this;
            }
        };
    };

    // 1. Test updating to Storm Surge warning in Québec
    const surgeAlert = {
        name: "Avertissement jaune - Onde de tempête",
        color: "yellow",
        severe: false
    };
    radarJs.updateAlertMapUI(surgeAlert, "Québec");

    assert.equal(dom.title, "SURVEILLANCE ET AVERTISSEMENTS");
    assert.equal(dom.subtitle, "Secteur : Québec");
    assert.equal(dom.legendText, "Avertissement jaune - Onde de tempête");
    assert.ok(dom.legendColor['background-color'], 'Should set legend color swatch');

    // 2. Test updating dynamically to Rain warning in Montréal
    const rainAlert = {
        name: "Avertissement jaune - Pluie",
        color: "yellow",
        severe: false
    };
    radarJs.updateAlertMapUI(rainAlert, "Montréal");

    assert.equal(dom.subtitle, "Secteur : Montréal");
    assert.equal(dom.legendText, "Avertissement jaune - Pluie");

    // 3. Test updating dynamically to Severe Thunderstorm in Laval
    const severeAlert = {
        name: "Avertissement d'orages violents",
        color: "red",
        severe: true
    };
    radarJs.updateAlertMapUI(severeAlert, "Laval");

    assert.equal(dom.title, "AVERTISSEMENTS EN VIGUEUR");
    assert.equal(dom.subtitle, "Secteur : Laval");
    assert.equal(dom.legendText, "Avertissement d'orages violents");
    assert.ok(dom.iconBox.background.includes('#ef4444') || dom.iconBox.background.includes('#dc2626'));
});

test('Alert Map renderAlertMapSector renders static sectors and startAlertMap handles professional transitions', async () => {
    const mockContext = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        closePath: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} })
    };
    const mockCanvas = {
        id: 'test-canvas',
        getContext: () => mockContext,
        width: 1620,
        height: 1080
    };

    global.document = {
        getElementById: () => mockCanvas,
        querySelector: () => null
    };

    const alerts = [
        {
            name: "Avertissement jaune - Onde de tempête",
            cityName: "Québec",
            geometry: {
                type: "Polygon",
                coordinates: [[[-71.3, 46.7], [-71.1, 46.7], [-71.1, 47.0], [-71.3, 47.0], [-71.3, 46.7]]]
            }
        },
        {
            name: "Avertissement jaune - Pluie",
            cityName: "Montréal, Laval, Longueuil",
            geometry: {
                type: "Polygon",
                coordinates: [[[-73.8, 45.4], [-73.5, 45.4], [-73.5, 45.7], [-73.8, 45.7], [-73.8, 45.4]]]
            }
        }
    ];

    // 1. Verify renderAlertMapSector renders crisp sector without RAF loop
    assert.equal(typeof radarJs.renderAlertMapSector, 'function', 'renderAlertMapSector must be exported');
    const region = radarJs.renderAlertMapSector('test-canvas', null, alerts);
    assert.ok(region, 'Should return active rendered sector');
    assert.ok(region.lon && region.lat, 'Sector must have center coordinates');

    // 2. Verify startAlertMap initializes professional slide transition cleanly
    await radarJs.startAlertMap('test-canvas', alerts, 10000);
    assert.doesNotThrow(() => {
        radarJs.stopAlertMap();
    }, 'stopAlertMap should cleanly cancel timers');
});
