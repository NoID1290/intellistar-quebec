/* IntelliStar Studio. No weather requests or broadcast commands until explicit Apply. */
'use strict';
(() => {
    const M = window.IntelliStarEditorModel;
    const $ = selector => document.querySelector(selector);
    const clone = M.clone;
    let preset, savedSnapshot = '', tab = 'slides', selectedSlide = 0, selected = null;
    let frameDocument, fixtureDocument, template, scale = 1, undoStack = [], redoStack = [];
    let playing = false, playTimer, state = { presets: [] }, busy = false, pageIndex = 0;
    const groups = [
        ['mainCity', 'Main city'], ['eightCities.cities', 'Nearby cities'], ['regionalForecasts', 'Regional forecasts'],
        ['canadaCities', 'Canadian cities'], ['quebecCities', 'Québec cities'], ['resortCities', 'Resorts & ski'],
        ['mapCities.map', 'Regional map cities'], ['radarCities.local', 'Local radar labels'],
        ['radarCities.regional', 'Regional radar labels'], ['localDopplers', 'Local Doppler areas']
    ];
    let cityGroup = 'mainCity';
    const get = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
    const set = (obj, path, value) => {
        const keys = path.split('.'); const last = keys.pop();
        const parent = keys.reduce((item, key) => item[key] ??= {}, obj); parent[last] = value;
    };
    function el(tag, attrs = {}, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else if (key === 'class') node.className = value;
            else if (value !== undefined && value !== null) node.setAttribute(key, value);
        }
        for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        return node;
    }
    function button(text, action, className = '', title = '') { return el('button', { type: 'button', class: className, onclick: action, title }, text); }
    function note(text) { return el('p', { class: 'note' }, text); }
    function notify(message, error = false) {
        $('#status').textContent = message; $('#status').classList.toggle('error', error); $('#status').style.display = 'block';
        clearTimeout(notify.timer); if (!error) notify.timer = setTimeout(() => $('#status').style.display = 'none', 5000);
    }
    async function api(url, method = 'GET', body) {
        const response = await fetch(`/api/editor${url}`, { method, cache: 'no-store', ...(method !== 'GET' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) } : {}) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Server returned ${response.status}. Restart the IntelliStar server to enable Studio.`);
        return data;
    }
    async function guarded(action) {
        if (busy) return;
        busy = true; updateStatus();
        try { return await action(); } catch (error) { notify(error.message, true); }
        finally { busy = false; updateStatus(); }
    }
    const snapshot = () => JSON.stringify(preset);
    const dirty = () => preset && snapshot() !== savedSnapshot;
    function checkpoint() { undoStack.push(snapshot()); if (undoStack.length > 100) undoStack.shift(); redoStack = []; }
    function change(action, redraw = true) {
        checkpoint(); action(); updateStatus();
        if (redraw) render(); else { refreshCanvas(); renderInspector(); }
    }
    function updateStatus() {
        $('#dirty-state').textContent = busy ? 'Working…' : dirty() ? '● Unsaved changes' : preset?.id ? '✓ Saved' : 'Loaded · not saved';
        $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
        for (const id of ['save', 'save-as', 'publish']) $(`#${id}`).disabled = busy || !preset;
        if (preset) {
            const order = preset.config.slideSettings.order;
            $('#sequence-summary').textContent = `${order.filter(s => s.enabled !== false).length} enabled · ${Math.round(order.filter(s => s.enabled !== false).reduce((sum, s) => sum + s.slideDelay * (s.slides || 1), 0) / 1000)}s nominal`;
        }
    }
    function history(from, to) {
        if (!from.length) return;
        const identity = { id: preset.id, updatedAt: preset.updatedAt };
        to.push(snapshot()); preset = { ...JSON.parse(from.pop()), ...identity }; selected = null;
        $('#preset-name').value = preset.name; render(); updateStatus();
    }
    function confirmDiscard() { return !dirty() || confirm('Discard unsaved changes in this workspace?'); }
    function loadPreset(value, clean = true) {
        stopPreview(); preset = clone(value); selected = null; selectedSlide = 0; pageIndex = 0;
        undoStack = []; redoStack = []; savedSnapshot = clean ? snapshot() : '';
        $('#preset-name').value = preset.name; render(); updateStatus();
    }
    function field(label, value, commit, options = {}) {
        const input = options.choices ? el('select', {}, options.choices.map(item => el('option', { value: Array.isArray(item) ? item[0] : item }, Array.isArray(item) ? item[1] : item))) : el(options.multiline ? 'textarea' : 'input', { type: options.type || (typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'text'), step: options.step ?? 'any', min: options.min, max: options.max });
        if (typeof value === 'boolean') input.checked = value; else input.value = value ?? '';
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => {
            let next = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
            if (input.type === 'number' && (!input.value.trim() || !Number.isFinite(next) || !input.checkValidity())) { input.reportValidity(); input.value = value ?? ''; return; }
            commit(next);
        });
        const labelNode = el('label', { class: 'field' }, el('span', {}, label), input);
        if (options.help) labelNode.append(el('small', {}, options.help));
        return labelNode;
    }
    const descriptor = () => M.slides.find(s => s.function === preset.config.slideSettings.order[selectedSlide]?.function) || M.slides[0];
    function render() {
        if (!preset) return;
        const order = preset.config.slideSettings.order;
        selectedSlide = Math.max(0, Math.min(selectedSlide, order.length - 1));
        renderNav(); renderFilmstrip(); refreshCanvas(); renderInspector(); renderLayers(); updateStatus();
    }
    function renderNav() {
        const panel = $('#nav-content'); panel.replaceChildren();
        if (tab === 'slides') renderSlides(panel);
        if (tab === 'cities') renderCities(panel);
        if (tab === 'settings') renderSettings(panel);
        if (tab === 'presets') renderPresets(panel);
    }
    function selectSlide(index) {
        selectedSlide = index; selected = null; pageIndex = 0; render();
    }
    function renderSlides(panel) {
        panel.append(el('h3', {}, 'Broadcast sequence'), note('Drag cards to reorder. Layout changes apply to every occurrence of that slide type. Weather and city names remain data-driven unless explicitly pinned.'));
        const order = preset.config.slideSettings.order;
        if (preset.config.slideSettings.auto) panel.append(note('Automatic flavor is enabled: the broadcast chooses a sequence instead of using this list.'), button('Use this sequence', () => change(() => preset.config.slideSettings.auto = false)));
        const addSelect = el('select', { 'aria-label': 'Slide to add' }, M.slides.map(s => el('option', { value: s.function }, s.label)));
        panel.append(el('div', { class: 'field' }, addSelect, button('+ Add slide', () => change(() => {
            order.push({ function: addSelect.value, slideDelay: 8000, enabled: true }); selectedSlide = order.length - 1; selected = null;
        }))));
        order.forEach((slide, i) => {
            const info = M.slides.find(s => s.function === slide.function);
            const row = el('div', { class: `slide-row ${i === selectedSlide ? 'active' : ''} ${slide.enabled === false ? 'disabled' : ''}`, draggable: 'true', onclick: () => selectSlide(i) });
            row.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(i)));
            row.addEventListener('dragover', event => event.preventDefault());
            row.addEventListener('drop', event => {
                event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain'));
                if (Number.isInteger(from) && from >= 0 && from < order.length) change(() => { order.splice(i, 0, order.splice(from, 1)[0]); selectedSlide = i; });
            });
            const enabled = el('input', { type: 'checkbox', 'aria-label': `Enable ${info?.label || slide.function}`, onclick: event => event.stopPropagation(), onchange: () => change(() => slide.enabled = enabled.checked) }); enabled.checked = slide.enabled !== false;
            row.append(el('div', { class: 'slide-row-top' }, el('small', {}, String(i + 1).padStart(2, '0')), el('strong', {}, info?.label || slide.function), enabled));
            if (i === selectedSlide) {
                const controls = el('div', { onclick: event => event.stopPropagation() });
                controls.append(el('div', { class: 'field-row' }, field('Seconds / page', slide.slideDelay / 1000, v => change(() => slide.slideDelay = v * 1000), { min: 1, max: 300 }), field('Pages', slide.slides || 1, v => change(() => slide.slides = v), { min: 1, max: 100, step: 1 })));
                controls.append(el('div', { class: 'row-controls' },
                    button('↑', () => { if (i) change(() => { [order[i - 1], order[i]] = [order[i], order[i - 1]]; selectedSlide--; }); }, '', 'Move up'),
                    button('↓', () => { if (i < order.length - 1) change(() => { [order[i + 1], order[i]] = [order[i], order[i + 1]]; selectedSlide++; }); }, '', 'Move down'),
                    button('Copy', () => change(() => { order.splice(i + 1, 0, clone(slide)); selectedSlide++; })),
                    button('Remove', () => { if (order.length > 1) change(() => { order.splice(i, 1); selected = null; }); else notify('Keep at least one slide.', true); }, 'danger')));
                row.append(controls);
            }
            panel.append(row);
        });
        panel.append(note('Page counts are used by the existing slide programs; some city slides derive pages from list length. The 6-second attribution at cycle end is separate. Radar/satellite imagery is generated at playback, not rendered live in this canvas.'));
    }
    function renderFilmstrip() {
        $('#slide-title').textContent = descriptor().label;
        $('#filmstrip').replaceChildren(...preset.config.slideSettings.order.map((slide, i) => {
            const info = M.slides.find(s => s.function === slide.function);
            const node = button('', () => selectSlide(i), i === selectedSlide ? 'active' : '');
            node.append(`${String(i + 1).padStart(2, '0')} / ${info?.label || slide.function}`, el('small', {}, `${slide.slideDelay / 1000}s × ${slide.slides || 1}${slide.enabled === false ? ' · OFF' : ''}`)); return node;
        }));
    }
    function newCity(path) {
        const main = preset.config.locationSettings.mainCity;
        const [lat, lon] = main.val.split(',').map(Number);
        if (path === 'eightCities.cities') return { displayname: 'New city', type: 'geocode', val: main.val };
        if (path === 'regionalForecasts') return { name: 'Region', city: 'New city', type: 'geocode', val: main.val };
        if (path === 'canadaCities') return { name: 'New city', province: 'Province', val: main.val };
        if (['quebecCities', 'resortCities'].includes(path)) return { name: 'New city', region: 'Region', val: main.val };
        if (path === 'mapCities.map') return { name: 'New city', lat, lon, left: 810 - (preset.config.locationSettings.mapCities.leftPos || 0), top: 500 - (preset.config.locationSettings.mapCities.topPos || 0) };
        if (path === 'localDopplers') return { name: 'New radar area', lat, lon, zoom: 9.8 };
        return { name: 'New city', lat, lon };
    }
    function renderCities(panel) {
        const loc = preset.config.locationSettings;
        panel.append(el('h3', {}, 'Location directory'), field('City group', cityGroup, value => { cityGroup = value; renderNav(); }, { choices: groups }));
        const value = get(loc, cityGroup);
        panel.append(note('Coordinates use latitude,longitude (e.g. 45.503,-73.573). Reordering a city list changes its broadcast order. Fields below edit real weather locations, not sample temperatures.'));
        if (cityGroup === 'mainCity') {
            panel.append(field('Display name', loc.mainCity.displayname, v => change(() => loc.mainCity.displayname = v)), field('Extra name', loc.mainCity.extraname, v => change(() => loc.mainCity.extraname = v)), field('Latitude, longitude', loc.mainCity.val, v => change(() => { loc.mainCity.val = v; loc.mainCity.type = 'geocode'; loc.mainCity.autoFind = false; })));
        } else {
            const list = Array.isArray(value) ? value : [];
            panel.append(button('+ Add location', () => change(() => { if (!Array.isArray(value)) set(loc, cityGroup, list); list.push(newCity(cityGroup)); })));
            list.forEach((city, i) => {
                const card = el('details', { class: 'section-card' }, el('summary', {}, `${i + 1}. ${city.displayname || city.city || city.name || 'Location'}`));
                if (list.length < 3) card.open = true;
                card.append(el('div', { class: 'actions' }, button('↑', () => { if (i) change(() => [list[i - 1], list[i]] = [list[i], list[i - 1]]); }), button('↓', () => { if (i < list.length - 1) change(() => [list[i], list[i + 1]] = [list[i + 1], list[i]]); }), button('Copy', () => change(() => list.splice(i + 1, 0, clone(city)))), button('Delete', () => change(() => list.splice(i, 1)), 'danger')));
                appendObjectFields(card, city, `locationSettings.${cityGroup}.${i}`, true); panel.append(card);
            });
        }
        if (cityGroup === 'mapCities.map') {
            panel.append(el('h3', {}, 'Map framing'));
            for (const key of ['leftPos', 'topPos', 'zoomScale', 'citiesPerSlide', 'autoFind']) panel.append(field(key, loc.mapCities[key] ?? (key === 'autoFind' ? false : key === 'zoomScale' ? 1 : 10), v => change(() => loc.mapCities[key] = v)));
            panel.append(note('Select a map city group on the canvas and drag it to save its map coordinates. Use preview page to reach later city pages.'));
        }
    }
    function appendObjectFields(panel, object, path, open = false) {
        Object.entries(object).forEach(([key, value]) => {
            if (key === 'order' && path === 'slideSettings') return;
            const fullPath = `${path}.${key}`;
            if (value !== null && typeof value === 'object') {
                const details = el('details', { class: 'section-card' }, el('summary', {}, `${key}${Array.isArray(value) ? ` (${value.length})` : ''}`));
                if (open && !Array.isArray(value)) details.open = true;
                if (Array.isArray(value)) {
                    value.forEach((item, i) => {
                        const block = el('details', { class: 'section-card' }, el('summary', {}, `${i + 1}. ${typeof item === 'object' ? item.name || item.displayname || item.city || 'Entry' : item}`));
                        block.append(el('div', { class: 'actions' }, button('↑', () => { if (i) change(() => [value[i - 1], value[i]] = [value[i], value[i - 1]]); }), button('↓', () => { if (i + 1 < value.length) change(() => [value[i + 1], value[i]] = [value[i], value[i + 1]]); }), button('Delete', () => change(() => value.splice(i, 1)), 'danger')));
                        if (item && typeof item === 'object') appendObjectFields(block, item, `${fullPath}.${i}`);
                        else block.append(field('Value', item, v => change(() => value[i] = v, false)));
                        details.append(block);
                    });
                    details.append(button('+ Add entry', () => change(() => value.push(value.length ? clone(value[value.length - 1]) : ''))));
                } else appendObjectFields(details, value, fullPath);
                panel.append(details);
            } else {
                const choices = { graphicsPackage: [2026, 2009, 2008, 2007, 2010], iconSet: ['2026', '2010', '2007'], units: ['metric', 'imperial', 'auto'], source: ['local', 'spotify'], ldlType: ['observations', 'both'] }[key];
                panel.append(field(key, value, v => change(() => set(preset.config, fullPath, typeof value === 'number' ? Number(v) : v), false), { choices, multiline: typeof value === 'string' && value.length > 100 }));
            }
        });
    }
    function renderSettings(panel) {
        panel.append(el('h3', {}, 'Broadcast configuration'), note('Every field in the current configuration is available below. Location groups also have a dedicated Cities tab. Spotify credentials remain outside portable presets.'));
        for (const section of M.sections) {
            const details = el('details', { class: 'section-card' }, el('summary', {}, section.replace('Settings', '').replace(/^./, c => c.toUpperCase())));
            if (section === 'appearanceSettings') details.open = true;
            appendObjectFields(details, preset.config[section], section); panel.append(details);
        }
        panel.append(button('Advanced JSON…', openJSON), button('Export preset JSON', exportPreset));
    }
    function renderPresets(panel) {
        panel.append(el('h3', {}, 'Preset library'), note('Saved on the IntelliStar server, not just in this browser. Saving does not publish. Applying a preset reloads connected viewers; the original configuration is preserved.'));
        panel.append(el('div', { class: 'actions' }, button('Import JSON', () => $('#import-file').click()), button('Export JSON', exportPreset), button('Refresh', () => guarded(async () => { state = await api('/state'); renderNav(); }))));
        panel.append(button('New from current broadcast', () => guarded(async () => { if (confirmDiscard()) loadPreset(await api('/current')); })));
        for (const item of state.presets) {
            const card = el('div', { class: 'preset-card' }, el('strong', {}, item.name, item.id === state.activeId ? el('span', { class: 'active-badge' }, '● ON AIR') : null), el('small', {}, new Date(item.updatedAt).toLocaleString()));
            card.append(el('div', { class: 'actions' }, button('Open', () => guarded(async () => { if (confirmDiscard()) loadPreset(await api(`/presets/${item.id}`)); })), button('Duplicate', () => guarded(async () => {
                if (!confirmDiscard()) return; const copy = await api(`/presets/${item.id}`); delete copy.id; delete copy.updatedAt; copy.name += ' copy'; loadPreset(copy, false);
            })), button('Delete', () => guarded(async () => {
                if (!confirm(`Delete “${item.name}”?`)) return;
                await api(`/presets/${item.id}`, 'DELETE');
                if (preset.id === item.id) { delete preset.id; delete preset.updatedAt; savedSnapshot = ''; }
                state = await api('/state'); renderNav(); notify('Preset deleted.');
            }), 'danger'))); panel.append(card);
        }
        if (!state.presets.length) panel.append(el('p', { class: 'empty' }, 'No saved presets yet. Name this workspace and select Save preset.'));
        panel.append(el('h3', {}, 'Original configuration'), button('Restore base broadcast', () => guarded(async () => {
            if (!confirm('Restore the original configuration and reload connected viewers? Unsaved editor changes are kept.')) return;
            await api('/restore', 'POST'); state = await api('/state'); renderNav(); notify('Base configuration restored. Connected viewers will reload.');
        }), 'danger'));
    }
    async function save(asNew = false) {
        const input = clone(preset);
        if (asNew) {
            const name = prompt('Name for the new preset', `${input.name} copy`); if (name === null) return null;
            input.name = name; delete input.id; delete input.updatedAt;
        }
        M.validate(input);
        const before = snapshot();
        const result = await api(input.id ? `/presets/${input.id}` : '/presets', input.id ? 'PUT' : 'POST', input);
        // Preserve edits made while a save request is in flight.
        if (snapshot() === before) { preset = result; savedSnapshot = snapshot(); $('#preset-name').value = preset.name; }
        else { preset.id = result.id; preset.updatedAt = result.updatedAt; savedSnapshot = JSON.stringify(result); }
        state = await api('/state'); renderNav(); updateStatus(); notify('Preset saved to the server.'); return result;
    }
    function openJSON() { $('#json-source').value = JSON.stringify(preset, null, 2); $('#json-dialog').showModal(); }
    function exportPreset() {
        try {
            M.validate(preset); const value = clone(preset); delete value.id; delete value.updatedAt;
            const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
            const link = el('a', { href: url, download: `${preset.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}.json` }); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { notify(error.message, true); }
    }

    // Build a script-free canvas from index.html: selectors match the real broadcast.
    async function buildCanvas() {
        const [source, samples] = await Promise.all(['index.html', 'preview.html'].map(async url => {
            const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`Could not load ${url}`); return response.text();
        }));
        const parser = new DOMParser(); const live = parser.parseFromString(source, 'text/html'); fixtureDocument = parser.parseFromString(samples, 'text/html');
        template = live.querySelector('#main');
        template.querySelectorAll('script').forEach(node => node.remove());
        template.querySelectorAll('*').forEach(node => [...node.attributes].filter(a => a.name.startsWith('on')).forEach(a => node.removeAttribute(a.name)));
        // Keep hidden siblings so structural selectors also match the broadcast.
        const iframe = $('#canvas');
        await new Promise(resolve => {
            iframe.addEventListener('load', resolve, { once: true });
            iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="main.css"><link id="canvas-theme" rel="stylesheet" href="css/intellistar-32-2026.css"><style>html,body{margin:0!important;width:1620px!important;height:1080px!important;overflow:hidden!important;background:#020617!important}#main{position:absolute!important;top:0!important;left:0!important;transform:none!important;width:1620px!important;height:1080px!important}#main *{animation:none!important;transition:none!important;cursor:crosshair;user-select:none}#main .editor-radar-placeholder{position:absolute;inset:220px 120px 260px;border:2px dashed #36cafa;color:#c4e7ff;font:32px Arial;display:grid;place-content:center;background:radial-gradient(ellipse,#153855,#071525);text-align:center}</style><style id="editor-layout"></style></head><body></body></html>';
        });
        frameDocument = iframe.contentDocument;
        // The broadcast intentionally disables pointer events; Studio must restore them.
        const interactionStyle = frameDocument.createElement('style');
        interactionStyle.textContent = '#main, #main * { pointer-events: auto !important; }';
        frameDocument.head.append(interactionStyle);
        frameDocument.addEventListener('pointerdown', startDrag);
        frameDocument.addEventListener('keydown', keyboard);
    }
    function seedSamples(main) {
        for (const node of main.querySelectorAll('*')) {
            if (node.classList.contains('icon')) node.style.backgroundImage = 'url(images/icons/2026/large/Sun.webp)';
            if (node.children.length) continue;
            const path = M.elementSelector(node)?.replace(/:nth-of-type\(\d+\)/g, '');
            const sample = path && fixtureDocument.querySelector(path);
            if (sample && !sample.children.length && sample.textContent.trim()) node.textContent = sample.textContent;
            if (!node.textContent.trim() && /^(temp|tempobs|high|low)$/.test(node.className)) node.textContent = node.className === 'low' ? '16°' : '24°';
            if (!node.textContent.trim() && node.classList.contains('cond')) node.textContent = 'Ensoleillé';
            if (sample && node.classList.contains('icon')) node.style.backgroundImage = sample.style.backgroundImage;
        }
    }
    function fillCities(main) {
        const loc = preset.config.locationSettings;
        main.querySelectorAll('.slides > div > .city-name, .ldl-blue .city-name, .ldl-black .city-name').forEach(node => node.textContent = loc.mainCity.displayname);
        const bindings = [
            ['.eight-cities .extra-loc', loc.eightCities?.cities, ['.name', 'displayname']],
            ['.regional-forecast .region-loc', loc.regionalForecasts, ['.city-name', 'city'], ['.reg-name', 'name']],
            ['.canada-forecast .canada-loc', loc.canadaCities, ['.city-name', 'name'], ['.province', 'province']],
            ['.quebec-cities .qc-loc', loc.quebecCities, ['.city-name', 'name'], ['.region-name', 'region']],
            ['.resort-forecast .resort-loc', loc.resortCities, ['.resort-name', 'name'], ['.resort-region', 'region']]
        ];
        for (const [selector, cities, ...fields] of bindings) {
            const nodes = [...main.querySelectorAll(selector)];
            nodes.forEach((node, i) => {
                const city = cities?.[pageIndex * nodes.length + i]; node.style.display = city ? '' : 'none';
                if (city) for (const [query, key] of fields) { const text = node.querySelector(query); if (text) text.textContent = city[key] || ''; }
            });
        }
        const map = loc.mapCities || {}; const perPage = Math.min(10, Number(map.citiesPerSlide) || 10);
        for (const selector of ['.map-regional', '.map-cities']) {
            const node = main.querySelector(selector);
            if (node) { node.style.left = `${map.leftPos || 0}px`; node.style.top = `${map.topPos || 0}px`; node.style.transformOrigin = '0 0'; node.style.transform = `scale(${Number(map.zoomScale) || 1})`; }
        }
        main.querySelectorAll('.map .city').forEach((node, i) => {
            const city = map.map?.[pageIndex * perPage + i]; node.style.display = city && i < perPage ? 'block' : 'none';
            if (city) { node.style.left = `${city.left}px`; node.style.top = `${city.top}px`; node.querySelector('.city-name').textContent = city.name; node.dataset.mapIndex = String(pageIndex * perPage + i); }
        });
        const quebecTitle = main.querySelector('.quebec-week-ahead > .city-name'); if (quebecTitle) quebecTitle.textContent = loc.quebecCities?.[pageIndex]?.name || loc.mainCity.displayname;
    }
    function refreshCanvas() {
        if (!frameDocument || !preset) return;
        const main = template.cloneNode(true); seedSamples(main);
        const activeClass = descriptor().className;
        for (const slide of main.querySelectorAll('.slides > div')) {
            const active = slide.classList.contains(activeClass); slide.style.display = active ? 'block' : 'none';
            if (active) slide.querySelectorAll('.header,.box,.desc-mov,.ec-content,.bar .temp').forEach(node => node.style.display = 'block');
        }
        fillCities(main);
        const theme = Number(preset.config.appearanceSettings.graphicsPackage);
        const themeURL = `css/intellistar-32-${theme === 2010 ? 2009 : theme}.css`;
        const link = frameDocument.querySelector('#canvas-theme');
        if (link.getAttribute('href') !== themeURL) { link.onload = () => { updateSelection(); renderInspector(); }; link.setAttribute('href', themeURL); }
        const iconSet = preset.config.appearanceSettings.iconSet;
        main.querySelectorAll('.icon').forEach(node => node.style.backgroundImage = node.style.backgroundImage.replace(/\/icons\/(2007|2010|2026)\//, `/icons/${iconSet}/`));
        const ldl = main.querySelector(theme >= 2008 ? '.ldl-blue' : '.ldl-black'); if (ldl) ldl.style.display = 'block';
        if (ldl && preset.config.appearanceSettings.ldlVisible === false) ldl.style.display = 'none';
        const showCrawl = preset.config.appearanceSettings.ldlType === 'both' && pageIndex % 2 === 1;
        main.querySelectorAll('.ldl-blue .crawl').forEach(node => node.style.display = showCrawl ? 'block' : 'none');
        if (showCrawl) main.querySelector('.ldl-blue .observations').style.display = 'none';
        for (const [metric, value] of [['wind', 'SO 18 km/h'], ['humidity', '48%'], ['pressure', '101.4 kPa']]) {
            const node = main.querySelector(`.ldl-blue .obs-metrics .${metric}`);
            if (node) { node.style.display = 'flex'; node.querySelector('.info').textContent = value; }
        }
        main.querySelectorAll('.ldl-blue .obs-primary .tempobs,.ldl-blue .temptab .temp').forEach(node => node.textContent = '24');
        const time = main.querySelector('.ldl-blue .time span'); if (time) time.textContent = '16:30';
        const cond = main.querySelector('.ldl-blue .condtext'); if (cond) cond.textContent = 'Ensoleillé';
        const crawl = main.querySelector('.ldl-blue .crawl .scroll'); if (crawl) crawl.textContent = (preset.config.appearanceSettings.marqueeAd || []).join(' • ');
        if (activeClass === 'radar') {
            const placeholder = frameDocument.createElement('div'); placeholder.className = 'editor-radar-placeholder';
            const radarIndex = Math.max(0, Number(descriptor().function.match(/\d+$/)?.[0] || 1) - 1);
            placeholder.textContent = `RADAR PREVIEW · ${preset.config.locationSettings.localDopplers?.[radarIndex]?.name || 'Regional'} — Imagery loads in broadcast`;
            main.querySelector('.radar').append(placeholder);
        }
        frameDocument.body.replaceChildren(main);
        M.mountElements(main, preset.elements);
        applyLayout(); fitCanvas();
    }
    function applyLayout() {
        try { frameDocument.querySelector('#editor-layout').textContent = M.layoutCSS(preset.layout); }
        catch (error) { notify(error.message, true); return; }
        for (const [selector, entry] of Object.entries(preset.layout)) {
            if (entry.text !== undefined && M.selectorSafe(selector)) { const node = frameDocument.querySelector(selector); if (node && !node.children.length) node.textContent = entry.text; }
        }
        updateSelection();
    }
    function fitCanvas() {
        const space = $('#canvas-space'); const value = $('#zoom').value;
        scale = value === 'fit' ? Math.max(.08, Math.min((space.clientWidth - 48) / 1620, (space.clientHeight - 48) / 1080)) : Number(value);
        $('#canvas-scale').style.transform = `scale(${scale})`;
        $('#canvas-scale').style.left = `${Math.max(24, (space.clientWidth - 1620 * scale) / 2)}px`;
        $('#canvas-scale').style.top = `${Math.max(24, (space.clientHeight - 1080 * scale) / 2)}px`;
        updateSelection();
    }
    function selectedNode() { return selected && frameDocument?.querySelector(selected); }
    function updateSelection() {
        const node = selectedNode(); const box = $('#selection-box');
        if (!node || !node.getClientRects().length) { box.style.display = 'none'; return; }
        const rect = node.getBoundingClientRect();
        Object.assign(box.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    }
    function layerName(node) {
        const custom = preset.elements?.find(item => node.classList.contains(item.id));
        return custom ? `${custom.kind} · ${preset.layout[M.customSelector(custom)]?.text?.slice(0, 24) || 'Custom layer'}` : (node.className || node.id || node.tagName.toLowerCase()).toString().replace(/\s+/g, ' ');
    }
    function renderLayers() {
        if (!frameDocument) return;
        const active = frameDocument.querySelector(`.slides > .${descriptor().className}`);
        const ldl = frameDocument.querySelector(Number(preset.config.appearanceSettings.graphicsPackage) >= 2008 ? '.ldl-blue' : '.ldl-black');
        const all = [frameDocument.querySelector('#background'), active, ...active?.querySelectorAll('*') || [], ldl, ...ldl?.querySelectorAll('*') || [], ...frameDocument.querySelectorAll('#main > .studio-layer')].filter(node => node && !['BR', 'SCRIPT'].includes(node.tagName) && !node.classList.contains('editor-radar-placeholder'));
        const term = $('#layer-search').value.toLowerCase();
        $('#layer-count').textContent = `${all.length} layers`;
        $('#layers').replaceChildren(...all.filter(node => layerName(node).toLowerCase().includes(term)).map(node => {
            const selector = M.elementSelector(node); const b = button(`${'· '.repeat(Math.max(0, selector.split(' > ').length - 4))}${layerName(node)}`, () => { selected = selector; renderInspector(); renderLayers(); updateSelection(); }, selected === selector ? 'active' : ''); return b;
        }));
    }
    function styleChange(key, value) {
        try { if (value !== '') M.cssValue(key, value); }
        catch (error) { notify(error.message, true); return; }
        change(() => {
            const entry = preset.layout[selected] ??= { style: {} };
            if (value === '') delete entry.style[key]; else entry.style[key] = value;
        }, false);
    }
    function renderInspector() {
        const panel = $('#inspector-content'); panel.replaceChildren();
        panel.append(el('div', { class: 'actions' }, ...['text', 'image', 'panel'].map(kind => button(`+ ${kind}`, () => addCustomLayer(kind)))), note('Add text, artwork or a panel to this slide. Custom layers can also be shown on every slide.'));
        panel.append(field('Preview page (sample only)', pageIndex + 1, v => { pageIndex = Math.max(0, v - 1); selected = null; refreshCanvas(); renderLayers(); renderInspector(); }, { min: 1, max: 100, step: 1 }));
        const node = selectedNode();
        if (!node) { panel.append(el('p', { class: 'empty' }, 'Select a layer on the canvas or in the layer tree. Drag to move, resize with the corner handle, or enter exact values below. Hidden layers remain selectable in the tree.')); return; }
        const style = preset.layout[selected]?.style || {}; const computed = frameDocument.defaultView.getComputedStyle(node);
        const custom = preset.elements?.find(item => selected === M.customSelector(item));
        if (custom) panel.append(field('Show on every slide', custom.scope === 'global', global => change(() => {
            const old = selected; custom.scope = global ? 'global' : descriptor().className; selected = M.customSelector(custom);
            preset.layout[selected] = preset.layout[old]; delete preset.layout[old];
        })), button('Delete custom layer', () => change(() => { preset.elements = preset.elements.filter(item => item !== custom); delete preset.layout[selected]; selected = null; }), 'danger'));
        panel.append(el('h2', { class: 'selected-label' }, layerName(node)), el('div', { class: 'actions' }, button('Parent ↑', () => {
            if (node.parentElement.id !== 'main') { selected = M.elementSelector(node.parentElement); renderInspector(); renderLayers(); updateSelection(); }
        }), button('Reset layer', () => change(() => delete preset.layout[selected], false))));
        const mapIndex = node.dataset.mapIndex;
        if (mapIndex !== undefined) panel.append(note('This group is a configured map city. Dragging updates its saved map coordinates, not a page-slot override.'));
        panel.append(el('h3', {}, 'Placement'));
        for (const pair of [['left', 'top'], ['width', 'height'], ['rotate', 'zIndex']]) {
            panel.append(el('div', { class: 'field-row' }, pair.map(key => {
                const fallback = key === 'left' ? node.offsetLeft : key === 'top' ? node.offsetTop : key === 'width' ? node.offsetWidth : key === 'height' ? node.offsetHeight : 0;
                const current = style[key] ?? (Number.parseFloat(computed[key]) || fallback);
                return field(key, Math.round(current * 100) / 100, value => {
                    if (mapIndex !== undefined && ['left', 'top'].includes(key)) change(() => preset.config.locationSettings.mapCities.map[Number(mapIndex)][key] = value, false);
                    else if (['left', 'top'].includes(key)) change(() => { const entry = preset.layout[selected] ??= { style: {} }; entry.style.position = 'absolute'; entry.style[key] = value; }, false);
                    else styleChange(key, value);
                }, { min: M.numberStyles[key][0], max: M.numberStyles[key][1] });
            })));
        }
        panel.append(field('Hide layer in broadcast', style.display === 'none', hidden => styleChange('display', hidden ? 'none' : '')));
        panel.append(el('h3', {}, 'Typography & appearance'));
        for (const pair of [['fontSize', 'lineHeight'], ['letterSpacing', 'opacity'], ['borderRadius']]) panel.append(el('div', { class: 'field-row' }, pair.map(key => field(key, style[key] ?? (Number.parseFloat(computed[key]) || (key === 'opacity' ? 1 : key === 'fontSize' ? 32 : key === 'lineHeight' ? 40 : 0)), value => styleChange(key, value), { min: M.numberStyles[key][0], max: M.numberStyles[key][1] }))));
        for (const key of ['fontFamily', 'fontWeight', 'textAlign']) panel.append(field(key, style[key] || '', value => styleChange(key, value), { choices: [['', 'Theme default'], ...M.enums[key]] }));
        for (const key of ['color', 'backgroundColor']) panel.append(field(key, style[key] || '', value => styleChange(key, value), { help: 'Hex color (#ffffff), transparent, or blank for theme default.' }));
        panel.append(field('Artwork path', style.backgroundImage || '', value => styleChange('backgroundImage', value), { help: 'Local images/ path. Overrides the weather-driven icon only when explicitly set.' }), field('Artwork fit', style.backgroundSize || '', value => styleChange('backgroundSize', value), { choices: [['', 'Theme default'], ...M.enums.backgroundSize] }));
        if (node.classList.contains('icon')) {
            const iconNames = [...fixtureDocument.querySelector('script:last-of-type').textContent.matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]);
            const start = iconNames.indexOf('Sun'); const end = iconNames.indexOf('AMFgPMSu');
            const icons = start >= 0 && end >= start ? [...new Set(iconNames.slice(start, end + 1))] : ['Sun', 'Cld', 'Ra', 'Sn', 'Ts'];
            panel.append(field('Pin a weather icon', '', value => { if (value) styleChange('backgroundImage', `images/icons/${preset.config.appearanceSettings.iconSet}/large/${value}.webp`); }, { choices: [['', 'Select icon…'], ...icons] }));
        }
        if (!node.children.length && !['IMG', 'CANVAS', 'SVG'].includes(node.tagName)) {
            const entry = preset.layout[selected];
            panel.append(el('h3', {}, 'Static text override'), note('Pinning replaces live text, including weather values. Leave unpinned for real weather updates.'), field('Pin text', entry?.text !== undefined, enabled => change(() => { const item = preset.layout[selected] ??= { style: {} }; if (enabled) item.text = node.textContent; else delete item.text; }, false)));
            if (entry?.text !== undefined) panel.append(field('Pinned text', entry.text, text => change(() => preset.layout[selected].text = text, false), { multiline: true }));
        }
        panel.append(button('Reset all layout overrides', () => { if (confirm('Remove every layout, custom layer and pinned-text override from this preset?')) change(() => { preset.layout = {}; preset.elements = []; selected = null; }); }, 'danger'));
    }
    function addCustomLayer(kind) {
        let asset = '';
        if (kind === 'image') {
            asset = prompt('Local artwork path (under images/)', 'images/icons/2026/large/Sun.webp');
            if (asset === null) return;
            if (!M.assetPath(asset)) return notify('Use a local images/ path ending in png, webp, jpg, gif, svg or apng.', true);
        }
        change(() => {
            const item = { id: `layer-${crypto.randomUUID()}`, scope: descriptor().className, kind };
            (preset.elements ??= []).push(item); selected = M.customSelector(item);
            const style = { position: 'absolute', left: 200, top: 250, width: kind === 'image' ? 200 : 600, height: kind === 'image' ? 200 : 100, zIndex: 50 };
            if (kind === 'text') Object.assign(style, { color: '#ffffff', fontSize: 48, fontFamily: 'Interstate Bold' });
            if (kind === 'image') Object.assign(style, { backgroundImage: asset, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' });
            if (kind === 'panel') Object.assign(style, { backgroundColor: '#123956', borderRadius: 12 });
            preset.layout[selected] = { style, ...(kind === 'text' ? { text: 'Your text here' } : {}) };
        });
    }
    function startDrag(event) {
        if (event.button !== 0 || playing) return;
        let node = event.target;
        if (!(node instanceof frameDocument.defaultView.Element) || !node.closest('#main') || node.id === 'main') return;
        if (node.closest('.editor-radar-placeholder')) node = node.closest('.radar');
        // On a map, dragging a label moves the whole city; Alt selects its individual layer.
        if (!event.altKey && node.closest('.map .city')) node = node.closest('.map .city');
        selected = M.elementSelector(node); event.preventDefault();
        renderInspector(); renderLayers(); updateSelection();
        beginGesture(event, node, false, frameDocument, 1);
    }
    function beginGesture(event, node, resize, owner, factor) {
        const startX = event.clientX, startY = event.clientY;
        if (node.closest('.map-cities')) factor *= Number(preset.config.locationSettings.mapCities.zoomScale) || 1;
        const initial = { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight };
        const mapIndex = node.dataset.mapIndex; let changed = false;
        const move = e => {
            let dx = (e.clientX - startX) / factor, dy = (e.clientY - startY) / factor;
            if (!changed && Math.abs(dx) + Math.abs(dy) < 3) return;
            if (!changed) { checkpoint(); changed = true; }
            const snap = value => $('#snap').checked && !e.altKey ? Math.round(value / 10) * 10 : Math.round(value);
            if (mapIndex !== undefined && !resize) {
                const city = preset.config.locationSettings.mapCities.map[Number(mapIndex)]; city.left = snap(initial.left + dx); city.top = snap(initial.top + dy);
                node.style.left = `${city.left}px`; node.style.top = `${city.top}px`;
            } else {
                const entry = preset.layout[selected] ??= { style: {} };
                if (resize) { entry.style.width = Math.max(1, Math.min(10000, snap(initial.width + dx))); entry.style.height = Math.max(1, Math.min(10000, snap(initial.height + dy))); }
                else { entry.style.position = 'absolute'; entry.style.left = Math.max(-20000, Math.min(20000, snap(initial.left + dx))); entry.style.top = Math.max(-20000, Math.min(20000, snap(initial.top + dy))); }
                applyLayout();
            }
            updateSelection(); updateStatus();
        };
        const end = () => {
            owner.removeEventListener('pointermove', move); owner.removeEventListener('pointerup', end); owner.removeEventListener('pointercancel', end);
            try { event.target.releasePointerCapture(event.pointerId); } catch (_) { /* already released */ }
            if (changed) { renderInspector(); updateStatus(); }
        };
        try { event.target.setPointerCapture(event.pointerId); } catch (_) { /* unsupported target */ }
        owner.addEventListener('pointermove', move); owner.addEventListener('pointerup', end); owner.addEventListener('pointercancel', end);
    }
    function keyboard(event) {
        const editing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); guarded(() => save()); return; }
        if (editing) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? history(redoStack, undoStack) : history(undoStack, redoStack); return; }
        if (event.key === 'Escape') { selected = null; renderInspector(); renderLayers(); updateSelection(); return; }
        if (event.key === ' ') { event.preventDefault(); togglePreview(); return; }
        const node = selectedNode();
        if (node && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); const amount = event.shiftKey ? 10 : 1; const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
            const key = horizontal ? 'left' : 'top'; const value = (horizontal ? node.offsetLeft : node.offsetTop) + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -amount : amount);
            change(() => {
                if (node.dataset.mapIndex !== undefined) preset.config.locationSettings.mapCities.map[Number(node.dataset.mapIndex)][key] = value;
                else { const entry = preset.layout[selected] ??= { style: {} }; entry.style.position = 'absolute'; entry.style[key] = value; }
            }, false);
        }
    }
    function stopPreview() { playing = false; clearTimeout(playTimer); $('#play').textContent = '▶ Preview'; }
    function togglePreview() {
        if (playing) return stopPreview();
        if (!preset.config.slideSettings.order.some(s => s.enabled !== false)) return notify('Enable a slide to preview.', true);
        playing = true; selected = null; updateSelection(); $('#play').textContent = 'Ⅱ Pause';
        const tick = () => {
            const order = preset.config.slideSettings.order; let next = selectedSlide;
            do { next = (next + 1) % order.length; } while (order[next].enabled === false);
            selectSlide(next); playTimer = setTimeout(tick, order[next].slideDelay);
        };
        playTimer = setTimeout(tick, preset.config.slideSettings.order[selectedSlide].slideDelay);
    }
    async function init() {
        for (const node of document.querySelectorAll('[data-tab]')) node.addEventListener('click', () => {
            tab = node.dataset.tab; document.querySelectorAll('[data-tab]').forEach(n => n.classList.toggle('active', n === node)); renderNav();
        });
        $('#preset-name').addEventListener('change', () => { if (preset) change(() => preset.name = $('#preset-name').value, false); });
        $('#save').onclick = () => guarded(() => save()); $('#save-as').onclick = () => guarded(() => save(true));
        $('#publish').onclick = () => guarded(async () => {
            M.validate(preset);
            if (!confirm('Save and apply this preset? All connected broadcast viewers will reload. This may briefly interrupt the stream.')) return;
            const saved = await save(); if (!saved) return;
            await api(`/presets/${saved.id}/apply`, 'POST'); state = await api('/state'); renderNav(); notify('Preset applied. Connected viewers will reload within 3 seconds.');
        });
        $('#undo').onclick = () => history(undoStack, redoStack); $('#redo').onclick = () => history(redoStack, undoStack);
        $('#previous').onclick = () => selectSlide((selectedSlide - 1 + preset.config.slideSettings.order.length) % preset.config.slideSettings.order.length);
        $('#next').onclick = () => selectSlide((selectedSlide + 1) % preset.config.slideSettings.order.length);
        $('#play').onclick = togglePreview; $('#zoom').onchange = fitCanvas;
        for (const id of ['grid', 'safe']) $(`#${id}`).onchange = () => $(`#${id}-overlay`).style.display = $(`#${id}`).checked ? '' : 'none';
        $('#layer-search').oninput = renderLayers;
        $('#resize-handle').onpointerdown = event => { const node = selectedNode(); if (node) { event.preventDefault(); beginGesture(event, node, true, document, scale); } };
        $('#accept-json').onclick = () => {
            try { const value = JSON.parse($('#json-source').value); M.validate(value); change(() => { preset = value; selected = null; }); $('#preset-name').value = preset.name; $('#json-dialog').close(); }
            catch (error) { notify(error.message, true); }
        };
        $('#import-file').onchange = () => guarded(async () => {
            const file = $('#import-file').files[0]; $('#import-file').value = ''; if (!file) return;
            if (file.size > 2 * 1024 * 1024) throw new Error('Preset file must be smaller than 2 MB');
            const value = JSON.parse(await file.text()); M.validate(value);
            if (confirmDiscard()) { delete value.id; delete value.updatedAt; loadPreset(value, false); notify('Preset imported. Save it to add it to the server library.'); }
        });
        document.addEventListener('keydown', keyboard);
        window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
        new ResizeObserver(fitCanvas).observe($('#canvas-space'));
        try {
            const [current, library] = await Promise.all([api('/current'), api('/state'), buildCanvas()]); state = library;
            loadPreset(current); $('#loading').style.display = 'none';
        } catch (error) { $('#loading').textContent = `Studio could not start: ${error.message}`; notify(error.message, true); }
    }
    init();
})();