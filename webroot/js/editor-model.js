/* Shared preset schema: browser editor, broadcast renderer and server validation. */
(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    else root.IntelliStarEditorModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const slides = [
        ['currentConditions', 'Current conditions', 'current-conditions'],
        ['nearbyCities', 'Nearby cities', 'eight-cities'],
        ['localForecast', 'Local forecast', 'local-forecast'],
        ['weekAhead', 'Week ahead', 'week-ahead'],
        ['quebecWeekAhead', 'Québec week ahead', 'quebec-week-ahead'],
        ['airQuality', 'Air quality', 'air-quality'], ['almanac', 'Almanac', 'almanac'],
        ['daypartForecast', 'Hourly forecast', 'daypart-forecast'],
        ['regionalForecast', 'Regional forecast', 'regional-forecast'],
        ['canadaForecast', 'Canadian cities', 'canada-forecast'],
        ['quebecCities', 'Québec cities', 'quebec-cities'],
        ['resortForecast', 'Resorts & ski', 'resort-forecast'],
        ['outdoorActivity', 'Outdoor activity', 'outdoor-activity'],
        ['bulletin', 'Weather bulletin', 'bulletin'],
        ['mapCurrent', 'Regional observations map', 'map'], ['mapForecast', 'Regional forecast map', 'map'],
        ['radarDoppler', 'Regional Doppler', 'radar'], ['canadaDoppler', 'Canada Doppler', 'radar'],
        ...Array.from({ length: 12 }, (_, i) => [i ? `localDoppler${i + 1}` : 'localDoppler', `Local Doppler ${i + 1}`, 'radar']),
        ['localDoppler1', 'Local Doppler 1', 'radar'],
        ...Array.from({ length: 12 }, (_, i) => [i ? `couvertureNuageuse${i + 1}` : 'couvertureNuageuse', `Couverture nuageuse ${i + 1}`, 'satellite']),
        ['couvertureNuageuse1', 'Couverture nuageuse 1', 'satellite'],
        ['canadaSatellite', 'Canada Satellite', 'satellite'],
        ['satellite', 'Satellite (Couverture)', 'satellite'],
        ['environmentCanada', 'Data attribution', 'environment-canada']
    ].map(([fn, label, className]) => ({ function: fn, label, className }));
    const sections = ['appearanceSettings', 'slideSettings', 'audioSettings', 'locationSettings', 'alertTestSettings'];
    const elementScopes = ['global', ...new Set(slides.map(slide => slide.className))];
    const locationKeys = ['fetchIntervalMinutes', 'mainCity', 'eightCities', 'mapCities', 'radarCities', 'regionalForecasts', 'canadaCities', 'quebecCities', 'resortCities', 'localDopplers'];
    const clone = value => JSON.parse(JSON.stringify(value));
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function merge(base, extra) {
        const result = clone(base || {});
        for (const [key, value] of Object.entries(extra || {})) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe configuration key');
            result[key] = object(value) && object(result[key]) ? merge(result[key], value) : clone(value);
        }
        return result;
    }
    function normalize(raw, defaults = {}) {
        const result = {};
        for (const section of sections) result[section] = merge(defaults[section] || {}, raw[section] || {});
        for (const key of locationKeys) if (raw[key] !== undefined) result.locationSettings[key] = clone(raw[key]);
        // Legacy root fields have the same precedence as newlocation.js.
        for (const section of ['appearanceSettings', 'slideSettings', 'audioSettings']) {
            for (const key of Object.keys(defaults[section] || {})) {
                if (key !== 'order' && raw[key] !== undefined) result[section][key] = clone(raw[key]);
            }
        }
        if (Array.isArray(raw.slideOrder)) result.slideSettings.order = clone(raw.slideOrder);
        else if (Array.isArray(raw.order) && object(raw.order[0])) result.slideSettings.order = clone(raw.order);
        if (Array.isArray(raw.audioOrder)) result.audioSettings.order = clone(raw.audioOrder);
        else if (Array.isArray(raw.order) && typeof raw.order[0] === 'string') result.audioSettings.order = clone(raw.order);
        return result;
    }
    const numberStyles = {
        left: [-20000, 20000, 'px'], top: [-20000, 20000, 'px'], width: [0, 10000, 'px'], height: [0, 10000, 'px'],
        fontSize: [1, 500, 'px'], lineHeight: [1, 600, 'px'], letterSpacing: [-20, 100, 'px'],
        opacity: [0, 1, ''], zIndex: [-100, 10000, ''], borderRadius: [0, 1000, 'px'],
        rotate: [-360, 360, 'deg']
    };
    const enums = {
        position: ['absolute', 'relative'], fontWeight: ['normal', 'bold', '400', '600', '700', '900'],
        textAlign: ['left', 'center', 'right'], display: ['none'],
        fontFamily: ['Interstate Bold', 'Interstate Black', 'Interstate Black Cn', 'Interstate Regular', 'Arial', 'sans-serif'],
        backgroundSize: ['contain', 'cover', '100% 100%'], backgroundRepeat: ['no-repeat', 'repeat']
    };
    function assetPath(value) {
        return typeof value === 'string' && /^images\/[a-zA-Z0-9_./ -]+\.(png|webp|jpg|jpeg|gif|svg|apng)$/i.test(value) && !value.includes('..');
    }
    function cssValue(key, value) {
        if (numberStyles[key]) {
            const [min, max, unit] = numberStyles[key];
            if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key} (${min}–${max})`);
            return `${value}${unit}`;
        }
        if (enums[key] && enums[key].includes(String(value))) return key === 'fontFamily' ? `"${value}"` : String(value);
        if (['color', 'backgroundColor'].includes(key) && /^(#[\da-f]{3,8}|transparent)$/i.test(value)) return value;
        if (key === 'backgroundImage' && assetPath(value)) return `url("${value}")`;
        throw new Error(`Unsupported style: ${key}`);
    }
    function selectorSafe(selector) {
        return typeof selector === 'string' && selector.length < 1200 && /^#main(?: > (?:\.[\w-]+|[a-z][a-z0-9-]*)(?:\.[\w-]+)*(?::nth-of-type\([1-9][0-9]*\))?)+$/.test(selector);
    }
    function validate(preset) {
        const fail = message => { throw new Error(message); };
        if (!object(preset) || preset.schemaVersion !== 1) fail('Unsupported preset version (expected 1)');
        if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 100) fail('Preset name must contain 1–100 characters');
        // Reject prototype pollution and credentials anywhere in a portable preset.
        function walk(value, depth = 0) {
            if (depth > 25) fail('Configuration is nested too deeply');
            if (typeof value === 'number' && !Number.isFinite(value)) fail('Numbers must be finite');
            if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
                if (/^(?:__proto__|constructor|prototype|api_?key|accessToken|refreshToken|clientSecret|password)$/i.test(key)) fail(`Disallowed key: ${key}`);
                walk(item, depth + 1);
            }
        }
        walk(preset);
        const config = preset.config;
        if (!object(config) || sections.some(key => !object(config[key]))) fail('Missing configuration sections');
        if (Object.keys(config).some(key => !sections.includes(key))) fail('Unknown configuration section');
        for (const [section, keys] of [
            ['slideSettings', ['auto', 'bulletin', 'precip', 'endAttribution']],
            ['audioSettings', ['enableMusic', 'shuffle', 'randomStart', 'narrations', 'vocallocal']],
            ['appearanceSettings', ['ldlVisible', 'smoothRadar']], ['alertTestSettings', ['enabled', 'includeCrawl']]
        ]) for (const key of keys) if (config[section][key] !== undefined && typeof config[section][key] !== 'boolean') fail(`${key} must be true or false`);
        for (const key of ['attributionDelay']) if (config.slideSettings[key] !== undefined && (!Number.isFinite(config.slideSettings[key]) || config.slideSettings[key] < 1000 || config.slideSettings[key] > 300000)) fail(`${key} must be 1000–300000 milliseconds`);
        if (!Array.isArray(config.appearanceSettings.marqueeAd) || config.appearanceSettings.marqueeAd.some(text => typeof text !== 'string')) fail('Marquee messages must be a list of strings');
        if (!Array.isArray(config.audioSettings.order) || config.audioSettings.order.some(text => typeof text !== 'string')) fail('Audio order must be a list of strings');
        const order = config.slideSettings.order;
        if (!Array.isArray(order) || !order.length || order.length > 200 || !order.some(s => s.enabled !== false)) fail('Enable at least one slide (maximum 200)');
        for (const slide of order) {
            if (!slides.some(s => s.function === slide.function) && slide.function !== 'localDoppler1' && slide.function !== 'couvertureNuageuse1') fail(`Unknown slide: ${slide.function}`);
            if (!Number.isFinite(slide.slideDelay) || slide.slideDelay < 1000 || slide.slideDelay > 300000) fail('Slide duration must be 1–300 seconds');
            if (slide.slides !== undefined && (!Number.isInteger(slide.slides) || slide.slides < 1 || slide.slides > 100)) fail('Page count must be 1–100');
        }
        const appearance = config.appearanceSettings;
        if (![2007, 2008, 2009, 2010, 2026].includes(Number(appearance.graphicsPackage))) fail('Unknown graphics package');
        if (!['2007', '2010', '2026'].includes(String(appearance.iconSet))) fail('Unknown icon set');
        if (!['auto', 'metric', 'imperial'].includes(appearance.units)) fail('Unknown unit system');
        const loc = config.locationSettings;
        for (const key of ['eightCities', 'mapCities', 'radarCities']) if (!object(loc[key])) fail(`${key} must be an object`);
        for (const list of [loc.eightCities.cities, loc.mapCities.map, loc.radarCities.local, loc.radarCities.regional, loc.regionalForecasts, loc.canadaCities, loc.quebecCities, loc.resortCities, loc.localDopplers]) {
            if (!Array.isArray(list) || list.length > 1000 || list.some(city => !object(city))) fail('City groups must contain at most 1000 location objects');
        }
        if (loc.fetchIntervalMinutes !== undefined && (!Number.isFinite(loc.fetchIntervalMinutes) || loc.fetchIntervalMinutes < 1)) fail('Weather refresh interval must be at least 1 minute');
        if (loc.mapCities.zoomScale !== undefined && (!Number.isFinite(loc.mapCities.zoomScale) || loc.mapCities.zoomScale <= 0 || loc.mapCities.zoomScale > 20)) fail('Map zoom scale must be greater than 0 and at most 20');
        if (loc.mapCities.citiesPerSlide !== undefined && (!Number.isInteger(loc.mapCities.citiesPerSlide) || loc.mapCities.citiesPerSlide < 1 || loc.mapCities.citiesPerSlide > 10)) fail('Map cities per slide must be 1–10');
        if (!object(loc.mainCity) || loc.mainCity.autoFind !== false || loc.mainCity.type !== 'geocode') fail('Main city requires manual geocode coordinates');
        function coordinate(lat, lon, name) {
            if (lat === '' || lon === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) fail(`Invalid latitude/longitude: ${name}`);
        }
        function checkCities(value, name) {
            if (!value || typeof value !== 'object') return;
            if (value.val !== undefined) {
                const parts = String(value.val).split(',').map(s => s.trim());
                if (parts.length !== 2) fail(`Expected lat,lon: ${name}`);
                coordinate(parts[0], parts[1], name);
            }
            if (value.lat !== undefined || value.lon !== undefined) coordinate(value.lat, value.lon, name);
            for (const [key, item] of Object.entries(value)) if (item && typeof item === 'object') checkCities(item, `${name}.${key}`);
        }
        if (typeof loc.mainCity.val !== 'string') fail('Main city requires lat,lon');
        checkCities(loc, 'locations');
        for (const key of ['musicVolume', 'vocalVolume', 'musicDuckedVolume']) {
            const value = config.audioSettings[key];
            if (value !== undefined && (typeof value !== 'number' || value < 0 || value > 2)) fail(`${key} must be 0–2`);
        }
        if (!object(preset.layout) || Object.keys(preset.layout).length > 2000) fail('Invalid layout (maximum 2000 elements)');
        for (const [selector, entry] of Object.entries(preset.layout)) {
            if (!selectorSafe(selector) || !object(entry) || !object(entry.style)) fail(`Invalid layout selector: ${selector}`);
            for (const [key, value] of Object.entries(entry.style)) cssValue(key, value);
            if (entry.text !== undefined && (typeof entry.text !== 'string' || entry.text.length > 4000)) fail('Text overrides must be strings under 4000 characters');
        }
        if (preset.elements !== undefined) {
            if (!Array.isArray(preset.elements) || preset.elements.length > 200) fail('Maximum 200 custom layers');
            const ids = new Set();
            for (const element of preset.elements) {
                if (!object(element) || !/^layer-[a-zA-Z0-9-]{1,80}$/.test(element.id) || ids.has(element.id) || !elementScopes.includes(element.scope) || !['text', 'image', 'panel'].includes(element.kind)) fail('Invalid custom layer');
                ids.add(element.id);
            }
        }
        return preset;
    }
    function customSelector(element) {
        return `#main${element.scope === 'global' ? '' : ` > .slides > .${element.scope}`} > .studio-layer.${element.id}`;
    }
    function mountElements(main, elements) {
        main.querySelectorAll('.studio-layer').forEach(node => node.remove());
        for (const element of elements || []) {
            if (!elementScopes.includes(element.scope) || !/^layer-[a-zA-Z0-9-]{1,80}$/.test(element.id)) continue;
            const parent = element.scope === 'global' ? main : main.querySelector(`.slides > .${element.scope}`);
            if (!parent) continue;
            const node = main.ownerDocument.createElement('div'); node.className = `studio-layer ${element.id}`;
            parent.append(node);
        }
    }
    function layoutCSS(layout) {
        return Object.entries(layout || {}).filter(([selector]) => selectorSafe(selector)).map(([selector, entry]) => {
            const rules = Object.entries(entry.style || {}).map(([key, value]) => {
                const property = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
                return `${property}:${cssValue(key, value)} !important;`;
            });
            return `${selector}{${rules.join('')}}`;
        }).join('\n');
    }
    // Use class paths instead of global nth-child positions: editor and live DOM agree.
    function elementSelector(element) {
        const parts = [];
        while (element && element.id !== 'main') {
            const classes = [...element.classList].filter(c => /^[\w-]+$/.test(c) && !c.startsWith('editor-'));
            let part = classes.length ? `.${classes.join('.')}` : element.tagName.toLowerCase();
            const siblings = element.parentElement ? [...element.parentElement.children].filter(e => e.tagName === element.tagName) : [];
            if (siblings.filter(sibling => sibling.matches(part)).length > 1) part += `:nth-of-type(${siblings.indexOf(element) + 1})`;
            parts.unshift(part);
            element = element.parentElement;
        }
        return element ? `#main > ${parts.join(' > ')}` : null;
    }
    return { slides, sections, locationKeys, clone, merge, normalize, validate, numberStyles, enums, assetPath, cssValue, selectorSafe, layoutCSS, elementSelector, customSelector, mountElements };
});