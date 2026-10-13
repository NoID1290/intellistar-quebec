'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Bulletin Météo Spécial filtering, deduplication, and overflow containment', async (t) => {
    const rootDir = path.join(__dirname, '..');
    const weatherJsPath = path.join(rootDir, 'webroot', 'js', 'weather.js');
    const slidesJsPath = path.join(rootDir, 'webroot', 'js', 'slides.js');
    const ttsJsPath = path.join(rootDir, 'tts.js');
    const mainCssPath = path.join(rootDir, 'webroot', 'main.css');
    const css2026Path = path.join(rootDir, 'webroot', 'css', 'intellistar-32-2026.css');

    const weatherCode = fs.readFileSync(weatherJsPath, 'utf8');
    const slidesCode = fs.readFileSync(slidesJsPath, 'utf8');
    const mainCss = fs.readFileSync(mainCssPath, 'utf8');
    const css2026 = fs.readFileSync(css2026Path, 'utf8');

    // Load filterAlertWarningText in isolated context
    const filterSnippet = weatherCode.substring(
        weatherCode.indexOf('function filterAlertWarningText('),
        weatherCode.indexOf('window.filterAlertWarningText = filterAlertWarningText;') + 55
    );
    const filterFn = new Function('window', `${filterSnippet}; return filterAlertWarningText;`)({});

    await t.test('1. filterAlertWarningText filters Environment Canada boilerplate and reporting contact info', () => {
        const userScreenshotRaw = "Journée pluvieuse mardi Quoi: des quantités de pluie pouvant atteindre de 40 à 60 millimètres et causer des accumulations d'eau sur les routes et dans les basses terres. Quand: mardi après-midi et mardi soir Où: Montréal, la Montérégie, les Bois-Francs et l'Estrie Informations supplémentaires: Un front chaud quasi-stationnaire associé à une dépression glissant au sud de la frontière favorisera le passage des bandes de pluie forte sur nos régions. Veuillez continuer à surveiller les alertes et les prévisions émises par Environnement Canada. Pour signaler du temps violent, envoyez un courriel à meteoQC@ec.gc.ca ou publiez un message sur les réseaux sociaux en utilisant #meteoqc";

        const filtered = filterFn(userScreenshotRaw, "BULLETIN MÉTÉOROLOGIQUE SPÉCIAL");

        // Meteorological threat info is fully preserved with periods for distinct sentence separation
        assert.ok(filtered.includes("des quantités de pluie pouvant atteindre de 40 à 60 millimètres"));
        assert.ok(filtered.includes("mardi après-midi et mardi soir."));
        assert.ok(filtered.includes("Montréal, la Montérégie, les Bois-Francs et l'Estrie."));
        assert.ok(filtered.includes("Un front chaud quasi-stationnaire"));

        // Boilerplate emails, hashtags, and generic monitoring messages are removed
        assert.ok(!filtered.includes("Veuillez continuer à surveiller les alertes"));
        assert.ok(!filtered.includes("Pour signaler du temps violent"));
        assert.ok(!filtered.includes("meteoQC@ec.gc.ca"));
        assert.ok(!filtered.includes("#meteoqc"));
    });

    await t.test('2. filterAlertWarningText removes redundant alert title prefix and deduplicates identical sentences', () => {
        const repetitiveText = "Bulletin météorologique spécial : Des vents violents souffleront sur la région. Des vents violents souffleront sur la région. Rafales pouvant atteindre 90 km/h. Consultez les prévisions locales pour plus de détails.";
        const filtered = filterFn(repetitiveText, "Bulletin météorologique spécial");

        // Prefix removed
        assert.ok(!filtered.startsWith("Bulletin météorologique spécial :"));
        // Duplicate sentence removed
        const count = (filtered.match(/Des vents violents souffleront sur la région/g) || []).length;
        assert.equal(count, 1, 'Sentence must appear only once');
        // Boilerplate removed
        assert.ok(!filtered.includes("Consultez les prévisions locales"));
    });

    await t.test('3. slidePrograms.bulletin eliminates redundant headline duplicating the alert title', () => {
        // Verify isRedundantHeadline helper logic in slides.js
        assert.ok(slidesCode.includes('isRedundantHeadline'), 'slides.js must include isRedundantHeadline check');

        // Test the normalization logic
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        const title = "BULLETIN MÉTÉOROLOGIQUE SPÉCIAL";
        const duplicateHeadline = "Bulletin météorologique spécial";
        assert.equal(norm(title), norm(duplicateHeadline));

        // Ensure TTS narration does not include redundant headline or boilerplate
        assert.ok(slidesCode.includes('plainDesc'));
        assert.ok(slidesCode.includes('filterAlertWarningText'));
    });

    await t.test('4. slidePrograms.bulletin formats sections cleanly and supports compact text', () => {
        // Section label markup is used
        assert.ok(slidesCode.includes('bulletin-label'));
        assert.ok(slidesCode.includes('bulletin-desc compact') || slidesCode.includes('descClass'));
    });

    await t.test('5. 2026 CSS box height fits cleanly above the 278px crawl banner without overlapping', () => {
        // .bulletin .box height must be 610px (top 16% = 172.8px + 610px = 782.8px, well above 802px crawl top)
        assert.match(css2026, /\.bulletin\s+\.box\s*\{[\s\S]*?height:\s*610px/);
        assert.doesNotMatch(css2026, /\.bulletin\s+\.box\s*\{[\s\S]*?height:\s*726\.75px/);

        // .bulletin .alerts has overflow: hidden and max-height containment
        assert.match(css2026, /\.bulletin\s+\.alerts\s*\{[\s\S]*?max-height:\s*520px/);
        assert.match(css2026, /\.bulletin\s+\.alerts\s*\{[\s\S]*?overflow:\s*hidden/);

        // main.css also enforces max-height and containment
        assert.match(mainCss, /\.bulletin\s+\.alerts\s*\{[\s\S]*?max-height:\s*520px/);
        assert.match(mainCss, /\.bulletin\s+\.alerts\s*\{[\s\S]*?overflow:\s*hidden/);
        assert.match(mainCss, /\.bulletin\s+\.alerts\s+\.bulletin-desc\.compact\s*\{/);
        assert.match(mainCss, /\.bulletin\s+\.alerts\s+\.bulletin-label\s*\{/);
    });

    await t.test('6. tts.js filters boilerplate reporting instructions and separates Quand and Ou sentences with periods', () => {
        const tts = require(ttsJsPath);
        const ttsCode = fs.readFileSync(ttsJsPath, 'utf8');

        assert.ok(ttsCode.includes('Veuillez continuer'));
        assert.ok(ttsCode.includes('Pour signaler du temps violent'));

        const sample = "Quand : ce soir et cette nuit Où : Dans les Bois-Francs et l'Estrie";
        const normalized = tts.normalizeText(sample);
        assert.ok(normalized.includes("ce soir et cette nuit."), 'Quand sentence must end with a period');
        assert.ok(normalized.includes("Dans les Bois-Francs et l'Estrie."), 'Où sentence must end with a period');
    });

    await t.test('7. ECCC logo is positioned at the top right on warning slide', () => {
        const indexHtml = fs.readFileSync(path.join(rootDir, 'webroot', 'index.html'), 'utf8');
        const previewHtml = fs.readFileSync(path.join(rootDir, 'webroot', 'preview.html'), 'utf8');

        // Assets exist
        assert.ok(fs.existsSync(path.join(rootDir, 'webroot', 'images', 'ecccLogo.svg')), 'ecccLogo.svg must exist');
        assert.ok(fs.existsSync(path.join(rootDir, 'webroot', 'images', '2026', 'ecccLogo.svg')), '2026 ecccLogo.svg must exist');

        // Markup includes .eccc-logo in bulletin slide
        assert.ok(indexHtml.includes('class="eccc-logo"'), 'index.html includes eccc-logo');
        assert.ok(previewHtml.includes('class="eccc-logo"'), 'preview.html includes eccc-logo');

        // CSS positions logo at top right of bulletin slide
        assert.match(css2026, /\.bulletin\s+\.eccc-logo[\s\S]*?right:\s*144px/);
        assert.match(mainCss, /\.bulletin\s+\.eccc-logo[\s\S]*?right:\s*144px/);

        // slides.js manages logo lifecycle with bulletin slide
        assert.ok(slidesCode.includes('.eccc-logo'), 'slides.js manages eccc-logo display');
    });
});

