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
