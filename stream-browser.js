// Serialized into the page by Puppeteer; keep this function self-contained.
function installRafThrottle(fps) {
  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const interval = 1000 / fps;
  const callbacks = new Map();
  let nextId = 0;
  let pending = null;
  let lastTime = null;
  const tick = (time) => {
    pending = null;
    if (lastTime === null || time - lastTime >= interval - 0.5) {
      lastTime = lastTime === null ? time : time - ((time - lastTime + 0.5) % interval) + 0.5;
      // Snapshot IDs: callbacks scheduled during this frame belong to the next frame.
      for (const id of [...callbacks.keys()]) {
        const callback = callbacks.get(id);
        if (!callback) continue;
        callbacks.delete(id);
        try { callback(time); } catch (error) { setTimeout(() => { throw error; }, 0); }
      }
    }
    if (callbacks.size && pending === null) pending = nativeRequest(tick);
  };
  window.requestAnimationFrame = (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Animation callback must be a function');
    const id = ++nextId;
    callbacks.set(id, callback);
    if (pending === null) pending = nativeRequest(tick);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    callbacks.delete(id);
    if (!callbacks.size && pending !== null) {
      nativeCancel(pending);
      pending = null;
    }
  };
  window.__iptvRafThrottle = true;
}

// puppeteer-stream 3.x still calls this method, removed in Puppeteer 25.
function ensureStreamBrowserCompatibility(browser) {
  if (typeof browser.isConnected !== 'function') {
    browser.isConnected = () => browser.connected;
  }
  return browser;
}

module.exports = { installRafThrottle, ensureStreamBrowserCompatibility };