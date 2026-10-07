/* Apply portable Studio layouts without changing theme files or live weather data. */
(function () {
    'use strict';
    const Model = window.IntelliStarEditorModel;
    let layout = {}, revision = null, observer, scheduled = false;
    const originalText = new Map();
    function applyText() {
        scheduled = false;
        for (const [selector, entry] of Object.entries(layout)) {
            if (entry.text === undefined || !Model.selectorSafe(selector)) continue;
            const node = document.querySelector(selector);
            // Never replace containers (would destroy data bindings / map canvases).
            if (!node || node.children.length || node.textContent === entry.text) continue;
            if (!originalText.has(node)) originalText.set(node, node.textContent);
            node.textContent = entry.text;
        }
        for (const node of originalText.keys()) if (!node.isConnected) originalText.delete(node);
    }
    window.applyEditorPreset = function (config) {
        revision = config.__editorRevision ?? 0;
        window.__editorRevision = revision;
        observer?.disconnect();
        for (const [node, text] of originalText) if (node.isConnected) node.textContent = text;
        originalText.clear();
        layout = config.editorLayout || {};
        let style = document.getElementById('broadcast-editor-layout');
        if (!style) { style = document.createElement('style'); style.id = 'broadcast-editor-layout'; document.head.append(style); }
        try {
            style.textContent = Model.layoutCSS(layout);
            if (config.appearanceSettings?.ldlVisible === false) style.textContent += '\n#main > .ldl-blue,#main > .ldl-black{display:none!important}';
        } catch (error) { console.error('[Studio] Invalid layout:', error.message); style.textContent = ''; }
        const main = document.getElementById('main');
        if (!main && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => window.applyEditorPreset(config), { once: true });
        }
        if (main) {
            Model.mountElements(main, config.editorElements);
            applyText();
            if (Object.values(layout).some(entry => entry.text !== undefined)) {
                observer = new MutationObserver(() => {
                    if (!scheduled) { scheduled = true; requestAnimationFrame(applyText); }
                });
                observer.observe(main, { subtree: true, childList: true, characterData: true });
            }
        }
    };
    // A fresh page is necessary for city/weather initialization. Legacy eval-based
    // hot reload cannot safely reset lexical declarations or weather timers.
    let checking = false;
    setInterval(async () => {
        if (checking || revision === null) return;
        checking = true;
        try {
            const response = await fetch('/api/editor/state', { cache: 'no-store' });
            if (!response.ok) return;
            const state = await response.json();
            if (state.revision !== revision) location.reload();
        } catch (_) { /* Keep the broadcast playing if the server is temporarily unavailable. */ }
        finally { checking = false; }
    }, 3000);
})();