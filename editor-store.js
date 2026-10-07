'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const Model = require('./webroot/js/editor-model');

function readDefaults(root) {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(root, 'webroot/js/config.js'), 'utf8'), context, { timeout: 1000 });
    return Object.fromEntries(Model.sections.map(key => [key, Model.clone(context[key])]));
}

function createStore(directory, getBaseConfig, defaults) {
    const file = path.join(directory, 'presets.json');
    function read() {
        if (!fs.existsSync(file)) return { version: 1, revision: 0, activeId: null, applied: null, presets: [] };
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    function write(data) {
        fs.mkdirSync(directory, { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
            fs.renameSync(temporary, file);
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
    }
    function find(data, id) {
        const preset = data.presets.find(item => item.id === id);
        if (!preset) { const error = new Error('Preset not found'); error.status = 404; throw error; }
        return preset;
    }
    return {
        state() { const data = read(); return { activeId: data.activeId, revision: data.revision, presets: data.presets.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })) }; },
        get(id) { return find(read(), id); },
        current() {
            const data = read();
            return { schemaVersion: 1, name: 'Current broadcast', config: Model.normalize(getBaseConfig(), defaults), layout: {}, elements: [], ...(data.applied || {}), id: undefined, updatedAt: undefined };
        },
        save(input, id) {
            Model.validate(input);
            const data = read();
            const old = id ? find(data, id) : null;
            if (old && input.updatedAt !== old.updatedAt) { const error = new Error('This preset changed in another editor. Reload it before saving.'); error.status = 409; throw error; }
            const updatedAt = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
            const preset = { schemaVersion: 1, id: old ? old.id : crypto.randomUUID(), name: input.name.trim(), config: input.config, layout: input.layout, elements: input.elements || [], updatedAt };
            if (old) data.presets[data.presets.indexOf(old)] = preset;
            else data.presets.push(preset);
            write(data);
            return preset;
        },
        remove(id) {
            const data = read(); find(data, id);
            if (data.activeId === id) { const error = new Error('Restore the base configuration before deleting the active preset.'); error.status = 409; throw error; }
            data.presets = data.presets.filter(item => item.id !== id); write(data);
        },
        apply(id) {
            const data = read();
            data.applied = id ? Model.clone(Model.validate(find(data, id))) : null;
            data.activeId = id || null;
            data.revision = Math.max(Date.now(), data.revision + 1);
            write(data);
            return { revision: data.revision, activeId: data.activeId };
        },
        broadcast() {
            const data = read();
            const base = getBaseConfig();
            if (!data.applied) return { ...base, __editorRevision: data.revision };
            const config = Model.clone(data.applied.config);
            config.slideSettings.order = config.slideSettings.order.filter(slide => slide.enabled !== false);
            // Canonical nested sections must not be overridden by legacy root aliases.
            const result = { ...base };
            for (const key of Model.locationKeys) delete result[key];
            for (const section of Model.sections) for (const key of Object.keys(defaults[section] || {})) delete result[key];
            for (const key of ['slideOrder', 'audioOrder', 'order']) delete result[key];
            return { ...result, ...config, editorLayout: data.applied.layout, editorElements: data.applied.elements || [], __editorRevision: data.revision };
        }
    };
}

function installEditorAPI(app, store) {
    const express = require('express');
    const router = express.Router();
    router.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD'].includes(req.method)) {
            const origin = req.get('origin');
            if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== `${req.protocol}://${req.get('host')}`)) return res.status(403).json({ error: 'Same-origin requests only' });
            if (!req.is('application/json')) return res.status(415).json({ error: 'JSON request body required' });
        }
        next();
    });
    router.use(express.json({ limit: '2mb' }));
    router.get('/state', (req, res) => res.json(store.state()));
    router.get('/current', (req, res) => res.json(store.current()));
    router.get('/presets/:id', (req, res) => res.json(store.get(req.params.id)));
    router.post('/presets', (req, res) => res.status(201).json(store.save(req.body)));
    router.put('/presets/:id', (req, res) => res.json(store.save(req.body, req.params.id)));
    router.delete('/presets/:id', (req, res) => { store.remove(req.params.id); res.json({ success: true }); });
    router.post('/presets/:id/apply', (req, res) => res.json(store.apply(req.params.id)));
    router.post('/restore', (req, res) => res.json(store.apply(null)));
    router.use((error, req, res, next) => {
        res.status(error.status || (error.code ? 500 : 400)).json({ error: error.code ? 'Preset storage could not be read or written. Check server permissions and disk space.' : error.message });
    });
    app.use('/api/editor', router);
}
module.exports = { createStore, readDefaults, installEditorAPI };