'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Visual and Presentation Improvements (Pictures 1-5)', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const indexHtmlPath = path.join(rootDir, 'webroot', 'index.html');
    const previewHtmlPath = path.join(rootDir, 'webroot', 'preview.html');
    const weatherJsPath = path.join(rootDir, 'webroot', 'js', 'weather.js');
    const ldlJsPath = path.join(rootDir, 'webroot', 'js', 'ldl.js');
    const slidesJsPath = path.join(rootDir, 'webroot', 'js', 'slides.js');
    const css2026Path = path.join(rootDir, 'webroot', 'css', 'intellistar-32-2026.css');
    const css2009Path = path.join(rootDir, 'webroot', 'css', 'intellistar-32-2009.css');
    const css2008Path = path.join(rootDir, 'webroot', 'css', 'intellistar-32-2008.css');
    const css2007Path = path.join(rootDir, 'webroot', 'css', 'intellistar-32-2007.css');

    await t.test('Picture 1: Neige au sol banner does not duplicate header text', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const previewHtml = fs.readFileSync(previewHtmlPath, 'utf8');

        // Check that .banner in snow-cover is empty to prevent duplicate text overlay
        assert.match(indexHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="banner"><\/div>/);
        assert.doesNotMatch(indexHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="banner">NEIGE AU SOL<\/div>/);

        assert.match(previewHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="banner"><\/div>/);
        assert.doesNotMatch(previewHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="banner">NEIGE AU SOL<\/div>/);

        // Header still contains the title
        assert.match(indexHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="header"[^>]*>NEIGE AU SOL<\/div>/);
        assert.match(previewHtml, /<div class="snow-cover[^>]*>[\s\S]*?<div class="header"[^>]*>NEIGE AU SOL<\/div>/);
    });

    await t.test('Picture 2: Single update timestamp matching clock style', () => {
        const weatherJs = fs.readFileSync(weatherJsPath, 'utf8');
        const css2026 = fs.readFileSync(css2026Path, 'utf8');

        // Check formatClockTimestamp exists and produces 12-hour AM/PM format without seconds
        assert.ok(weatherJs.includes('function formatClockTimestamp('));
        assert.ok(weatherJs.includes('Mise à jour |'));

        // Ensure updateLastUpdatedIndicator doesn't produce 3 separate timestamps
        assert.doesNotMatch(weatherJs, /Prévisions \$\{formatUpdateTimestamp\(forecastTime\)\}/);
        assert.doesNotMatch(weatherJs, /Alertes \$\{formatUpdateTimestamp\(alertsTime\)\}/);
        assert.doesNotMatch(weatherJs, /Radar \$\{formatUpdateTimestamp\(radarTime\)\}/);

        // CSS styling matches clock font and cyan ampm
        assert.match(css2026, /\.data-updated\s+\.time-val/);
        assert.match(css2026, /\.data-updated\s+\.ampm/);
        assert.ok(css2026.includes('#38bdf8'), 'Clock AM/PM cyan color is applied to .data-updated .ampm');
    });

    await t.test('Picture 3: LDL observation metrics show 2 lines simultaneously', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const previewHtml = fs.readFileSync(previewHtmlPath, 'utf8');
        const ldlJs = fs.readFileSync(ldlJsPath, 'utf8');
        const css2026 = fs.readFileSync(css2026Path, 'utf8');

        // Check HTML contains row-1 and row-2
        assert.match(indexHtml, /<div class="metrics-row row-1">/);
        assert.match(indexHtml, /<div class="metrics-row row-2">/);
        assert.match(previewHtml, /<div class="metrics-row row-1">/);
        assert.match(previewHtml, /<div class="metrics-row row-2">/);

        // Check ldl.js implements renderAllMetrics and does not run slide timeout rotation
        assert.ok(ldlJs.includes('renderAllMetrics('));
        assert.doesNotMatch(ldlJs, /metricSlideTimeout = setTimeout/);

        // Check CSS defines 2-row layout
        assert.match(css2026, /\.ldl-blue\s+\.observations\s+\.obs-metrics/);
        assert.match(css2026, /\.ldl-blue\s+\.observations\s+\.metrics-row/);
    });

    await t.test('Picture 4: French accent police type vertical clipping resolved', () => {
        const css2026 = fs.readFileSync(css2026Path, 'utf8');
        const ldlJs = fs.readFileSync(ldlJsPath, 'utf8');

        // Line-height and padding prevent clipping of accents like Î, É, etc.
        assert.match(css2026, /\.ldl-blue\s+\.observations\s+\.city-name[\s\S]*?line-height:\s*1\.35/);
        assert.match(css2026, /\.ldl-blue\s+\.observations\s+\.city-name[\s\S]*?padding-top:\s*4px/);
        assert.ok(ldlJs.includes('"line-height": "1.35"'), 'ldl.js sets line-height to 1.35 during font fit calculations');
    });

    await t.test('Picture 5: Almanac slide has sunrise and sunset/moonset icons', () => {
        const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        const previewHtml = fs.readFileSync(previewHtmlPath, 'utf8');
        const slidesJs = fs.readFileSync(slidesJsPath, 'utf8');
        const css2026 = fs.readFileSync(css2026Path, 'utf8');
        const css2009 = fs.readFileSync(css2009Path, 'utf8');
        const css2008 = fs.readFileSync(css2008Path, 'utf8');
        const css2007 = fs.readFileSync(css2007Path, 'utf8');

        // HTML containers
        assert.match(indexHtml, /<div class="sunrise-icon"[^>]*><\/div>/);
        assert.match(indexHtml, /<div class="sunset-icon"[^>]*><\/div>/);
        assert.match(previewHtml, /<div class="sunrise-icon"[^>]*><\/div>/);
        assert.match(previewHtml, /<div class="sunset-icon"[^>]*><\/div>/);

        // slides.js wires icons (Sun: 3200, Moon: 3100)
        assert.match(slidesJs, /getIcon\(\$\('\.almanac \.sunrise-icon'\),\s*3200,\s*'forecast'\)/);
        assert.match(slidesJs, /getIcon\(\$\('\.almanac \.sunset-icon'\),\s*3100,\s*'forecast'\)/);

        // CSS positioning across themes
        for (const [name, css] of [
            ['2026', css2026],
            ['2009', css2009],
            ['2008', css2008],
            ['2007', css2007]
        ]) {
            assert.match(css, /\.almanac\s+\.sunrise-icon/, `${name} CSS must position .sunrise-icon`);
            assert.match(css, /\.almanac\s+\.sunset-icon/, `${name} CSS must position .sunset-icon`);
        }
    });
});
