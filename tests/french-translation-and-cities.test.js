'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

function getTranslator() {
    const weatherJsPath = path.join(__dirname, '..', 'webroot', 'js', 'weather.js');
    const code = fs.readFileSync(weatherJsPath, 'utf8');
    const context = {
        window: {},
        location: { search: '' },
        weatherInfo: { bulletin: {} },
        $: () => {},
        translateWindCardinal: function(cardinal) {
            if (!cardinal) return '';
            const c = String(cardinal).trim().toUpperCase();
            const map = {
                'CALM': 'Calme', 'VAR': 'Variable', 'VARIABLE': 'Variable',
                'N': 'N', 'S': 'S', 'E': 'E', 'W': 'O',
                'NE': 'NE', 'NW': 'NO', 'SE': 'SE', 'SW': 'SO',
                'NNE': 'NNE', 'NNW': 'NNO', 'ENE': 'ENE', 'ESE': 'ESE',
                'SSE': 'SSE', 'SSW': 'SSO', 'WNW': 'ONO', 'WSW': 'OSO'
            };
            return map[c] !== undefined ? map[c] : c;
        }
    };
    context.window = context;
    const snippet = code.substring(
        code.indexOf('var RAW_WEATHER_PHRASES = ['),
        code.indexOf('window.translateWeatherNarrative = translateWeatherNarrative;') + 60
    );
    const fn = new Function('window', 'location', 'weatherInfo', '$', 'translateWindCardinal', `${snippet}; return translateWeatherNarrative;`);
    return fn(context.window, context.location, context.weatherInfo, context.$, context.translateWindCardinal);
}

test('translates weather narratives without leaving English developing or connectors', () => {
    const translate = getTranslator();

    // 1. User screenshot narrative
    const inputScreenshot = 'Cloudy with rain developing later in the day. High 21C. Winds SSE at 10 to 15 km/h. Chance of rain 100%. Rainfall near 6mm.';
    const translatedScreenshot = translate(inputScreenshot);
    assert.equal(
        translatedScreenshot,
        'Nuageux avec pluie se développant plus tard en journée. Max 21. Vents SSE de 10 à 15 km/h. Probabilité de pluie 100%. Accumulation de pluie près de 6 mm.'
    );
    assert.ok(!translatedScreenshot.includes('developing'));

    // 2. Other developing combinations
    assert.equal(
        translate('Partly cloudy with isolated thunderstorms developing later in the day'),
        'Partiellement nuageux avec orages isolés se développant plus tard en journée'
    );
    assert.equal(
        translate('Cloudy with rain developing after midnight'),
        'Nuageux avec pluie se développant après minuit'
    );
    assert.equal(
        translate('Sunny with gusty winds developing this afternoon'),
        'Ensoleillé avec rafales de vent se développant cet après-midi'
    );

    // 3. Otherwise, under, and periods
    assert.equal(
        translate('A few clouds early, otherwise mostly sunny'),
        'Quelques nuages tôt, sinon généralement ensoleillé'
    );
    assert.equal(
        translate('A few passing clouds, otherwise generally clear'),
        'Quelques nuages passagers, sinon généralement dégagé'
    );
    assert.equal(
        translate('Periods of light rain this afternoon'),
        'Périodes de pluie légère cet après-midi'
    );
    assert.equal(
        translate('Mostly sunny skies under partly cloudy skies'),
        'Ciel généralement ensoleillé sous un ciel partiellement nuageux'
    );
});

test('2026 and main CSS allow long city names to wrap into 2 lines', async () => {
    const cssPath2026 = path.join(__dirname, '..', 'webroot', 'css', 'intellistar-32-2026.css');
    const css2026 = fs.readFileSync(cssPath2026, 'utf8');
    assert.ok(css2026.includes('-webkit-line-clamp: 2 !important;'));
    assert.ok(css2026.includes('white-space: normal !important;'));
    assert.ok(css2026.includes('overflow-wrap: break-word !important;'));

    const cssPathMain = path.join(__dirname, '..', 'webroot', 'main.css');
    const mainCss = fs.readFileSync(cssPathMain, 'utf8');
    assert.ok(mainCss.includes('-webkit-line-clamp: 2;'));
    assert.ok(mainCss.includes('overflow-wrap: break-word;'));

    // Render in headless browser to verify multi-line layout and no overflow
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>${mainCss}</style>
            <style>${css2026}</style>
        </head>
        <body style="background: #020617;">
            <div id="main">
                <div class="slides">
                    <div class="quebec-cities" style="display: block;">
                        <div class="information" style="display: block;">
                            <div class="qc-loc i" style="display: block;">
                                <div class="region-name">MONTÉRÉGIE</div>
                                <div class="city-name">Saint-Jean-sur-Richelieu</div>
                                <div class="temp">22°</div>
                                <div class="high-low">H 23°  L 11°</div>
                                <div class="icon"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
        await page.setContent(html);

        const metrics = await page.$eval('.city-name', el => {
            const r = el.getBoundingClientRect();
            return {
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                height: r.height
            };
        });

        // 2 lines: clientHeight should be > 50px and scrollHeight == clientHeight (no overflow)
        assert.ok(metrics.clientHeight > 50, `Expected 2 lines (height > 50px), got ${metrics.clientHeight}`);
        assert.equal(metrics.scrollHeight, metrics.clientHeight, 'No vertical overflow on 2 lines');
        assert.equal(metrics.scrollWidth, metrics.clientWidth, 'No horizontal overflow');
    } finally {
        await browser.close();
    }
});

function getAlertHelpers() {
    const weatherJsPath = path.join(__dirname, '..', 'webroot', 'js', 'weather.js');
    const code = fs.readFileSync(weatherJsPath, 'utf8');
    const targetEnd = "window.translateAlertText = translateAlertText;";
    const snippet = code.substring(
        code.indexOf("var ALERT_NAME_FR_MAP = {"),
        code.indexOf(targetEnd) + targetEnd.length
    );
    const translateNarrative = getTranslator();
    const fn = new Function("window", "translateWeatherNarrative", `${snippet}; return { getAlertDisplayNameFr, translateAlertHeadline, formatAreaNameFr, translateAlertText };`);
    return fn({}, translateNarrative);
}

test('translates frost and freeze warnings to Avis de gel and translates warning descriptions to French', () => {
    const { getAlertDisplayNameFr, translateAlertHeadline, formatAreaNameFr, translateAlertText } = getAlertHelpers();

    // 1. Alert display name mappings
    assert.equal(getAlertDisplayNameFr("Avis jaune - Gelée"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Avis jaune - Gel"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Avis de gelée"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Yellow Advisory - Frost"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Freeze Warning"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Frost Advisory"), "Avis de gel");
    assert.equal(getAlertDisplayNameFr("Hard Freeze Warning"), "Avis de gel dur");
    assert.equal(getAlertDisplayNameFr("Freeze Watch"), "Veille de gel");
    assert.equal(getAlertDisplayNameFr("Frost Watch"), "Veille de gel");

    // 2. Alert headlines translation
    assert.equal(
        translateAlertHeadline("Avis jaune - Gelée de MER. 15:12 HAE à JEU. 10:00 HAE"),
        "Avis de gel de MER. 15:12 HAE à JEU. 10:00 HAE"
    );
    assert.equal(
        translateAlertHeadline("Yellow Advisory - Frost from WED 3:12 PM EDT until THU 10:00 AM EDT"),
        "Avis de gel de MER. 15h12 HAE à JEU. 10h00 HAE"
    );
    assert.equal(
        translateAlertHeadline("Freeze Warning in effect until THU 8:00 AM EDT"),
        "Avis de gel en vigueur à JEU. 8h00 HAE"
    );

    // 3. Area name formatting
    assert.equal(formatAreaNameFr("Gatineau"), "Gatineau");
    assert.equal(formatAreaNameFr("Sherbrooke area"), "Sherbrooke");
    assert.equal(formatAreaNameFr("the Montreal area"), "Montreal");

    // 4. Alert description text translation
    const rawAlertDesc = "Patchy frost will return Thursday morning. Frost may return to some areas Friday morning.";
    const translatedDesc = translateAlertText(rawAlertDesc);
    assert.equal(
        translatedDesc,
        "Du gel par endroits sera de retour jeudi matin. Le gel pourrait être de retour dans certains secteurs vendredi matin."
    );
    assert.ok(!translatedDesc.toLowerCase().includes("frost"));
    assert.ok(!translatedDesc.toLowerCase().includes("return"));

    const rawSherbrookeDesc = "Temperatures near or below zero with frost are forecast overnight tonight.";
    const translatedSherbrooke = translateAlertText(rawSherbrookeDesc);
    assert.equal(
        translatedSherbrooke,
        "Des températures près ou sous zéro avec du gel sont prévues la nuit prochaine."
    );

    // 5. Alert instruction and boilerplate text translation
    const rawInstructions = "Damage to plants, trees, and crops is possible. Please continue to monitor alerts and forecasts issued by Environment Canada. Take preventative measures to protect cold-sensitive plants, trees, and crops. Cover up plants, especially those in frost-prone areas.";
    const translatedInstructions = translateAlertText(rawInstructions);
    assert.ok(translatedInstructions.includes("Des dommages aux plantes, aux arbres et aux cultures sont possibles."));
    assert.ok(translatedInstructions.includes("Veuillez continuer à surveiller les alertes et prévisions émises par Environnement Canada."));
    assert.ok(translatedInstructions.includes("Prenez des mesures préventives pour protéger les plantes, arbres et cultures sensibles au froid."));
    assert.ok(translatedInstructions.includes("Couvrez les plantes, particulièrement dans les zones propices au gel."));
});

test('LDL alert crawl includes city name in both the header and ticker text', () => {
    const ldlJsPath = path.join(__dirname, '..', 'webroot', 'js', 'ldl.js');
    const ldlCode = fs.readFileSync(ldlJsPath, 'utf8');

    // Verify LDL bar extracts city and formats header with city name
    assert.ok(ldlCode.includes('var city = alertObj.cityName'));
    assert.ok(ldlCode.includes('headerName = `${displayName} — ${headerCity.toUpperCase()}`;'));
    assert.ok(ldlCode.includes('fullCrawl = `${cityUpper} : ${crawlDesc}`;'));
    assert.ok(ldlCode.includes('rotateNextAlertCrawl'));
});


