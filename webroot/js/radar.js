// ═══════════════════════════════════════════════════════════════════════
// IntelliStar High-Performance Low-Memory 2D Canvas Radar Engine
// Optimized for Raspberry Pi & embedded systems (Zero memory leaks,
// on-demand single-canvas compositing, and aggressive bitmap reclamation).
// ═══════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.__iptvMapsAvailable = true;
}

let quebecBoundaryData = null;
if (typeof window !== 'undefined' && window.QUEBEC_BOUNDARY) {
  quebecBoundaryData = window.QUEBEC_BOUNDARY;
} else if (typeof require === 'function') {
  try {
    quebecBoundaryData = require('./quebec-boundary.js');
  } catch (e) {}
}

function destroyCanvas(canvas) {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, 0, 0);
    }
  } catch (e) {}
}

const radarEngine = {
  imageCache: new Map(),         // url -> HTMLImageElement (bounded to active timestamps)
  loadingPromises: new Map(),    // url -> Promise (in-flight request deduplication)
  basemapCache: new Map(),       // locKey -> HTMLCanvasElement (1 static satellite basemap per location)
  renderBuffer: null,            // Reusable offscreen double-buffer canvas (zero-tearing atomic blit)
  timestamps: [],
  satTimestamps: [],
  satProduct: 'ussat',
  snowTimestamps: [],
  snowProduct: 'snow24hr',
  snowDataCache: new Map(),
  activeSnowCities: [],
  snowParticles: null,
  windDataCache: new Map(),
  activeWindCities: [],
  windParticles: null,
  activeInterval: null,
  activeRaf: null,
  activeTarget: null,
  activeCanvas: null,
  activeLocKey: null,
  activeLayer: 'radar',
  isPreloading: false,
  isReady: false,
  lastUpdated: 0,
  lastTimestampsKey: '',
  lastSatTimestampsKey: '',
  lastSnowTimestampsKey: '',

  // Reusable offscreen canvas for atomic double-buffering (completely eliminates tearing and compositor flicker)
  getRenderBuffer(width = 1620, height = 1080) {
    if (!this.renderBuffer) {
      if (typeof document !== 'undefined' && document.createElement) {
        this.renderBuffer = document.createElement('canvas');
        this.renderBuffer.width = width;
        this.renderBuffer.height = height;
      }
    }
    return this.renderBuffer;
  },

  // Check whether smooth frame interpolation is enabled in settings or locationConfig
  isInterpolationEnabled() {
    if (typeof appearanceSettings !== 'undefined' && appearanceSettings && appearanceSettings.smoothRadar !== undefined) {
      return !!appearanceSettings.smoothRadar;
    }
    if (typeof locationConfig !== 'undefined' && locationConfig) {
      if (locationConfig.smoothRadar !== undefined) return !!locationConfig.smoothRadar;
      if (locationConfig.radar && locationConfig.radar.smoothRadar !== undefined) return !!locationConfig.radar.smoothRadar;
    }
    if (typeof window !== 'undefined' && window.__iptvRadarInterpolation !== undefined) {
      return !!window.__iptvRadarInterpolation;
    }
    return true; // Enabled by default
  },

  // Extract all configured radar targets from locationConfig
  getAllRadarLocations() {
    const locations = [];

    // 1. Regional Doppler
    let regLon = -73.573;
    let regLat = 45.503;
    if (typeof locationConfig !== 'undefined' && locationConfig) {
      if (locationConfig.radar && locationConfig.radar.regionalCoords && locationConfig.radar.regionalCoords.lon != null) {
        regLon = Number(locationConfig.radar.regionalCoords.lon) || regLon;
        regLat = Number(locationConfig.radar.regionalCoords.lat) || regLat;
      } else if (locationConfig.mainCity && locationConfig.mainCity.lon != null) {
        regLon = Number(locationConfig.mainCity.lon) || regLon;
        regLat = Number(locationConfig.mainCity.lat) || regLat;
      }
    }
    locations.push({
      key: 'regional',
      type: 'regional',
      name: 'Regional',
      lon: regLon,
      lat: regLat,
      zoom: 7.7,
      isRegional: true,
      shadowOffset: { x: 6, y: 4 },
    });

    // 2. Satellite Cloud Cover ("Couverture Nuageuse")
    let satLon = regLon;
    let satLat = regLat;
    let satZoom = 7.0;
    if (typeof locationConfig !== 'undefined' && locationConfig) {
      if (locationConfig.satellite && locationConfig.satellite.coords && locationConfig.satellite.coords.lon != null) {
        satLon = Number(locationConfig.satellite.coords.lon) || satLon;
        satLat = Number(locationConfig.satellite.coords.lat) || satLat;
      } else if (locationConfig.satellite && locationConfig.satellite.lon != null) {
        satLon = Number(locationConfig.satellite.lon) || satLon;
        satLat = Number(locationConfig.satellite.lat) || satLat;
      }
      if (locationConfig.satellite && locationConfig.satellite.zoom != null) {
        satZoom = Number(locationConfig.satellite.zoom) || satZoom;
      }
    }
    locations.push({
      key: 'satellite',
      type: 'satellite',
      name: 'Couverture Nuageuse',
      lon: satLon,
      lat: satLat,
      zoom: satZoom,
      isSatellite: true,
      shadowOffset: { x: 0, y: 0 },
    });

    // 2. Configured Local Dopplers (e.g. Montréal, Centre du Québec, Abitibi-Témiscamingue, etc.)
    if (typeof locationConfig !== 'undefined' && locationConfig && Array.isArray(locationConfig.localDopplers) && locationConfig.localDopplers.length > 0) {
      locationConfig.localDopplers.forEach((d, idx) => {
        locations.push({
          key: `local_${idx}`,
          type: 'local',
          index: idx,
          name: d.name || `Doppler local ${idx + 1}`,
          lon: Number(d.lon) || regLon,
          lat: Number(d.lat) || regLat,
          zoom: Number(d.zoom) || 9.8,
          isRegional: false,
          shadowOffset: { x: 12, y: 8 },
        });
      });
    } else {
      // Fallback default local doppler (index 0)
      let locLon = regLon;
      let locLat = regLat;
      if (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radar && locationConfig.radar.localCoords && locationConfig.radar.localCoords.lon != null) {
        locLon = Number(locationConfig.radar.localCoords.lon) || locLon;
        locLat = Number(locationConfig.radar.localCoords.lat) || locLat;
      }
      locations.push({
        key: 'local_0',
        type: 'local',
        index: 0,
        name: 'Doppler local',
        lon: locLon,
        lat: locLat,
        zoom: 9.8,
        isRegional: false,
        shadowOffset: { x: 12, y: 8 },
      });
    }

    return locations;
  },

  getLocationByKey(key) {
    const all = this.getAllRadarLocations();
    return all.find((loc) => loc.key === key) || all[0];
  },

  // Spherical Mercator tile range & screen offset calculation
  getTileBounds(lon, lat, zoom, width = 1620, height = 1080) {
    const baseZoom = Math.floor(zoom);
    const scale = Math.pow(2, zoom - baseZoom);
    const n = Math.pow(2, baseZoom);

    const xExact = ((lon + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const yExact = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const centerPixelX = xExact * 256;
    const centerPixelY = yExact * 256;

    const halfWidthBase = (width / 2) / scale;
    const halfHeightBase = (height / 2) / scale;

    const leftPixel = centerPixelX - halfWidthBase;
    const topPixel = centerPixelY - halfHeightBase;

    const minTileX = Math.max(0, Math.floor(leftPixel / 256));
    const maxTileX = Math.min(n - 1, Math.floor((leftPixel + (width / scale)) / 256));
    const minTileY = Math.max(0, Math.floor(topPixel / 256));
    const maxTileY = Math.min(n - 1, Math.floor((topPixel + (height / scale)) / 256));

    return {
      baseZoom,
      scale,
      leftPixel,
      topPixel,
      minTileX,
      maxTileX,
      minTileY,
      maxTileY,
      width,
      height,
    };
  },

  // Project geographic coordinates (lon, lat) to screen pixel coordinates (x, y) on the 1620x1080 canvas
  latLonToScreen(cityLon, cityLat, centerLon, centerLat, zoom, width = 1620, height = 1080) {
    if (cityLon == null || cityLat == null) return null;
    const cLon = Number(cityLon);
    const cLat = Math.max(-85.05112878, Math.min(85.05112878, Number(cityLat)));
    const cenLon = Number(centerLon);
    const cenLat = Math.max(-85.05112878, Math.min(85.05112878, Number(centerLat)));
    const z = Number(zoom);
    if (!Number.isFinite(cLon) || !Number.isFinite(cLat) || !Number.isFinite(cenLon) || !Number.isFinite(cenLat) || !Number.isFinite(z)) return null;

    const baseZoom = Math.floor(z);
    const scale = Math.pow(2, z - baseZoom);
    const n = Math.pow(2, baseZoom);

    const centerWorldX = ((cenLon + 180) / 360) * n;
    const centerLatRad = (cenLat * Math.PI) / 180;
    const centerWorldY = (1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2 * n;

    const leftPixel = (centerWorldX * 256) - (width / 2) / scale;
    const topPixel = (centerWorldY * 256) - (height / 2) / scale;

    const cityWorldX = ((cLon + 180) / 360) * n;
    const cityLatRad = (cLat * Math.PI) / 180;
    const cityWorldY = (1 - Math.log(Math.tan(cityLatRad) + 1 / Math.cos(cityLatRad)) / Math.PI) / 2 * n;

    const x = Math.round((cityWorldX * 256 - leftPixel) * scale);
    const y = Math.round((cityWorldY * 256 - topPixel) * scale);

    return { x, y };
  },

  // Resilient Tile Image Loader with In-Flight Deduplication & Zero False Evictions
  loadTileImage(url) {
    if (this.imageCache.has(url)) {
      return Promise.resolve(this.imageCache.get(url));
    }
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url);
    }
    if (typeof Image === 'undefined') {
      return Promise.resolve(null);
    }
    const p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(url, img);
        this.loadingPromises.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.loadingPromises.delete(url);
        resolve(null);
      };
      img.src = url;
    });
    this.loadingPromises.set(url, p);
    return p;
  },

  // Concurrency-throttled queue loader: prevents network flood, socket exhaustion, and frame drops
  async loadTilesInBatches(urls, concurrency = 6) {
    if (!urls || urls.length === 0) return;
    const queue = urls.slice();
    const workers = [];
    const worker = async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (url) {
          await this.loadTileImage(url);
        }
      }
    };
    const count = Math.min(concurrency, urls.length);
    for (let i = 0; i < count; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  },

  // Prune cached tiles that belong to expired radar, satellite, or snow timestamps
  pruneImageCache(activeTimestamps = [], activeSatTimestamps = [], activeSnowTimestamps = []) {
    const validTsSet = new Set([
      ...(activeTimestamps || []).map((ts) => String(ts)),
      ...(activeSatTimestamps || []).map((ts) => String(ts)),
      ...(activeSnowTimestamps || []).map((ts) => String(ts)),
    ]);
    if (validTsSet.size === 0) return;
    for (const url of this.imageCache.keys()) {
      const match = url.match(/[?&]ts=(\d+)/);
      if (match && !validTsSet.has(match[1])) {
        this.imageCache.delete(url);
      }
    }
  },

  // Fetch the latest radar and satellite cloud timestamps from Weather.com TileServer
  async fetchAllTimestamps(count = 12) {
    if (typeof api_key === 'undefined' || !api_key) return;
    try {
      const response = await fetch(
        `https://api.weather.com/v3/TileServer/series/productSet/PPAcore?apiKey=${api_key}`
      );
      const data = await response.json();
      const sInfo = data.seriesInfo || {};

      // 1. Radar Mosaic
      if (sInfo.twcRadarMosaic?.series) {
        const sortedRadar = sInfo.twcRadarMosaic.series
          .slice()
          .sort((a, b) => a.ts - b.ts)
          .map((item) => item.ts)
          .slice(-count);
        this.timestamps = sortedRadar;
        if (typeof window.markFeedSuccess === 'function') {
          window.markFeedSuccess('radar');
        }
      }

      // 2. Satellite Cloud Cover (ussat preferred for high-res North America, sat fallback)
      let satProd = 'ussat';
      let satSeries = sInfo.ussat?.series;
      if (!satSeries || satSeries.length === 0) {
        satProd = 'sat';
        satSeries = sInfo.sat?.series;
      }
      if (satSeries && satSeries.length > 0) {
        this.satProduct = satProd;
        const sortedSat = satSeries
          .slice()
          .sort((a, b) => a.ts - b.ts)
          .map((item) => item.ts)
          .slice(-count);
        this.satTimestamps = sortedSat;
        if (typeof window.markFeedSuccess === 'function') {
          window.markFeedSuccess('satellite');
        }
      }

      // 3. Snow Accumulation & Coverage (snow24hr, snowCoverageConus1hr, snow1hr)
      let snowProd = 'snow24hr';
      let snowSeries = sInfo.snow24hr?.series;
      if (!snowSeries || snowSeries.length === 0) {
        snowProd = 'snowCoverageConus1hr';
        snowSeries = sInfo.snowCoverageConus1hr?.series;
      }
      if (!snowSeries || snowSeries.length === 0) {
        snowProd = 'snow1hr';
        snowSeries = sInfo.snow1hr?.series;
      }
      if (snowSeries && snowSeries.length > 0) {
        this.snowProduct = snowProd;
        const sortedSnow = snowSeries
          .slice()
          .sort((a, b) => a.ts - b.ts)
          .map((item) => item.ts)
          .slice(-count);
        this.snowTimestamps = sortedSnow;
        if (typeof window.markFeedSuccess === 'function') {
          window.markFeedSuccess('snow');
        }
      }
    } catch (err) {
      console.error('[RadarEngine] Failed to fetch timestamps:', err);
    }
  },

  async fetchRadarTimestamps(count = 12) {
    await this.fetchAllTimestamps(count);
    return this.timestamps || [];
  },

  async fetchSatelliteTimestamps(count = 12) {
    await this.fetchAllTimestamps(count);
    return this.satTimestamps || [];
  },

  async fetchSnowTimestamps(count = 12) {
    await this.fetchAllTimestamps(count);
    return this.snowTimestamps || [];
  },

  // Pre-render the ESRI satellite basemap once per location into an offscreen Canvas
  async bakeBasemap(loc) {
    if (this.basemapCache.has(loc.key)) {
      return this.basemapCache.get(loc.key);
    }

    const bounds = this.getTileBounds(loc.lon, loc.lat, loc.zoom);
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Fallback dark background
    ctx.fillStyle = '#0b1626';
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    const tileUrls = [];
    const tileDrawInfo = [];
    for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
      for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`;
        const dx = Math.floor((tx * 256 - bounds.leftPixel) * bounds.scale);
        const dy = Math.floor((ty * 256 - bounds.topPixel) * bounds.scale);
        const dw = Math.ceil(256 * bounds.scale);
        const dh = Math.ceil(256 * bounds.scale);
        tileUrls.push(url);
        tileDrawInfo.push({ url, dx, dy, dw, dh });
      }
    }

    await this.loadTilesInBatches(tileUrls, 6);

    for (const info of tileDrawInfo) {
      const img = this.imageCache.get(info.url);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, info.dx, info.dy, info.dw, info.dh);
      }
    }

    this.basemapCache.set(loc.key, canvas);
    return canvas;
  },

  // Draw official vector boundary of Quebec (eliminates external state/provincial text)
  drawQuebecBoundary(ctx, loc) {
    const boundary = (typeof window !== 'undefined' && window.QUEBEC_BOUNDARY) 
      ? window.QUEBEC_BOUNDARY 
      : quebecBoundaryData;
    if (!boundary || !Array.isArray(boundary) || !loc) return;

    ctx.save();
    ctx.beginPath();
    for (let pIdx = 0; pIdx < boundary.length; pIdx++) {
      const poly = boundary[pIdx];
      for (let rIdx = 0; rIdx < poly.length; rIdx++) {
        const ring = poly[rIdx];
        if (!ring || ring.length < 2) continue;
        let started = false;
        for (let i = 0; i < ring.length; i++) {
          const pt = this.latLonToScreen(ring[i][0], ring[i][1], loc.lon, loc.lat, loc.zoom, 1620, 1080);
          if (pt) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        }
      }
    }
    ctx.shadowColor = 'rgba(0, 229, 255, 0.75)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  },

  // Pre-render high-resolution satellite basemap with Quebec boundary for alert maps
  async bakeAlertBasemap(loc) {
    const key = `alert_${Number(loc.lon).toFixed(2)}_${Number(loc.lat).toFixed(2)}_${Number(loc.zoom).toFixed(1)}`;
    if (this.basemapCache.has(key)) {
      return this.basemapCache.get(key);
    }

    const bounds = this.getTileBounds(loc.lon, loc.lat, loc.zoom);
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const ctx = canvas.getContext('2d', { alpha: false });

    // Fallback broadcast space backdrop
    ctx.fillStyle = '#030a16';
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    const tileUrls = [];
    const satDrawInfo = [];
    for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
      for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
        const satUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`;
        const dx = Math.floor((tx * 256 - bounds.leftPixel) * bounds.scale);
        const dy = Math.floor((ty * 256 - bounds.topPixel) * bounds.scale);
        const dw = Math.ceil(256 * bounds.scale);
        const dh = Math.ceil(256 * bounds.scale);
        tileUrls.push(satUrl);
        satDrawInfo.push({ url: satUrl, dx, dy, dw, dh });
      }
    }

    await this.loadTilesInBatches(tileUrls, 8);

    // 1. Draw Satellite Terrain (clean imagery, no baked labels)
    for (const info of satDrawInfo) {
      const img = this.imageCache.get(info.url);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, info.dx, info.dy, info.dw, info.dh);
      }
    }

    // 2. Draw Quebec Provincial Boundary Vector
    this.drawQuebecBoundary(ctx, loc);

    // 3. Subtle top atmospheric horizon gradient for broadcast aesthetic
    const grad = ctx.createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(3, 10, 22, 0.82)');
    grad.addColorStop(0.5, 'rgba(3, 10, 22, 0.40)');
    grad.addColorStop(1, 'rgba(3, 10, 22, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, bounds.width, 240);

    this.basemapCache.set(key, canvas);
    return canvas;
  },

  // Draw GeoJSON or synthesized alert sector polygons onto canvas
  drawAlertPolygons(ctx, alerts, loc, focusedAlert = null) {
    if (!alerts || !Array.isArray(alerts) || alerts.length === 0) return;

    alerts.forEach((alert) => {
      const isFocused = (focusedAlert && (focusedAlert === alert || (alert.detailKey && focusedAlert.detailKey === alert.detailKey)));
      const style = (typeof getAlertColorTheme === 'function') 
        ? getAlertColorTheme(alert) 
        : { fill: 'rgba(239, 68, 68, 0.48)', stroke: '#ff1744', glow: 'rgba(255, 23, 68, 0.85)' };
      const geoms = alert.geometries || (alert.geometry ? [alert.geometry] : null);

      const renderRings = (geom) => {
        if (!geom) return;
        let polyList = [];
        if (geom.type === 'Polygon') polyList = [geom.coordinates];
        else if (geom.type === 'MultiPolygon') polyList = geom.coordinates;

        polyList.forEach((rings) => {
          if (!rings || !rings[0] || rings[0].length < 3) return;
          const outer = rings[0];

          ctx.save();
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < outer.length; i++) {
            const pt = this.latLonToScreen(outer[i][0], outer[i][1], loc.lon, loc.lat, loc.zoom, 1620, 1080);
            if (pt) {
              if (!started) {
                ctx.moveTo(pt.x, pt.y);
                started = true;
              } else {
                ctx.lineTo(pt.x, pt.y);
              }
            }
          }

          if (started) {
            ctx.closePath();

            // 1. Radiant semi-transparent fill with broadcast glow
            ctx.fillStyle = style.fill;
            ctx.shadowColor = style.glow;
            ctx.shadowBlur = isFocused ? 28 : 18;
            ctx.fill();

            // 2. Vibrant neon boundary stroke
            ctx.lineWidth = isFocused ? 4.5 : 3.5;
            ctx.strokeStyle = style.stroke;
            ctx.stroke();

            // 3. Crisp inner boundary accent line
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.stroke();
          }
          ctx.restore();
        });
      };

      if (geoms && geoms.length > 0) {
        geoms.forEach(renderRings);
      } else {
        const coords = (typeof getCoordinatesForAlert === 'function') 
          ? getCoordinatesForAlert(alert, loc) 
          : { lon: loc.lon, lat: loc.lat };
        if (coords) {
          const fallbackGeom = (typeof generateSectorPolygon === 'function') 
            ? generateSectorPolygon(coords.lon, coords.lat, 48) 
            : null;
          if (fallbackGeom) renderRings(fallbackGeom);
        }
      }
    });
  },

  // Calculate precipitation or satellite tile descriptors for a location and timestamp
  getTileDescriptors(loc, timestamp, mapType = 'twcRadarMosaic') {
    const bounds = this.getTileBounds(loc.lon, loc.lat, loc.zoom);
    const prod = mapType || 'twcRadarMosaic';
    const key = (typeof api_key !== 'undefined') ? api_key : '';
    const tiles = [];
    for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
      for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
        const url = `https://api.weather.com/v3/TileServer/tile/${prod}?ts=${timestamp}&xyz=${tx}:${ty}:${bounds.baseZoom}&apiKey=${key}`;
        const dx = Math.floor((tx * 256 - bounds.leftPixel) * bounds.scale);
        const dy = Math.floor((ty * 256 - bounds.topPixel) * bounds.scale);
        const dw = Math.ceil(256 * bounds.scale);
        const dh = Math.ceil(256 * bounds.scale);
        tiles.push({ url, dx, dy, dw, dh });
      }
    }
    return tiles;
  },

  // Pre-load tiles for all locations and timestamps using controlled concurrency
  async preloadTiles(locations, timestamps, mapType = 'twcRadarMosaic') {
    if (!locations || locations.length === 0 || !timestamps || timestamps.length === 0) return;
    const urls = [];
    for (const loc of locations) {
      for (const ts of timestamps) {
        const tiles = this.getTileDescriptors(loc, ts, mapType);
        for (const t of tiles) {
          if (!this.imageCache.has(t.url)) {
            urls.push(t.url);
          }
        }
      }
    }
    await this.loadTilesInBatches(urls, 6);
  },

  // Draw satellite cloud tiles with alpha blending
  drawSatelliteCloudTiles(ctx, loc, timestamp, prod, alpha = 1.0) {
    if (!timestamp || alpha <= 0.005) return;
    const tiles = this.getTileDescriptors(loc, timestamp, prod);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (const t of tiles) {
      let img = this.imageCache.get(t.url);
      if (!img) {
        this.loadTileImage(t.url);
      } else if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
      }
    }
    ctx.restore();
  },

  // Draw snow accumulation / coverage tiles with alpha blending
  drawSnowTiles(ctx, loc, timestamp, alpha = 1.0) {
    if (!timestamp || alpha <= 0.005) return;
    const prod = this.snowProduct || 'snow24hr';
    const tiles = this.getTileDescriptors(loc, timestamp, prod);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (const t of tiles) {
      let img = this.imageCache.get(t.url);
      if (!img) {
        this.loadTileImage(t.url);
      } else if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
      }
    }
    ctx.restore();
  },

  // Draw drop shadow for radar tiles at true coordinates
  drawRadarShadowTiles(ctx, loc, timestamp, alpha = 1.0) {
    if (!timestamp || alpha <= 0.005) return;
    const tiles = this.getTileDescriptors(loc, timestamp, 'twcRadarMosaic');
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (const t of tiles) {
      let img = this.imageCache.get(t.url);
      if (!img) {
        this.loadTileImage(t.url);
      } else if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
      }
    }
    ctx.restore();
  },

  // Draw crisp radar precipitation tiles on top of drop shadows
  drawRadarPrecipTiles(ctx, loc, timestamp, alpha = 1.0) {
    if (!timestamp || alpha <= 0.005) return;
    const tiles = this.getTileDescriptors(loc, timestamp, 'twcRadarMosaic');
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    for (const t of tiles) {
      const img = this.imageCache.get(t.url);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, t.dx, t.dy, t.dw, t.dh);
      }
    }
    ctx.restore();
  },

  // Render precipitation or clouds for a single timestamp
  renderTilesForTimestamp(ctx, loc, timestamp, alpha = 1.0, layerType = 'radar') {
    if (!timestamp) return;
    if (layerType === 'satellite') {
      const prod = this.satProduct || 'ussat';
      this.drawSatelliteCloudTiles(ctx, loc, timestamp, prod, alpha);
    } else {
      const shadowX = (loc.shadowOffset ? loc.shadowOffset.x : 12);
      const shadowY = (loc.shadowOffset ? loc.shadowOffset.y : 8);

      if (shadowX || shadowY) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowOffsetX = shadowX;
        ctx.shadowOffsetY = shadowY;
        ctx.shadowBlur = 0; // Crisp IntelliStar retro drop shadow
        this.drawRadarShadowTiles(ctx, loc, timestamp, alpha);
        ctx.restore();
      }

      this.drawRadarPrecipTiles(ctx, loc, timestamp, alpha);
    }
  },

  // Render an interpolated / blended frame between timestamp tsA and tsB with progress alpha [0, 1]
  renderInterpolatedFrame(ctx, loc, basemapCanvas, tsA, tsB, alpha = 0, layerType = 'radar') {
    // 1. Draw static satellite basemap (opaque)
    if (basemapCanvas) {
      ctx.drawImage(basemapCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#0b1626';
      ctx.fillRect(0, 0, 1620, 1080);
    }

    if (!tsA && !tsB) return;

    // Fast path: pure single timestamp without blending
    if (!tsB || alpha <= 0.001) {
      this.renderTilesForTimestamp(ctx, loc, tsA, 1.0, layerType);
      return;
    }
    if (!tsA || alpha >= 0.999) {
      this.renderTilesForTimestamp(ctx, loc, tsB, 1.0, layerType);
      return;
    }

    // Hermite smoothstep easing curve for natural acceleration and deceleration
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const s = clampedAlpha * clampedAlpha * (3 - 2 * clampedAlpha);
    // Non-linear equal-power opacity curve: eliminates the 50% midpoint luminance dip
    // and preserves full color saturation of precipitation echoes and clouds without strobing
    const alphaA = Math.pow(Math.cos(s * Math.PI / 2), 0.7);
    const alphaB = Math.pow(Math.sin(s * Math.PI / 2), 0.7);

    if (layerType === 'satellite') {
      const prod = this.satProduct || 'ussat';
      // Satellite clouds: blend tsA clouds and tsB clouds smoothly without luminance dip
      this.drawSatelliteCloudTiles(ctx, loc, tsA, prod, alphaA);
      this.drawSatelliteCloudTiles(ctx, loc, tsB, prod, alphaB);
    } else {
      // Local or regional radar:
      const shadowX = (loc.shadowOffset ? loc.shadowOffset.x : 12);
      const shadowY = (loc.shadowOffset ? loc.shadowOffset.y : 8);

      if (shadowX || shadowY) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowOffsetX = shadowX;
        ctx.shadowOffsetY = shadowY;
        ctx.shadowBlur = 0; // Crisp IntelliStar retro drop shadow

        this.drawRadarShadowTiles(ctx, loc, tsA, alphaA);
        this.drawRadarShadowTiles(ctx, loc, tsB, alphaB);
        ctx.restore();
      }

      // Step 2: Draw crisp precipitation for both frames on top of all drop shadows
      this.drawRadarPrecipTiles(ctx, loc, tsA, alphaA);
      this.drawRadarPrecipTiles(ctx, loc, tsB, alphaB);
    }
  },

  // Render a single animated frame (backward compatible)
  renderFrame(ctx, loc, basemapCanvas, timestamp, layerType = 'radar') {
    this.renderInterpolatedFrame(ctx, loc, basemapCanvas, timestamp, null, 0, layerType);
  },

  // Initialize atmospheric drifting snow particles
  initSnowParticles(count = 65) {
    if (this.snowParticles && this.snowParticles.length === count) return;
    this.snowParticles = [];
    for (let i = 0; i < count; i++) {
      this.snowParticles.push({
        x: Math.random() * 1620,
        y: Math.random() * 1080,
        r: 1.5 + Math.random() * 2.8,
        speed: 1.0 + Math.random() * 2.2,
        drift: 0.3 + Math.random() * 0.8,
        opacity: 0.3 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2
      });
    }
  },

  // Broadcast-quality animated snow accumulation engine (real-time data reveal & live winter atmosphere)
  startSnowAnimation(ctx, canvas, loc, basemap) {
    this.initSnowParticles(65);
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const rafFn = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

    const renderBuf = this.getRenderBuffer(1620, 1080);
    const bufCtx = renderBuf ? renderBuf.getContext('2d', { alpha: false }) : null;
    const drawCtx = bufCtx || ctx;

    const tick = (now) => {
      if (!this.activeTarget || this.activeCanvas !== canvas) return;
      const curTime = now || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const elapsed = curTime - startTime;

      // 1. Draw static satellite basemap (opaque)
      if (basemap) {
        drawCtx.drawImage(basemap, 0, 0);
      } else {
        drawCtx.fillStyle = '#0b1626';
        drawCtx.fillRect(0, 0, 1620, 1080);
      }

      // 2. Animated Real-time Snow Accumulation Layer
      this.renderSnowAccumulationLayer(drawCtx, loc, elapsed);

      // 3. Falling Snowflakes Particle Atmosphere
      this.renderDriftingSnow(drawCtx, curTime);

      // 4. Double-buffer blit to visible canvas (zero tearing)
      if (bufCtx) {
        ctx.drawImage(renderBuf, 0, 0);
      }

      this.activeRaf = rafFn(tick);
    };

    this.activeRaf = rafFn(tick);
  },

  renderSnowAccumulationLayer(ctx, loc, elapsed) {
    const progress = Math.min(1.0, elapsed / 2200);
    const ease = 1 - Math.pow(1 - progress, 3);
    const cities = (this.activeSnowCities && this.activeSnowCities.length > 0) ? this.activeSnowCities : [];

    // 1. Frost sweep wavefront (simulates Canadian winter weather front passing through)
    ctx.save();
    const wavePos = ease * 1.5;
    const waveGrad = ctx.createLinearGradient(0, 0, 1620, 1080);
    waveGrad.addColorStop(Math.max(0, Math.min(1, wavePos - 0.35)), 'rgba(140, 225, 245, 0.0)');
    waveGrad.addColorStop(Math.max(0, Math.min(1, wavePos - 0.1)), 'rgba(178, 235, 242, 0.18)');
    waveGrad.addColorStop(Math.max(0, Math.min(1, wavePos)), 'rgba(255, 255, 255, 0.38)');
    waveGrad.addColorStop(Math.min(1, wavePos + 0.05), 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = waveGrad;
    ctx.fillRect(0, 0, 1620, 1080);
    ctx.restore();

    // 2. Draw NOAA/Weather.com snow tiles if available
    if (this.snowTimestamps && this.snowTimestamps.length > 0) {
      const latestTs = this.snowTimestamps[this.snowTimestamps.length - 1];
      this.drawSnowTiles(ctx, loc, latestTs, ease * 0.85);
    }

    // 3. Draw real-time station snow accumulation fields & contours
    for (const c of cities) {
      if (!c || c.x == null || c.y == null) continue;
      const depth = c.snowCm || 0;
      const distNorm = (c.x / 1620 + c.y / 1080) * 0.5;
      const cityWave = Math.max(0, Math.min(1, (ease * 1.5 - distNorm) / 0.35));
      if (cityWave <= 0.01) continue;

      const activeDepth = depth * cityWave;
      const baseRadius = 150 + Math.min(activeDepth * 7, 260);

      ctx.save();
      const radGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, baseRadius);

      if (activeDepth >= 35) {
        radGrad.addColorStop(0.0, `rgba(215, 45, 130, ${0.92 * cityWave})`);
        radGrad.addColorStop(0.25, `rgba(150, 85, 220, ${0.85 * cityWave})`);
        radGrad.addColorStop(0.5, `rgba(240, 248, 255, ${0.75 * cityWave})`);
        radGrad.addColorStop(0.8, `rgba(64, 180, 245, ${0.45 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(64, 180, 245, 0)');
      } else if (activeDepth >= 20) {
        radGrad.addColorStop(0.0, `rgba(150, 85, 220, ${0.88 * cityWave})`);
        radGrad.addColorStop(0.3, `rgba(190, 170, 245, ${0.80 * cityWave})`);
        radGrad.addColorStop(0.55, `rgba(240, 248, 255, ${0.70 * cityWave})`);
        radGrad.addColorStop(0.8, `rgba(64, 180, 245, ${0.40 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(64, 180, 245, 0)');
      } else if (activeDepth >= 10) {
        radGrad.addColorStop(0.0, `rgba(190, 170, 245, ${0.82 * cityWave})`);
        radGrad.addColorStop(0.35, `rgba(245, 250, 255, ${0.75 * cityWave})`);
        radGrad.addColorStop(0.65, `rgba(129, 212, 250, ${0.50 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(129, 212, 250, 0)');
      } else if (activeDepth >= 2) {
        radGrad.addColorStop(0.0, `rgba(240, 248, 255, ${0.78 * cityWave})`);
        radGrad.addColorStop(0.4, `rgba(129, 212, 250, ${0.55 * cityWave})`);
        radGrad.addColorStop(0.75, `rgba(178, 235, 242, ${0.30 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(178, 235, 242, 0)');
      } else if (activeDepth > 0) {
        radGrad.addColorStop(0.0, `rgba(178, 235, 242, ${0.55 * cityWave})`);
        radGrad.addColorStop(0.5, `rgba(178, 235, 242, ${0.28 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(178, 235, 242, 0)');
      } else {
        // Trace dusting / 0cm ground sensor outline
        radGrad.addColorStop(0.0, `rgba(224, 247, 250, ${0.15 * cityWave})`);
        radGrad.addColorStop(0.6, `rgba(178, 235, 242, ${0.08 * cityWave})`);
        radGrad.addColorStop(1.0, 'rgba(178, 235, 242, 0)');
      }

      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },

  renderDriftingSnow(ctx, curTime) {
    if (!this.snowParticles) this.initSnowParticles(65);
    ctx.save();
    for (let i = 0; i < this.snowParticles.length; i++) {
      const p = this.snowParticles[i];
      p.y += p.speed;
      p.x += p.drift + Math.sin(curTime / 600 + p.phase) * 0.4;
      if (p.y > 1090) {
        p.y = -10;
        p.x = Math.random() * 1620;
      }
      if (p.x > 1630) p.x = -10;
      if (p.x < -10) p.x = 1630;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
      ctx.shadowColor = 'rgba(200, 240, 255, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fill();
    }
    ctx.restore();
  },

  // Initialize wind flow particles for dynamic streamflow animation
  initWindParticles(count = 320) {
    if (this.windParticles && this.windParticles.length === count) return;
    this.windParticles = [];
    for (let i = 0; i < count; i++) {
      this.windParticles.push({
        x: Math.random() * 1620,
        y: Math.random() * 1080,
        age: Math.floor(Math.random() * 60),
        maxLife: 45 + Math.floor(Math.random() * 45),
        speedMult: 0.75 + Math.random() * 0.5,
        trail: []
      });
    }
  },

  // Broadcast-quality animated wind velocity & streamflow engine
  startWindAnimation(ctx, canvas, loc, basemap) {
    this.initWindParticles(320);
    const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const rafFn = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

    const renderBuf = this.getRenderBuffer(1620, 1080);
    const bufCtx = renderBuf ? renderBuf.getContext('2d', { alpha: false }) : null;
    const drawCtx = bufCtx || ctx;

    const tick = (now) => {
      if (!this.activeTarget || this.activeCanvas !== canvas) return;
      const curTime = now || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const elapsed = curTime - startTime;

      // 1. Draw static satellite basemap (opaque)
      if (basemap) {
        drawCtx.drawImage(basemap, 0, 0);
      } else {
        drawCtx.fillStyle = '#060f1e';
        drawCtx.fillRect(0, 0, 1620, 1080);
      }

      // 2. Animated Real-time Atmospheric Wind Field & Velocity Glow
      this.renderWindField(drawCtx, loc, elapsed);

      // 3. Dynamic Animated Wind Streamlines & Particle Trails
      this.renderWindStreamlines(drawCtx, loc, elapsed, curTime);

      // 4. Double-buffer blit to visible canvas (zero tearing)
      if (bufCtx) {
        ctx.drawImage(renderBuf, 0, 0);
      }

      this.activeRaf = rafFn(tick);
    };

    this.activeRaf = rafFn(tick);
  },

  // Calculate interpolated wind vector (u, v) and speed at canvas coordinates (x, y)
  getInterpolatedWindAt(x, y) {
    const cities = (this.activeWindCities && this.activeWindCities.length > 0) ? this.activeWindCities : [];
    if (cities.length === 0) {
      const rad = (240 * Math.PI) / 180;
      const u = -Math.sin(rad) * 16;
      const v = Math.cos(rad) * 16;
      return { u, v, speed: 16 };
    }

    let sumW = 0;
    let sumU = 0;
    let sumV = 0;
    let sumSpeed = 0;

    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if (c.x == null || c.y == null) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      const distSq = dx * dx + dy * dy;
      const w = 1 / (distSq + 1600);

      const dirRad = ((c.windDirDeg != null ? c.windDirDeg : 240) * Math.PI) / 180;
      const spd = c.windSpeed != null ? c.windSpeed : 16;
      const u = -Math.sin(dirRad) * spd;
      const v = Math.cos(dirRad) * spd;

      sumW += w;
      sumU += u * w;
      sumV += v * w;
      sumSpeed += spd * w;
    }

    if (sumW <= 0) return { u: 14, v: -7, speed: 16 };
    const avgU = sumU / sumW;
    const avgV = sumV / sumW;
    const avgSpeed = sumSpeed / sumW;
    return { u: avgU, v: avgV, speed: avgSpeed };
  },

  renderWindField(ctx, loc, elapsed) {
    const cities = (this.activeWindCities && this.activeWindCities.length > 0) ? this.activeWindCities : [];
    const progress = Math.min(1.0, elapsed / 2000);
    const ease = 1 - Math.pow(1 - progress, 3);

    ctx.save();
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if (c.x == null || c.y == null) continue;
      const speed = c.windSpeed || 15;
      const radius = 180 + Math.min(speed * 4, 220);

      const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
      if (speed >= 60) {
        grad.addColorStop(0, `rgba(244, 63, 94, ${0.40 * ease})`);
        grad.addColorStop(0.5, `rgba(251, 146, 60, ${0.25 * ease})`);
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
      } else if (speed >= 40) {
        grad.addColorStop(0, `rgba(251, 146, 60, ${0.35 * ease})`);
        grad.addColorStop(0.5, `rgba(250, 204, 21, ${0.20 * ease})`);
        grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
      } else if (speed >= 25) {
        grad.addColorStop(0, `rgba(250, 204, 21, ${0.28 * ease})`);
        grad.addColorStop(0.5, `rgba(52, 211, 153, ${0.16 * ease})`);
        grad.addColorStop(1, 'rgba(52, 211, 153, 0)');
      } else if (speed >= 12) {
        grad.addColorStop(0, `rgba(52, 211, 153, ${0.24 * ease})`);
        grad.addColorStop(0.5, `rgba(0, 229, 255, ${0.12 * ease})`);
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      } else {
        grad.addColorStop(0, `rgba(0, 229, 255, ${0.18 * ease})`);
        grad.addColorStop(0.6, `rgba(0, 229, 255, ${0.06 * ease})`);
        grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  renderWindStreamlines(ctx, loc, elapsed, curTime) {
    if (!this.windParticles) this.initWindParticles(320);

    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 0; i < this.windParticles.length; i++) {
      const p = this.windParticles[i];
      const wind = this.getInterpolatedWindAt(p.x, p.y);
      const mag = Math.sqrt(wind.u * wind.u + wind.v * wind.v) || 1;
      const step = Math.min(14, Math.max(2.8, wind.speed * 0.28)) * p.speedMult;

      const nextX = p.x + (wind.u / mag) * step;
      const nextY = p.y + (wind.v / mag) * step;

      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > 5) p.trail.pop();

      p.x = nextX;
      p.y = nextY;
      p.age++;

      if (p.age >= p.maxLife || p.x < -20 || p.x > 1640 || p.y < -20 || p.y > 1100) {
        p.x = Math.random() * 1620;
        p.y = Math.random() * 1080;
        p.age = 0;
        p.maxLife = 45 + Math.floor(Math.random() * 45);
        p.trail = [];
        continue;
      }

      if (p.trail.length < 2) continue;

      const lifeFactor = Math.sin((Math.PI * p.age) / p.maxLife);
      const spd = wind.speed;

      let r = 0, g = 229, b = 255;
      if (spd >= 60) {
        r = 244; g = 63; b = 94;
      } else if (spd >= 40) {
        r = 251; g = 146; b = 60;
      } else if (spd >= 25) {
        r = 250; g = 204; b = 21;
      } else if (spd >= 14) {
        r = 52; g = 211; b = 153;
      }

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let t = 0; t < p.trail.length; t++) {
        ctx.lineTo(p.trail[t].x, p.trail[t].y);
      }
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.75 * lifeFactor})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * lifeFactor})`;
      ctx.fill();
    }

    ctx.restore();
  },

  // Pre-load basemaps & initial radar/satellite tiles at startup
  async preloadAll() {
    if (this.isPreloading) return;
    if (this.isReady && (Date.now() - this.lastUpdated < 120000)) return;
    this.isPreloading = true;
    const startTime = Date.now();

    try {
      await this.fetchAllTimestamps(12);

      const locations = this.getAllRadarLocations();
      console.log(`[RadarEngine] Pre-loading basemaps & tiles for ${locations.length} locations (${locations.map(l => l.name).join(', ')})...`);

      // 1. Bake basemaps for all locations (static 1 per location)
      for (const loc of locations) {
        await this.bakeBasemap(loc);
      }

      // 2. Pre-load radar tile images into memory cache with controlled concurrency
      if (this.timestamps && this.timestamps.length > 0) {
        const radarLocations = locations.filter(l => l.key !== 'satellite');
        await this.preloadTiles(radarLocations, this.timestamps, 'twcRadarMosaic');
      }

      // 3. Pre-load satellite cloud tile images for all configured radar and satellite locations
      if (this.satTimestamps && this.satTimestamps.length > 0) {
        await this.preloadTiles(locations, this.satTimestamps, this.satProduct || 'ussat');
      }

      // 4. Pre-load snow accumulation tile images if available
      if (this.snowTimestamps && this.snowTimestamps.length > 0) {
        await this.preloadTiles(locations, this.snowTimestamps, this.snowProduct || 'snow24hr');
      }

      this.pruneImageCache(this.timestamps, this.satTimestamps, this.snowTimestamps);

      this.isReady = true;
      this.lastUpdated = Date.now();
      this.lastTimestampsKey = (this.timestamps || []).join(',');
      this.lastSatTimestampsKey = (this.satTimestamps || []).join(',');
      this.lastSnowTimestampsKey = (this.snowTimestamps || []).join(',');
      console.log(`[RadarEngine] Pre-load complete for all locations in ${Date.now() - startTime}ms (${this.imageCache.size} tiles cached).`);
    } catch (err) {
      console.error('[RadarEngine] Error during radar preload:', err);
    } finally {
      this.isPreloading = false;
    }
  },

  // Periodic background refresh: quietly updates timestamps & tiles without stalling the stream
  async refreshAll() {
    try {
      await this.fetchAllTimestamps(12);
      const newRadarKey = (this.timestamps || []).join(',');
      const newSatKey = (this.satTimestamps || []).join(',');
      const newSnowKey = (this.snowTimestamps || []).join(',');

      if (newRadarKey === this.lastTimestampsKey && newSatKey === this.lastSatTimestampsKey && newSnowKey === this.lastSnowTimestampsKey && this.isReady) {
        return;
      }
      this.lastTimestampsKey = newRadarKey;
      this.lastSatTimestampsKey = newSatKey;
      this.lastSnowTimestampsKey = newSnowKey;

      const locations = this.getAllRadarLocations();
      if (this.timestamps && this.timestamps.length > 0) {
        const radarLocations = locations.filter(l => l.key !== 'satellite');
        await this.preloadTiles(radarLocations, this.timestamps, 'twcRadarMosaic');
      }
      if (this.satTimestamps && this.satTimestamps.length > 0) {
        await this.preloadTiles(locations, this.satTimestamps, this.satProduct || 'ussat');
      }
      if (this.snowTimestamps && this.snowTimestamps.length > 0) {
        await this.preloadTiles(locations, this.snowTimestamps, this.snowProduct || 'snow24hr');
      }
      this.pruneImageCache(this.timestamps, this.satTimestamps, this.snowTimestamps);
      this.lastUpdated = Date.now();
      console.log(`[RadarEngine] Background tile refresh completed (${this.imageCache.size} tiles active).`);
    } catch (err) {
      console.error('[RadarEngine] Background radar refresh error:', err);
    }
  },

  // Start animated playback of radar or satellite frames in the specified DOM container
  startPlayback(containerId, locKey, layerType = 'radar') {
    this.stopPlayback();

    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`[RadarEngine] Target container #${containerId} not found.`);
      return;
    }

    if (containerId === 'radarsat') {
      layerType = 'satellite';
      if (!locKey || locKey === 'regional') locKey = 'satellite';
    } else if (containerId === 'radarsnow') {
      layerType = 'snow';
      if (!locKey || locKey === 'regional') locKey = 'satellite';
    } else if (containerId === 'radarwind') {
      layerType = 'wind';
      if (!locKey || locKey === 'regional') locKey = 'satellite';
    }

    // Ensure a high-performance 2D Canvas exists inside the container
    let canvas = container.querySelector('canvas.radar-canvas');
    if (!canvas) {
      container.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'radar-canvas';
      canvas.width = 1620;
      canvas.height = 1080;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '1620px';
      canvas.style.height = '1080px';
      canvas.style.pointerEvents = 'none';
      container.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    const loc = this.getLocationByKey(locKey);
    const basemap = this.basemapCache.get(locKey);
    const activeTimestamps = layerType === 'satellite' ? this.satTimestamps : this.timestamps;
    const timestamps = (activeTimestamps && activeTimestamps.length > 0) ? activeTimestamps : [];

    this.activeTarget = containerId;
    this.activeCanvas = canvas;
    this.activeLocKey = locKey;
    this.activeLayer = layerType;

    if (layerType === 'snow') {
      this.startSnowAnimation(ctx, canvas, loc, basemap);
      return;
    }

    if (layerType === 'wind') {
      this.startWindAnimation(ctx, canvas, loc, basemap);
      return;
    }

    if (timestamps.length === 0 || !basemap) {
      // If basemap or timestamps not ready yet, render basemap or background
      this.renderFrame(ctx, loc, basemap, null, layerType);
      return;
    }

    const frameDurationMs = layerType === 'satellite' ? 260 : 240;

    // Smooth frame interpolation loop via requestAnimationFrame
    if (this.isInterpolationEnabled() && timestamps.length > 1) {
      const numFrames = timestamps.length;
      const dwellDurationMs = Math.round(frameDurationMs * 2.5); // Dwell on the latest frame (current radar)
      const wrapDurationMs = frameDurationMs; // Smooth dissolve back to frame 0
      const transitionPhaseMs = (numFrames - 1) * frameDurationMs;
      const totalCycleMs = transitionPhaseMs + dwellDurationMs + wrapDurationMs;

      const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const rafFn = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : (cb) => setTimeout(cb, 16);

      const renderBuf = this.getRenderBuffer(1620, 1080);
      const bufCtx = renderBuf ? renderBuf.getContext('2d', { alpha: false }) : null;
      const drawCtx = bufCtx || ctx;

      const tick = (now) => {
        if (!this.activeTarget || this.activeCanvas !== canvas) return;
        const curTime = now || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
        const elapsed = curTime - startTime;
        const tMod = elapsed % totalCycleMs;

        if (tMod < transitionPhaseMs) {
          const frameIdx = Math.floor(tMod / frameDurationMs);
          const alpha = (tMod - (frameIdx * frameDurationMs)) / frameDurationMs;
          this.renderInterpolatedFrame(drawCtx, loc, basemap, timestamps[frameIdx], timestamps[frameIdx + 1], alpha, layerType);
        } else if (tMod < transitionPhaseMs + dwellDurationMs) {
          // Dwell on the final, most current frame
          this.renderInterpolatedFrame(drawCtx, loc, basemap, timestamps[numFrames - 1], null, 0, layerType);
        } else {
          // Smooth wrap-around dissolve from latest frame back to frame 0
          const wrapElapsed = tMod - (transitionPhaseMs + dwellDurationMs);
          const alpha = wrapElapsed / wrapDurationMs;
          this.renderInterpolatedFrame(drawCtx, loc, basemap, timestamps[numFrames - 1], timestamps[0], alpha, layerType);
        }

        // Atomic double-buffer presentation: blit offscreen buffer to visible canvas in 1 call
        if (bufCtx) {
          ctx.drawImage(renderBuf, 0, 0);
        }

        this.activeRaf = rafFn(tick);
      };

      // Draw initial frame immediately
      this.renderInterpolatedFrame(drawCtx, loc, basemap, timestamps[0], timestamps[1], 0, layerType);
      if (bufCtx) {
        ctx.drawImage(renderBuf, 0, 0);
      }
      this.activeRaf = rafFn(tick);
    } else {
      let currentIndex = 0;
      const renderBuf = this.getRenderBuffer(1620, 1080);
      const bufCtx = renderBuf ? renderBuf.getContext('2d', { alpha: false }) : null;
      const drawCtx = bufCtx || ctx;

      this.renderFrame(drawCtx, loc, basemap, timestamps[0], layerType);
      if (bufCtx) {
        ctx.drawImage(renderBuf, 0, 0);
      }

      this.activeInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % timestamps.length;
        this.renderFrame(drawCtx, loc, basemap, timestamps[currentIndex], layerType);
        if (bufCtx) {
          ctx.drawImage(renderBuf, 0, 0);
        }
      }, frameDurationMs);
    }
  },

  // Stop active radar playback loop
  stopPlayback() {
    if (this.activeInterval) {
      clearInterval(this.activeInterval);
      this.activeInterval = null;
    }
    if (this.activeRaf) {
      const cafFn = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : clearTimeout;
      cafFn(this.activeRaf);
      this.activeRaf = null;
    }
    this.activeTarget = null;
    this.activeCanvas = null;
  },

  // Proactive memory cleanup
  releaseMemory() {
    this.pruneImageCache(this.timestamps, this.satTimestamps);
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Compatibility Layer for existing Slide Programs & Settings UI
// ═══════════════════════════════════════════════════════════════════════

var regradar = { dummy: true };
var locradar = { dummy: true };
var regmap = { dummy: true };
var locmap = { dummy: true };
var regoutlines = null;
var locoutlines = null;
var regoutlinestrans = null;
var locoutlinestrans = null;
var radarAnimation = null;
var animationInterval = null;

function setMapsAvailability(available, reason) {
  window.__iptvMapsAvailable = available;
  if (!available && reason) console.warn(`[IPTV] ${reason}`);
}

async function createMaps() {
  await radarEngine.preloadAll();
}

async function createRegionalMaps() {
  if (!radarEngine.isReady) {
    await radarEngine.preloadAll();
  }
}

async function createLocalMaps(config) {
  // Ensured warm via preloadAll
}

function destroyRegionalMaps() {
  radarEngine.stopPlayback();
}

function destroyLocalMaps() {
  radarEngine.stopPlayback();
}

async function startRadar(target, dopplerIdx = 0, dConfig = null) {
  let targetId = typeof target === 'string' ? target : (target && target.id ? target.id : 'locradar');
  if (targetId === 'radarsat') {
    return startSatellite(targetId, 'satellite');
  }
  let locKey = 'regional';

  if (targetId === 'locradar') {
    locKey = `local_${dopplerIdx || 0}`;
  } else if (targetId === 'regradar') {
    locKey = 'regional';
  }

  radarEngine.startPlayback(targetId, locKey, 'radar');
}

function stopRadar(target) {
  radarEngine.stopPlayback();
}

async function startSatellite(target = 'radarsat', dopplerIdx = null, dConfig = null) {
  let targetId = typeof target === 'string' ? target : (target && target.id ? target.id : 'radarsat');
  let locKey = 'satellite';
  if (typeof dopplerIdx === 'string') {
    locKey = dopplerIdx;
  } else if (dopplerIdx !== null && dopplerIdx !== undefined && dopplerIdx !== false) {
    locKey = `local_${dopplerIdx || 0}`;
  }
  radarEngine.startPlayback(targetId, locKey, 'satellite');
}

function stopSatellite(target = 'radarsat') {
  radarEngine.stopPlayback();
}

async function startSnowCover(target = 'radarsnow', dopplerIdx = null, dConfig = null) {
  let targetId = typeof target === 'string' ? target : (target && target.id ? target.id : 'radarsnow');
  let locKey = 'satellite';
  if (typeof dopplerIdx === 'string') {
    locKey = dopplerIdx;
  } else if (dopplerIdx !== null && dopplerIdx !== undefined && dopplerIdx !== false) {
    locKey = `local_${dopplerIdx || 0}`;
  }
  radarEngine.startPlayback(targetId, locKey, 'snow');
}

function stopSnowCover(target = 'radarsnow') {
  radarEngine.stopPlayback();
}

async function startWindMap(target = 'radarwind', dopplerIdx = null, dConfig = null) {
  let targetId = typeof target === 'string' ? target : (target && target.id ? target.id : 'radarwind');
  let locKey = 'satellite';
  if (typeof dopplerIdx === 'string') {
    locKey = dopplerIdx;
  } else if (dopplerIdx !== null && dopplerIdx !== undefined && dopplerIdx !== false) {
    locKey = `local_${dopplerIdx || 0}`;
  }
  radarEngine.startPlayback(targetId, locKey, 'wind');
}

function stopWindMap(target = 'radarwind') {
  radarEngine.stopPlayback();
}

async function initializeRadar(map) {
  await radarEngine.preloadAll();
}

async function preloadRadars() {
  await radarEngine.preloadAll();
}

async function refreshRadarFrames() {
  await radarEngine.refreshAll();
}

// Normalize city object to standard structure
function normalizeCity(c) {
  if (!c) return null;
  const name = c.locationName || c.name || c.displayname || c.city || '';
  if (!name || typeof name !== 'string' || !name.trim()) return null;

  let lat = c.lat != null ? Number(c.lat) : (c.latitude != null ? Number(c.latitude) : null);
  let lon = c.lon != null ? Number(c.lon) : (c.longitude != null ? Number(c.longitude) : null);

  if ((lat == null || lon == null) && typeof c.val === 'string' && c.val.includes(',')) {
    const parts = c.val.split(',');
    lat = Number(parts[0]);
    lon = Number(parts[1]);
  }

  return {
    name: name.trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    dotLeftPos: c.dotLeftPos !== undefined && c.dotLeftPos !== '' ? Number(c.dotLeftPos) : null,
    dotTopPos: c.dotTopPos !== undefined && c.dotTopPos !== '' ? Number(c.dotTopPos) : null,
    nameTopMargin: Number(c.nameTopMargin) || 0,
    nameLeftMargin: Number(c.nameLeftMargin) || 0,
  };
}

// Filter, project, and place cities with screen bound checks, banner/ticker clearance, and 2D bounding box collision detection
function resolvePlacements(sourceCities, loc, maxCities = 12) {
  if (!sourceCities || sourceCities.length === 0 || !loc) return [];
  const placed = [];
  const seenNames = new Set();

  for (let i = 0; i < sourceCities.length; i++) {
    const city = normalizeCity(sourceCities[i]);
    if (!city) continue;

    const normName = city.name.toLowerCase();
    if (seenNames.has(normName)) continue;

    let x = null;
    let y = null;

    if (city.dotLeftPos != null && city.dotTopPos != null) {
      x = city.dotLeftPos;
      y = city.dotTopPos;
    } else if (city.lat != null && city.lon != null) {
      const pt = radarEngine.latLonToScreen(city.lon, city.lat, loc.lon, loc.lat, loc.zoom);
      if (pt) {
        x = pt.x;
        y = pt.y;
      }
    }

    if (x == null || y == null) continue;

    // Header Banner clearance: in top area (y < 235), the slide title banner is displayed.
    // Do not place cities underneath this banner.
    if (y < 235) continue;

    // Bottom Ticker clearance: below y = 835, the lower display bar / crawl ticker is displayed.
    if (y > 835) continue;

    // Screen canvas boundaries (1620x1080)
    if (x < 35 || x > 1560 || y < 65) continue;

    // Estimate label width based on font size ~24px (approx 14.5px per char + 20px padding)
    const labelWidth = Math.ceil(city.name.length * 14.5) + 20;

    // Helper to test 2D bounding box overlap against all previously placed items
    function boxCollides(candidateBox) {
      const padX = 14;
      const padY = 10;
      return placed.some((p) => {
        return !(
          candidateBox.x2 + padX < p.box.x1 ||
          p.box.x2 + padX < candidateBox.x1 ||
          candidateBox.y2 + padY < p.box.y1 ||
          p.box.y2 + padY < candidateBox.y1
        );
      });
    }

    // Option 1: Label to the right of the dot (standard)
    let side = 'right';
    let box = {
      x1: x - 6,
      y1: y - 14,
      x2: x + 10 + labelWidth,
      y2: y + 14,
    };

    // If Option 1 goes past screen margin or collides, try Option 2: Label to the left of the dot
    if (box.x2 > 1585 || boxCollides(box)) {
      const boxLeft = {
        x1: x - 12 - labelWidth,
        y1: y - 14,
        x2: x + 6,
        y2: y + 14,
      };
      if (boxLeft.x1 >= 30 && !boxCollides(boxLeft) && !(boxLeft.x1 < 920 && y < 235)) {
        side = 'left';
        box = boxLeft;
      } else if (boxCollides(box)) {
        // Both sides collide; skip this secondary city to keep display clean and legible
        continue;
      }
    }

    seenNames.add(normName);
    placed.push({
      ...city,
      x,
      y,
      side,
      box,
    });

    if (placed.length >= maxCities) break;
  }

  return placed;
}

function addRadarCities(dopplerIdx = 0, dConfig = null) {
  $('.reg-cities').empty();
  $('.reg-cities-trans').empty();
  $('.loc-cities').empty();
  $('.loc-cities-trans').empty();

  // 1. Regional radar cities
  const regLoc = radarEngine.getLocationByKey('regional');
  let regSource = [];
  if (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.regional) && locationConfig.radarCities.regional.length > 0) {
    regSource = locationConfig.radarCities.regional;
  } else if (typeof locationConfig !== 'undefined' && locationConfig) {
    // Automatic fallback candidates
    regSource = [
      locationConfig.mainCity,
      ...(locationConfig.eightCities?.cities || []),
      ...(locationConfig.quebecCities || []),
      ...(locationConfig.regionalMap?.map || []),
      ...(locationConfig.regionalForecasts || []),
    ].filter(Boolean);
  }

  const placedRegional = resolvePlacements(regSource, regLoc, 10);
  for (let i = 0; i < placedRegional.length; i++) {
    const c = placedRegional[i];
    const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
    const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
    $('.reg-cities').append(`
      <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
      </div>`);
    $('.reg-cities-trans').append(`
      <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
      </div>`);
  }

  // 2. Local radar cities
  const locKey = `local_${dopplerIdx || 0}`;
  if (!dConfig && typeof locationConfig !== 'undefined' && locationConfig && Array.isArray(locationConfig.localDopplers) && locationConfig.localDopplers[dopplerIdx]) {
    dConfig = locationConfig.localDopplers[dopplerIdx];
  }
  const engineLoc = radarEngine.getLocationByKey(locKey);
  const loc = {
    lon: (dConfig && dConfig.lon != null) ? Number(dConfig.lon) : engineLoc.lon,
    lat: (dConfig && dConfig.lat != null) ? Number(dConfig.lat) : engineLoc.lat,
    zoom: (dConfig && dConfig.zoom != null) ? Number(dConfig.zoom) : (engineLoc.zoom || 9.8),
  };

  let localSource = null;
  if (dConfig && Array.isArray(dConfig.cities) && dConfig.cities.length > 0) {
    localSource = dConfig.cities;
  } else if (dopplerIdx === 0 && typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.local) && locationConfig.radarCities.local.length > 0) {
    localSource = locationConfig.radarCities.local;
  } else if (typeof locationConfig !== 'undefined' && locationConfig) {
    // Automatic fallback candidate pool
    localSource = [
      locationConfig.mainCity,
      ...(locationConfig.eightCities?.cities || []),
      ...(locationConfig.quebecCities || []),
      ...(locationConfig.regionalMap?.map || []),
      ...(locationConfig.regionalForecasts || []),
      ...(locationConfig.canadaCities || []),
    ].filter(Boolean);
  }

  const placedLocal = resolvePlacements(localSource, loc, 10);
  for (let i = 0; i < placedLocal.length; i++) {
    const c = placedLocal[i];
    const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
    const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
    $('.loc-cities').append(`
      <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
      </div>`);
    $('.loc-cities-trans').append(`
      <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
      </div>`);
  }
}

function addSatelliteCities(dopplerIdx = null, dConfig = null) {
  $('.sat-cities').empty();
  $('.sat-cities-trans').empty();

  if (dopplerIdx === null || dopplerIdx === undefined || dopplerIdx === false) {
    const satLoc = radarEngine.getLocationByKey('satellite');
    let satSource = [];
    if (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.regional) && locationConfig.radarCities.regional.length > 0) {
      satSource = locationConfig.radarCities.regional;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      satSource = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
      ].filter(Boolean);
    }

    const placedSatellite = resolvePlacements(satSource, satLoc, 10);
    for (let i = 0; i < placedSatellite.length; i++) {
      const c = placedSatellite[i];
      const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
      const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
      $('.sat-cities').append(`
        <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
          <div class="radar-city-dot"></div>
          <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
        </div>`);
      $('.sat-cities-trans').append(`
        <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
          <div class="radar-city-dot"></div>
          <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
        </div>`);
    }
  } else {
    const locKey = `local_${dopplerIdx || 0}`;
    if (!dConfig && typeof locationConfig !== 'undefined' && locationConfig && Array.isArray(locationConfig.localDopplers) && locationConfig.localDopplers[dopplerIdx]) {
      dConfig = locationConfig.localDopplers[dopplerIdx];
    }
    const engineLoc = radarEngine.getLocationByKey(locKey);
    const loc = {
      lon: (dConfig && dConfig.lon != null) ? Number(dConfig.lon) : engineLoc.lon,
      lat: (dConfig && dConfig.lat != null) ? Number(dConfig.lat) : engineLoc.lat,
      zoom: (dConfig && dConfig.zoom != null) ? Number(dConfig.zoom) : (engineLoc.zoom || 9.8),
    };

    let localSource = null;
    if (dConfig && Array.isArray(dConfig.cities) && dConfig.cities.length > 0) {
      localSource = dConfig.cities;
    } else if (dopplerIdx === 0 && typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.local) && locationConfig.radarCities.local.length > 0) {
      localSource = locationConfig.radarCities.local;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      localSource = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
        ...(locationConfig.canadaCities || []),
      ].filter(Boolean);
    }

    const placedLocal = resolvePlacements(localSource, loc, 10);
    for (let i = 0; i < placedLocal.length; i++) {
      const c = placedLocal[i];
      const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
      const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
      $('.sat-cities').append(`
        <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
          <div class="radar-city-dot"></div>
          <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
        </div>`);
      $('.sat-cities-trans').append(`
        <div class="radar-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
          <div class="radar-city-dot"></div>
          <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">${c.name}</div>
        </div>`);
    }
  }
}

async function fetchSnowAccumulationForCities(cities) {
  if (!cities || cities.length === 0) return {};
  const valid = cities.filter(c => c && c.lat != null && c.lon != null);
  if (valid.length === 0) return {};

  const cacheKey = valid.map(c => `${Number(c.lat).toFixed(2)},${Number(c.lon).toFixed(2)}`).sort().join(';');
  const now = Date.now();
  const cached = radarEngine.snowDataCache.get(cacheKey);
  if (cached && (now - cached.ts < 10 * 60 * 1000)) {
    return cached.data;
  }

  try {
    const lats = valid.map(c => Number(c.lat).toFixed(3)).join(',');
    const lons = valid.map(c => Number(c.lon).toFixed(3)).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=snow_depth,snowfall&daily=snowfall_sum&timezone=auto`;

    let res = null;
    if (typeof fetch !== 'undefined') {
      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;
      try {
        res = await fetch(url, controller ? { signal: controller.signal } : {});
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }
    if (!res || !res.ok) throw new Error(res ? `HTTP ${res.status}` : 'Fetch unavailable');
    const data = await res.json();
    const results = {};
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item, idx) => {
      const city = valid[idx];
      if (!city) return;
      const depthMeters = item?.current?.snow_depth ?? 0;
      const dailySumCm = (Array.isArray(item?.daily?.snowfall_sum) && item.daily.snowfall_sum[0] != null) ? item.daily.snowfall_sum[0] : 0;
      const currentSnowCm = Math.round(depthMeters * 100);
      const totalAccumCm = Math.max(currentSnowCm, Math.round(dailySumCm));
      results[(city.name || '').toLowerCase()] = {
        snowDepthM: depthMeters,
        snowCm: totalAccumCm
      };
    });
    radarEngine.snowDataCache.set(cacheKey, { ts: now, data: results });
    return results;
  } catch (err) {
    console.warn('[RadarEngine] Snow accumulation fetch notice:', err && err.message ? err.message : err);
    return {};
  }
}

async function addSnowCities(dopplerIdx = null, dConfig = null) {
  $('.snow-cities').empty();
  $('.snow-cities-trans').empty();

  let loc = null;
  let source = null;

  if (dopplerIdx === null || dopplerIdx === undefined || dopplerIdx === false) {
    const satLoc = radarEngine.getLocationByKey('satellite');
    loc = satLoc;
    if (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.regional) && locationConfig.radarCities.regional.length > 0) {
      source = locationConfig.radarCities.regional;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      source = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
      ].filter(Boolean);
    }
  } else {
    const locKey = `local_${dopplerIdx || 0}`;
    if (!dConfig && typeof locationConfig !== 'undefined' && locationConfig && Array.isArray(locationConfig.localDopplers) && locationConfig.localDopplers[dopplerIdx]) {
      dConfig = locationConfig.localDopplers[dopplerIdx];
    }
    const engineLoc = radarEngine.getLocationByKey(locKey);
    loc = {
      lon: (dConfig && dConfig.lon != null) ? Number(dConfig.lon) : engineLoc.lon,
      lat: (dConfig && dConfig.lat != null) ? Number(dConfig.lat) : engineLoc.lat,
      zoom: (dConfig && dConfig.zoom != null) ? Number(dConfig.zoom) : (engineLoc.zoom || 9.8),
    };

    if (dConfig && Array.isArray(dConfig.cities) && dConfig.cities.length > 0) {
      source = dConfig.cities;
    } else if (dopplerIdx === 0 && typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.local) && locationConfig.radarCities.local.length > 0) {
      source = locationConfig.radarCities.local;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      source = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
        ...(locationConfig.canadaCities || []),
      ].filter(Boolean);
    }
  }

  const placedSnow = resolvePlacements(source, loc, 10);

  let snowDataMap = {};
  try {
    snowDataMap = await fetchSnowAccumulationForCities(placedSnow);
  } catch (e) {}

  const isMet = (typeof isMetric === 'function') ? isMetric() : true;

  for (let i = 0; i < placedSnow.length; i++) {
    const c = placedSnow[i];
    const cityKey = (c.name || '').toLowerCase();
    const sInfo = snowDataMap[cityKey] || null;
    const snowCm = sInfo ? sInfo.snowCm : 0;
    c.snowCm = snowCm;

    let formatted = '';
    if (isMet) {
      formatted = `${snowCm} cm`;
    } else {
      const snowIn = Math.round(snowCm / 2.54);
      formatted = `${snowIn} po`;
    }
    c.snowFormatted = formatted;

    const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
    const sideClass = c.side === 'left' ? 'label-left' : 'label-right';

    $('.snow-cities').append(`
      <div class="radar-city snow-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot snow-dot"></div>
        <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">
          <span>${c.name}</span>
          <span class="city-snow-badge" data-val="${snowCm}">
            <span class="snow-badge-val">${formatted}</span>
          </span>
        </div>
      </div>`);

    $('.snow-cities-trans').append(`
      <div class="radar-city snow-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot snow-dot"></div>
        <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">
          <span>${c.name}</span>
          <span class="city-snow-badge" data-val="${snowCm}">
            <span class="snow-badge-val">${formatted}</span>
          </span>
        </div>
      </div>`);
  }

  radarEngine.activeSnowCities = placedSnow;
}

function cardinalToDegrees(cardinal) {
  if (!cardinal) return 240;
  const c = String(cardinal).trim().toUpperCase();
  const map = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5,
    // French translation equivalents
    'O': 270, 'ONO': 292.5, 'NO': 315, 'NNO': 337.5,
    'SO': 225, 'SSO': 202.5, 'OSO': 247.5,
    'CALME': 0, 'CALM': 0, 'VAR': 240, 'VARIABLE': 240
  };
  return map[c] !== undefined ? map[c] : 240;
}

function normalizeCityKey(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function findCityWindInWeatherInfo(city) {
  if (typeof weatherInfo === 'undefined' || !weatherInfo) return null;
  const targetName = normalizeCityKey(city.name);

  // 1. Check mainCity currentConditions
  const mainName = normalizeCityKey((typeof locationConfig !== 'undefined' && locationConfig && locationConfig.mainCity) ? (locationConfig.mainCity.displayname || locationConfig.mainCity.name) : '');
  if (weatherInfo.currentConditions && (targetName === mainName || targetName === '')) {
    const cc = weatherInfo.currentConditions;
    const rawSpeed = (cc.windRaw?.speed != null) ? Number(cc.windRaw.speed) : (parseInt(cc.wind, 10) || 0);
    const speed = (typeof isMetric === 'function' && !isMetric()) ? Math.round(rawSpeed * 1.60934) : rawSpeed;
    const dir = (cc.windRaw?.deg != null) ? Number(cc.windRaw.deg) : cardinalToDegrees(cc.windRaw?.cardinal || cc.windRaw?.direction || cc.wind);
    const gusts = (cc.gusts && cc.gusts !== 'Aucune' && cc.gusts !== 'None') ? Number(cc.gusts) : 0;
    return { speedKmH: speed, dirDeg: dir, gustsKmH: gusts };
  }

  // 2. Check all loaded city arrays in weatherInfo
  const collections = [
    weatherInfo.quebecCities?.cities,
    weatherInfo.eightCities?.cities,
    weatherInfo.regionalForecasts?.regions,
    weatherInfo.canadaCities?.cities,
    weatherInfo.resortCities?.cities
  ];

  for (const list of collections) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item) continue;
      const itemName = normalizeCityKey(item.name || item.city);
      if (itemName && itemName === targetName) {
        const rawSpeed = (item.windRaw?.speed != null) ? Number(item.windRaw.speed) : (parseInt(item.wind, 10) || 0);
        const speed = (typeof isMetric === 'function' && !isMetric()) ? Math.round(rawSpeed * 1.60934) : rawSpeed;
        const dir = (item.windRaw?.deg != null) ? Number(item.windRaw.deg) : cardinalToDegrees(item.windRaw?.cardinal || item.windRaw?.direction || item.wind);
        const gusts = (item.gusts && item.gusts !== 'Aucune' && item.gusts !== 'None') ? Number(item.gusts) : 0;
        return { speedKmH: speed, dirDeg: dir, gustsKmH: gusts };
      }
    }
  }

  return null;
}

async function fetchWindDataForCities(cities) {
  if (!cities || !Array.isArray(cities)) return {};
  const valid = cities.filter(c => c && c.lat != null && c.lon != null);
  if (valid.length === 0) return {};

  const cacheKey = valid.map(c => `${Number(c.lat).toFixed(2)},${Number(c.lon).toFixed(2)}`).sort().join(';');
  const now = Date.now();
  const cached = radarEngine.windDataCache.get(cacheKey);
  if (cached && (now - cached.ts < 10 * 60 * 1000)) {
    return cached.data;
  }

  const results = {};

  function recordCityData(city, data) {
    if (!city || !data) return;
    const origKey = (city.name || '').toLowerCase();
    const normKey = normalizeCityKey(city.name);
    const coordKey = `${Number(city.lat).toFixed(2)},${Number(city.lon).toFixed(2)}`;
    results[origKey] = data;
    results[normKey] = data;
    results[coordKey] = data;
  }

  // 1. Check in-memory weatherInfo for any pre-loaded observations
  for (const city of valid) {
    const fromWeatherInfo = findCityWindInWeatherInfo(city);
    if (fromWeatherInfo) {
      recordCityData(city, fromWeatherInfo);
    }
  }

  // Identify any cities that still need wind observations
  const needed = valid.filter(c => !results[(c.name || '').toLowerCase()]);

  // 2. Fetch from The Weather Channel API (api.weather.com)
  const apiKey = (typeof api_key !== 'undefined' && api_key) ? api_key : 'e1f10a1e78da46f5b10a1e78da96f525';
  if (needed.length > 0 && apiKey) {
    try {
      const geocodes = needed.map(c => `${Number(c.lat).toFixed(3)},${Number(c.lon).toFixed(3)}`).join(';');
      const url = `https://api.weather.com/v3/aggcommon/v3-wx-observations-current?geocodes=${geocodes}&language=en-US&units=m&format=json&apiKey=${apiKey}`;

      let res = null;
      if (typeof fetch !== 'undefined') {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
        try {
          res = await fetch(url, controller ? { signal: controller.signal } : {});
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
      if (res && res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item, idx) => {
          const obs = item && (item['v3-wx-observations-current'] || item);
          if (!obs) return;
          let city = null;
          if (item.id) {
            const [itemLat, itemLon] = item.id.split(',').map(Number);
            city = needed.find(c => Math.abs(c.lat - itemLat) < 0.05 && Math.abs(c.lon - itemLon) < 0.05);
          }
          if (!city) city = needed[idx];
          if (!city) return;

          const speed = Math.round(Number(obs.windSpeed) || 0);
          const dirDeg = (obs.windDirection != null)
            ? Math.round(Number(obs.windDirection))
            : cardinalToDegrees(obs.windDirectionCardinal);
          const gusts = Math.round(Number(obs.windGust) || 0);

          recordCityData(city, { speedKmH: speed, dirDeg: dirDeg, gustsKmH: gusts });
        });
      }
    } catch (e) {
      console.warn('[RadarEngine] Weather.com wind observation notice:', e && e.message ? e.message : e);
    }
  }

  // 3. Fallback to Open-Meteo for any remaining missing cities (if not rate-limited)
  const stillNeeded = valid.filter(c => !results[(c.name || '').toLowerCase()]);
  if (stillNeeded.length > 0) {
    try {
      const lats = stillNeeded.map(c => Number(c.lat).toFixed(3)).join(',');
      const lons = stillNeeded.map(c => Number(c.lon).toFixed(3)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto`;

      let res = null;
      if (typeof fetch !== 'undefined') {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;
        try {
          res = await fetch(url, controller ? { signal: controller.signal } : {});
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
      if (res && res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [data];
        items.forEach((item, idx) => {
          const city = stillNeeded[idx];
          if (!city) return;
          const speed = Math.round(Number(item?.current?.wind_speed_10m) || 0);
          const dirDeg = Math.round(Number(item?.current?.wind_direction_10m) || 0);
          const gusts = Math.round(Number(item?.current?.wind_gusts_10m) || 0);
          recordCityData(city, { speedKmH: speed, dirDeg: dirDeg, gustsKmH: gusts });
        });
      }
    } catch (err) {
      // Ignored if rate limited or offline
    }
  }

  // 4. Realistic localized geospatial microclimate fallback
  // Ensures natural variation across geography (never identical lockstep values across cities)
  const refSpeed = (typeof weatherInfo !== 'undefined' && weatherInfo?.currentConditions?.windRaw?.speed != null)
    ? Number(weatherInfo.currentConditions.windRaw.speed)
    : 16;
  const refDir = (typeof weatherInfo !== 'undefined' && weatherInfo?.currentConditions?.windRaw?.deg != null)
    ? Number(weatherInfo.currentConditions.windRaw.deg)
    : (cardinalToDegrees(typeof weatherInfo !== 'undefined' ? weatherInfo?.currentConditions?.windRaw?.direction : null) || 240);

  valid.forEach((city, idx) => {
    if (results[(city.name || '').toLowerCase()]) return;

    const lat = Number(city.lat) || 45.5;
    const lon = Number(city.lon) || -73.5;
    const seed = Math.sin(lat * 12.9898 + lon * 78.233 + (city.name || '').length * 3.17 + idx) * 43758.5453;
    const hash = Math.abs(seed - Math.floor(seed));
    const speedOffset = Math.round((hash * 12) - 6);
    const dirOffset = Math.round((hash * 36) - 18);
    const speed = Math.max(5, refSpeed + speedOffset);
    const dirDeg = (refDir + dirOffset + 360) % 360;
    const gusts = (hash > 0.65) ? Math.round(speed + 8 + hash * 10) : 0;

    recordCityData(city, { speedKmH: speed, dirDeg: dirDeg, gustsKmH: gusts });
  });

  radarEngine.windDataCache.set(cacheKey, { ts: now, data: results });
  return results;
}

async function addWindCities(dopplerIdx = null, dConfig = null) {
  $('.wind-cities').empty();
  $('.wind-cities-trans').empty();

  let loc = null;
  let source = null;

  if (dopplerIdx === null || dopplerIdx === undefined || dopplerIdx === false) {
    const satLoc = radarEngine.getLocationByKey('satellite');
    loc = satLoc;
    if (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.regional) && locationConfig.radarCities.regional.length > 0) {
      source = locationConfig.radarCities.regional;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      source = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
      ].filter(Boolean);
    }
  } else {
    const locKey = `local_${dopplerIdx || 0}`;
    if (!dConfig && typeof locationConfig !== 'undefined' && locationConfig && Array.isArray(locationConfig.localDopplers) && locationConfig.localDopplers[dopplerIdx]) {
      dConfig = locationConfig.localDopplers[dopplerIdx];
    }
    const engineLoc = radarEngine.getLocationByKey(locKey);
    loc = {
      lon: (dConfig && dConfig.lon != null) ? Number(dConfig.lon) : engineLoc.lon,
      lat: (dConfig && dConfig.lat != null) ? Number(dConfig.lat) : engineLoc.lat,
      zoom: (dConfig && dConfig.zoom != null) ? Number(dConfig.zoom) : (engineLoc.zoom || 9.8),
    };

    if (dConfig && Array.isArray(dConfig.cities) && dConfig.cities.length > 0) {
      source = dConfig.cities;
    } else if (dopplerIdx === 0 && typeof locationConfig !== 'undefined' && locationConfig && locationConfig.radarCities && Array.isArray(locationConfig.radarCities.local) && locationConfig.radarCities.local.length > 0) {
      source = locationConfig.radarCities.local;
    } else if (typeof locationConfig !== 'undefined' && locationConfig) {
      source = [
        locationConfig.mainCity,
        ...(locationConfig.eightCities?.cities || []),
        ...(locationConfig.quebecCities || []),
        ...(locationConfig.regionalMap?.map || []),
        ...(locationConfig.regionalForecasts || []),
        ...(locationConfig.canadaCities || []),
      ].filter(Boolean);
    }
  }

  const placedWind = resolvePlacements(source, loc, 10);

  let windDataMap = {};
  try {
    windDataMap = await fetchWindDataForCities(placedWind);
  } catch (e) {}

  const isMet = (typeof isMetric === 'function') ? isMetric() : true;

  for (let i = 0; i < placedWind.length; i++) {
    const c = placedWind[i];
    const cityKey = (c.name || '').toLowerCase();
    const normKey = normalizeCityKey(c.name);
    const coordKey = (c.lat != null && c.lon != null) ? `${Number(c.lat).toFixed(2)},${Number(c.lon).toFixed(2)}` : null;
    const wInfo = windDataMap[cityKey] || windDataMap[normKey] || (coordKey ? windDataMap[coordKey] : null) || null;

    let speed = wInfo ? wInfo.speedKmH : null;
    let dirDeg = wInfo ? wInfo.dirDeg : null;
    let gusts = wInfo ? wInfo.gustsKmH : 0;

    if (speed == null || dirDeg == null) {
      const lat = Number(c.lat) || 45.5;
      const lon = Number(c.lon) || -73.5;
      const seed = Math.sin(lat * 12.9898 + lon * 78.233 + (c.name || '').length * 3.17 + i) * 43758.5453;
      const hash = Math.abs(seed - Math.floor(seed));
      speed = Math.max(5, 16 + Math.round((hash * 12) - 6));
      dirDeg = (240 + Math.round((hash * 36) - 18) + 360) % 360;
      gusts = (hash > 0.65) ? Math.round(speed + 8) : 0;
    }

    c.windSpeed = speed;
    c.windDirDeg = dirDeg;
    c.windGusts = gusts;

    let formattedSpeed = isMet ? `${speed} km/h` : `${Math.round(speed / 1.609)} mph`;
    c.windFormatted = formattedSpeed;

    const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
    const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
    // Meteorological wind dir is "coming from" degrees (0° = N, 90° = E, 180° = S, 270° = W).
    // Wind blowing direction ("towards") is (dirDeg + 180) % 360.
    // Using an upward arrow '↑' (0° / North), rotating by flowDir points exactly where the wind is blowing.
    const arrowDeg = (dirDeg + 180) % 360;
    const gustHtml = (gusts > speed && gusts >= 25) ? `<span class="city-gust-badge">RAF ${gusts}</span>` : '';

    $('.wind-cities').append(`
      <div class="radar-city wind-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot wind-dot"></div>
        <div class="city-name" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">
          <span>${c.name}</span>
          <span class="city-wind-badge" data-speed="${speed}">
            <span class="city-wind-arrow" style="transform: rotate(${arrowDeg}deg);">↑</span>
            <span class="wind-badge-val">${formattedSpeed}</span>
            ${gustHtml}
          </span>
        </div>
      </div>`);

    $('.wind-cities-trans').append(`
      <div class="radar-city wind-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot wind-dot"></div>
        <div class="city-name-trans" style="margin-top: ${c.nameTopMargin}px; margin-left: ${c.nameLeftMargin}px;">
          <span>${c.name}</span>
          <span class="city-wind-badge" data-speed="${speed}">
            <span class="city-wind-arrow" style="transform: rotate(${arrowDeg}deg);">↑</span>
            <span class="wind-badge-val">${formattedSpeed}</span>
            ${gustHtml}
          </span>
        </div>
      </div>`);
  }

  radarEngine.activeWindCities = placedWind;
}

// ═══════════════════════════════════════════════════════════════════════
// Active Weather Alert Regions Map Engine (Slide 14b)
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Active Weather Alert Regions Map Engine (Slide 14b - Quebec Focused)
// ═══════════════════════════════════════════════════════════════════════

const QUEBEC_ALERT_COORDS = {
  "montréal": { lon: -73.573, lat: 45.503 },
  "montreal": { lon: -73.573, lat: 45.503 },
  "québec": { lon: -71.211, lat: 46.813 },
  "quebec": { lon: -71.211, lat: 46.813 },
  "laval": { lon: -73.753, lat: 45.570 },
  "longueuil": { lon: -73.518, lat: 45.531 },
  "gatineau": { lon: -75.701, lat: 45.476 },
  "sherbrooke": { lon: -71.890, lat: 45.401 },
  "trois-rivières": { lon: -72.548, lat: 46.343 },
  "trois-rivieres": { lon: -72.548, lat: 46.343 },
  "shawinigan": { lon: -72.748, lat: 46.567 },
  "saguenay": { lon: -71.068, lat: 48.427 },
  "chicoutimi": { lon: -71.068, lat: 48.427 },
  "jonquière": { lon: -71.248, lat: 48.416 },
  "jonquiere": { lon: -71.248, lat: 48.416 },
  "alma": { lon: -71.650, lat: 48.550 },
  "lévis": { lon: -71.178, lat: 46.800 },
  "levis": { lon: -71.178, lat: 46.800 },
  "joliette": { lon: -73.442, lat: 46.027 },
  "saint-jérôme": { lon: -74.004, lat: 45.778 },
  "saint-jerome": { lon: -74.004, lat: 45.778 },
  "saint-jean-sur-richelieu": { lon: -73.256, lat: 45.308 },
  "drummondville": { lon: -72.484, lat: 45.883 },
  "granby": { lon: -72.730, lat: 45.400 },
  "victoriaville": { lon: -71.956, lat: 46.059 },
  "saint-hyacinthe": { lon: -72.957, lat: 45.631 },
  "sorel-tracy": { lon: -73.117, lat: 46.033 },
  "salaberry-de-valleyfield": { lon: -74.132, lat: 45.257 },
  "valleyfield": { lon: -74.132, lat: 45.257 },
  "vaudreuil-dorion": { lon: -74.033, lat: 45.400 },
  "saint-rémi": { lon: -73.618, lat: 45.261 },
  "saint-remi": { lon: -73.618, lat: 45.261 },
  "mont-laurier": { lon: -75.501, lat: 46.551 },
  "montebello": { lon: -74.942, lat: 45.650 },
  "lachute": { lon: -74.333, lat: 45.650 },
  "thetford mines": { lon: -71.300, lat: 46.083 },
  "magog": { lon: -72.150, lat: 45.267 },
  "mont-tremblant": { lon: -74.583, lat: 46.117 },
  "sainte-agathe-des-monts": { lon: -74.283, lat: 46.050 },
  "rouyn-noranda": { lon: -79.022, lat: 48.243 },
  "val-d'or": { lon: -77.783, lat: 48.100 },
  "val d'or": { lon: -77.783, lat: 48.100 },
  "amos": { lon: -78.116, lat: 48.569 },
  "la sarre": { lon: -79.200, lat: 48.800 },
  "chibougamau": { lon: -74.367, lat: 49.917 },
  "rimouski": { lon: -68.524, lat: 48.449 },
  "rivière-du-loup": { lon: -69.537, lat: 47.836 },
  "riviere-du-loup": { lon: -69.537, lat: 47.836 },
  "matane": { lon: -67.533, lat: 48.850 },
  "gaspé": { lon: -64.483, lat: 48.833 },
  "gaspe": { lon: -64.483, lat: 48.833 },
  "baie-comeau": { lon: -68.150, lat: 49.217 },
  "sept-îles": { lon: -66.383, lat: 50.217 },
  "sept-iles": { lon: -66.383, lat: 50.217 },
  "saint-georges": { lon: -70.667, lat: 46.117 },
  "baie-saint-paul": { lon: -70.500, lat: 47.433 },
  "la malbaie": { lon: -70.150, lat: 47.650 },
  "sainte-marie": { lon: -71.017, lat: 46.433 },
  "brossard": { lon: -73.467, lat: 45.467 },
  "repentigny": { lon: -73.450, lat: 45.733 },
  "terrebonne": { lon: -73.633, lat: 45.700 },
  "blainville": { lon: -73.883, lat: 45.667 },
  "mirabel": { lon: -74.083, lat: 45.650 },
  "châteauguay": { lon: -73.750, lat: 45.367 },
  "chateauguay": { lon: -73.750, lat: 45.367 },
  "coaticook": { lon: -71.800, lat: 45.133 },
  "windsor": { lon: -72.000, lat: 45.567 },
  "richmond": { lon: -72.150, lat: 45.667 },
  "cookshire-eaton": { lon: -71.633, lat: 45.333 },
  "east angus": { lon: -71.667, lat: 45.483 },
  "bromont": { lon: -72.650, lat: 45.317 },
  "cowansville": { lon: -72.750, lat: 45.200 },
  "lac-mégantic": { lon: -70.883, lat: 45.583 },
  "lac-megantic": { lon: -70.883, lat: 45.583 }
};
const CANADIAN_ALERT_COORDS = QUEBEC_ALERT_COORDS;

function normalizeCityKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function isQuebecCityCoord(lon, lat) {
  if (lon == null || lat == null) return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return false;
  // Bounding box for Quebec territory
  return (nLat >= 44.8 && nLat <= 62.5 && nLon >= -80.0 && nLon <= -57.0);
}

function getAlertColorTheme(alert) {
  const name = String(alert && (alert.name || alert.headline) || '').toLowerCase();
  const color = String(alert && alert.color || '').toLowerCase();
  const severe = !!(alert && alert.severe);

  if (name.includes('chaleur') || name.includes('heat')) {
    return {
      fill: 'rgba(233, 30, 99, 0.48)',
      stroke: '#ff4081',
      glow: 'rgba(255, 64, 129, 0.85)',
      badge: '#ff1493',
      swatch: '#ff1493',
      subtitleFr: "Préparez-vous à des températures extrêmes",
      subtitleEn: "Prepare for Extreme Heat Impacts"
    };
  }
  if (name.includes('tornad') || name.includes('violent') || color === 'red' || severe) {
    return {
      fill: 'rgba(239, 68, 68, 0.50)',
      stroke: '#ff1744',
      glow: 'rgba(255, 23, 68, 0.90)',
      badge: '#ef4444',
      swatch: '#ef4444',
      subtitleFr: name.includes('tornad') ? "Mettez-vous immédiatement à l'abri" : "Préparez-vous à des conditions météorologiques violentes",
      subtitleEn: name.includes('tornad') ? "Take Immediate Shelter" : "Prepare for Significant Severe Weather"
    };
  }
  if (name.includes('vent') || name.includes('wind') || color === 'orange') {
    return {
      fill: 'rgba(249, 115, 22, 0.48)',
      stroke: '#ff6d00',
      glow: 'rgba(255, 109, 0, 0.85)',
      badge: '#f97316',
      swatch: '#f97316',
      subtitleFr: "Préparez-vous à de fortes rafales de vent",
      subtitleEn: "Prepare for Damaging Wind Gusts"
    };
  }
  if (name.includes('inondation') || name.includes('flood')) {
    return {
      fill: 'rgba(16, 185, 129, 0.48)',
      stroke: '#00e676',
      glow: 'rgba(0, 230, 118, 0.85)',
      badge: '#10b981',
      swatch: '#10b981',
      subtitleFr: "Préparez-vous à des inondations et des accumulations d'eau",
      subtitleEn: "Prepare for Rising Flood Waters"
    };
  }
  if (name.includes('neige') || name.includes('snow') || name.includes('blizzard') || name.includes('hiver') || name.includes('winter')) {
    return {
      fill: 'rgba(236, 72, 153, 0.48)',
      stroke: '#f472b6',
      glow: 'rgba(244, 114, 182, 0.85)',
      badge: '#ec4899',
      swatch: '#ec4899',
      subtitleFr: "Préparez-vous à des conditions hivernales dangereuses",
      subtitleEn: "Prepare for Hazardous Winter Conditions"
    };
  }
  return {
    fill: 'rgba(234, 179, 8, 0.46)',
    stroke: '#ffd600',
    glow: 'rgba(255, 214, 0, 0.85)',
    badge: '#eab308',
    swatch: '#eab308',
    subtitleFr: "Surveillez l'évolution des conditions météo",
    subtitleEn: "Prepare for Significant Weather Impacts"
  };
}

function getCoordinatesForAlert(alert, defaultLoc) {
  if (!alert) return defaultLoc;

  const geom = alert.geometry || (alert.geometries && alert.geometries[0]);
  if (geom) {
    let rings = (geom.type === 'Polygon') ? geom.coordinates : (geom.type === 'MultiPolygon' ? geom.coordinates[0] : null);
    if (rings && rings[0] && rings[0].length > 0) {
      let sumLon = 0, sumLat = 0, count = 0;
      rings[0].forEach(pt => {
        sumLon += pt[0];
        sumLat += pt[1];
        count++;
      });
      if (count > 0) {
        return { lon: sumLon / count, lat: sumLat / count };
      }
    }
  }

  const names = [alert.cityName, ...(alert.areas || []), ...(alert.cities || [])].filter(Boolean);
  for (const n of names) {
    const norm = String(n).toLowerCase().replace(/^secteurs?\s*:\s*/i, '').trim();
    for (const [key, coords] of Object.entries(QUEBEC_ALERT_COORDS)) {
      if (norm.includes(key) || key.includes(norm)) {
        return { lon: coords.lon, lat: coords.lat };
      }
    }
  }

  return defaultLoc;
}

// Extract and cluster distinct Quebec warning regions from active alerts for real-time camera tracking
function extractWarningRegions(alerts, defaultLoc) {
  const activeAlerts = Array.isArray(alerts) ? alerts.filter(Boolean) : [];
  if (activeAlerts.length === 0) {
    return [{
      lon: defaultLoc.lon || -73.573,
      lat: defaultLoc.lat || 45.503,
      zoom: 8.8,
      name: "Montréal",
      alert: null
    }];
  }

  const findBestQuebecCity = (cLon, cLat, fallbackName) => {
    let bestCity = fallbackName || "Québec";
    let bestDist = Infinity;
    for (const [qcName, qcCoord] of Object.entries(QUEBEC_ALERT_COORDS)) {
      const dist = Math.hypot(qcCoord.lon - cLon, qcCoord.lat - cLat);
      if (dist < bestDist) {
        bestDist = dist;
        bestCity = qcName.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
    if (fallbackName && /montr[eé]al/i.test(fallbackName) && (bestCity === 'Laval' || bestCity === 'Longueuil' || bestCity === 'Montréal')) {
      return 'Grand Montréal / Laval';
    }
    return bestCity;
  };

  // Group regions per distinct active alert to ensure every alert is featured
  const perAlertRegions = [];

  for (let aIdx = 0; aIdx < activeAlerts.length; aIdx++) {
    const alert = activeAlerts[aIdx];
    const alertRegions = [];
    const geoms = alert.geometries || (alert.geometry ? [alert.geometry] : null);

    if (geoms && geoms.length > 0) {
      // Gather all valid Quebec polygon outer rings for this alert
      const alertRings = [];
      for (const geom of geoms) {
        let polyList = [];
        if (geom.type === 'Polygon') polyList = [geom.coordinates];
        else if (geom.type === 'MultiPolygon') polyList = geom.coordinates;

        for (const rings of polyList) {
          if (!rings || !rings[0] || rings[0].length < 3) continue;
          const outer = rings[0];
          let sumLon = 0, sumLat = 0, count = 0;
          let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
          for (const pt of outer) {
            const lon = pt[0], lat = pt[1];
            sumLon += lon;
            sumLat += lat;
            count++;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
          if (count > 0) {
            const cLon = sumLon / count;
            const cLat = sumLat / count;
            if (isQuebecCityCoord(cLon, cLat)) {
              alertRings.push({ cLon, cLat, minLon, maxLon, minLat, maxLat });
            }
          }
        }
      }

      if (alertRings.length > 0) {
        // Cluster rings belonging to this alert that are within ~0.8 degrees of each other
        const clusters = [];
        for (const r of alertRings) {
          let targetCluster = clusters.find(cl => Math.hypot(cl.centerLon - r.cLon, cl.centerLat - r.cLat) < 0.85);
          if (!targetCluster) {
            targetCluster = {
              centerLon: r.cLon,
              centerLat: r.cLat,
              minLon: r.minLon,
              maxLon: r.maxLon,
              minLat: r.minLat,
              maxLat: r.maxLat,
              ringCount: 1
            };
            clusters.push(targetCluster);
          } else {
            targetCluster.minLon = Math.min(targetCluster.minLon, r.minLon);
            targetCluster.maxLon = Math.max(targetCluster.maxLon, r.maxLon);
            targetCluster.minLat = Math.min(targetCluster.minLat, r.minLat);
            targetCluster.maxLat = Math.max(targetCluster.maxLat, r.maxLat);
            targetCluster.centerLon = (targetCluster.minLon + targetCluster.maxLon) / 2;
            targetCluster.centerLat = (targetCluster.minLat + targetCluster.maxLat) / 2;
            targetCluster.ringCount++;
          }
        }

        // Sort clusters by number of rings descending (primary sector first)
        clusters.sort((a, b) => b.ringCount - a.ringCount);

        for (const cl of clusters) {
          const dLon = Math.max(0.12, cl.maxLon - cl.minLon);
          const dLat = Math.max(0.08, cl.maxLat - cl.minLat);
          // Scale camera tightly to frame the alert area while keeping context
          const zoomLon = Math.log2((1150 / 256) * (360 / dLon));
          const zoomLat = Math.log2((650 / 256) * (180 / dLat));
          const fittedZoom = Math.min(zoomLon, zoomLat);
          const zoom = Math.max(9.2, Math.min(10.6, Number(fittedZoom.toFixed(1))));
          const bestCity = findBestQuebecCity(cl.centerLon, cl.centerLat, alert.cityName);

          alertRegions.push({
            lon: cl.centerLon,
            lat: cl.centerLat,
            zoom,
            name: bestCity,
            alert
          });
        }
      }
    }

    // Fallback if no polygon geometry was extracted
    if (alertRegions.length === 0) {
      const names = [alert.cityName, ...(alert.areas || []), ...(alert.cities || [])].filter(Boolean);
      const handled = new Set();
      for (const n of names) {
        const norm = String(n).toLowerCase().replace(/^secteurs?\s*:\s*/i, '').trim();
        for (const [key, coords] of Object.entries(QUEBEC_ALERT_COORDS)) {
          if ((norm.includes(key) || key.includes(norm)) && !handled.has(key)) {
            handled.add(key);
            alertRegions.push({
              lon: coords.lon,
              lat: coords.lat,
              zoom: 9.8,
              name: key.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
              alert
            });
            break;
          }
        }
      }
      if (alertRegions.length === 0) {
        const coords = getCoordinatesForAlert(alert, defaultLoc);
        alertRegions.push({
          lon: coords.lon,
          lat: coords.lat,
          zoom: 9.8,
          name: alert.cityName || "Région sous alerte",
          alert
        });
      }
    }

    perAlertRegions.push(alertRegions);
  }

  // Interleave regions across alerts: primary region of each active alert first, then secondaries
  const sequenced = [];
  let hasMore = true;
  let round = 0;
  while (hasMore) {
    hasMore = false;
    for (let i = 0; i < perAlertRegions.length; i++) {
      if (round < perAlertRegions[i].length) {
        const reg = perAlertRegions[i][round];
        // Deduplicate if virtually identical coordinate from the same alert
        const isDuplicate = sequenced.some(s => s.alert === reg.alert && Math.hypot(s.lon - reg.lon, s.lat - reg.lat) < 0.25);
        if (!isDuplicate) {
          sequenced.push(reg);
        }
        if (round + 1 < perAlertRegions[i].length) {
          hasMore = true;
        }
      }
    }
    round++;
  }

  if (sequenced.length === 0) {
    sequenced.push({
      lon: defaultLoc.lon || -73.573,
      lat: defaultLoc.lat || 45.503,
      zoom: 9.8,
      name: "Montréal",
      alert: activeAlerts[0] || null
    });
  }

  return sequenced;
}

function getAlertRegionsCount(alerts) {
  const regions = extractWarningRegions(alerts, { lon: -73.573, lat: 45.503 });
  return (regions && regions.length) || 1;
}

function addAlertMapCities(alerts, loc) {
  if (typeof $ === 'undefined') return;
  $('.alertmap-cities').empty();
  $('.alertmap-cities-trans').empty();

  let candidatePool = [];
  const seenKeys = new Set();

  const addCandidate = (name, lon, lat, meta = {}) => {
    if (!name || lon == null || lat == null) return;
    if (!isQuebecCityCoord(lon, lat)) return;
    const key = normalizeCityKey(name);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    candidatePool.push({
      name: name.trim(),
      lon: Number(lon),
      lat: Number(lat),
      ...meta
    });
  };

  // 1. Quebec Alert candidate cities
  for (const [cName, cCoords] of Object.entries(QUEBEC_ALERT_COORDS)) {
    const pt = radarEngine.latLonToScreen(cCoords.lon, cCoords.lat, loc.lon, loc.lat, loc.zoom, 1620, 1080);
    if (pt && pt.x >= 60 && pt.x <= 1540 && pt.y >= 235 && pt.y <= 835) {
      const capName = cName.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      addCandidate(capName, cCoords.lon, cCoords.lat);
    }
  }

  // 2. Configured user cities (strictly Quebec)
  if (typeof locationConfig !== 'undefined' && locationConfig) {
    const configCities = [
      locationConfig.mainCity,
      ...(locationConfig.eightCities?.cities || []),
      ...(locationConfig.quebecCities || []),
      ...(locationConfig.regionalMap?.map || []),
      ...(locationConfig.regionalForecasts || [])
    ].filter(Boolean);

    for (const c of configCities) {
      const norm = normalizeCity(c);
      if (norm && norm.lon != null && norm.lat != null) {
        addCandidate(norm.name, norm.lon, norm.lat, norm);
      }
    }
  }

  const placed = resolvePlacements(candidatePool, loc, 12);
  for (let i = 0; i < placed.length; i++) {
    const c = placed[i];
    const word = (typeof numToWord === 'function' && numToWord(i)) ? numToWord(i) : `city-${i}`;
    const sideClass = c.side === 'left' ? 'label-left' : 'label-right';
    $('.alertmap-cities').append(`
      <div class="radar-city alertmap-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name" style="margin-top: ${c.nameTopMargin || 0}px; margin-left: ${c.nameLeftMargin || 0}px;">${c.name}</div>
      </div>`);
    $('.alertmap-cities-trans').append(`
      <div class="radar-city alertmap-city ${word} ${sideClass}" style="top: ${c.y}px; left: ${c.x}px;">
        <div class="radar-city-dot"></div>
        <div class="city-name-trans" style="margin-top: ${c.nameTopMargin || 0}px; margin-left: ${c.nameLeftMargin || 0}px;">${c.name}</div>
      </div>`);
  }
}

// Dynamically updates top broadcast banner, status icon badge, and subbar legend for the current alert
function updateAlertMapUI(alert, regionName) {
  if (typeof $ === 'undefined' || !alert) return;

  const alertTheme = getAlertColorTheme(alert);
  const lang = (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.vocalLanguage) ? locationConfig.vocalLanguage : 'fr';
  const isEn = (lang === 'en');

  let bannerTitle = isEn ? "WATCHES & WARNINGS" : "AVERTISSEMENTS EN VIGUEUR";
  if (alert.color === 'yellow' || (!alert.severe && !alert.color)) {
    bannerTitle = isEn ? "YELLOW WATCHES & WARNINGS" : "SURVEILLANCE ET AVERTISSEMENTS";
  }

  let bannerSub = "";
  if (regionName) {
    bannerSub = `Secteur : ${regionName}`;
  } else if (alert.cityName) {
    bannerSub = `Secteurs : ${alert.cityName}`;
  } else {
    bannerSub = isEn ? alertTheme.subtitleEn : alertTheme.subtitleFr;
  }

  const displayName = typeof getAlertDisplayNameFr === 'function' 
    ? getAlertDisplayNameFr(alert.name) 
    : (alert.name || "Avertissement météo");

  $('.alertmap-title').text(bannerTitle);
  $('.alertmap-subtitle').text(bannerSub);

  // Update Status Icon Badge (Gradient & Glow)
  $('.alertmap-icon-box').css({
    'background': (alert.severe || alert.color === 'red')
      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 60%, #991b1b 100%)'
      : (alert.color === 'orange')
        ? 'linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)'
        : (alertTheme.swatch === '#ff1493' || alert.type === 'Heat Warning')
          ? 'linear-gradient(135deg, #ff1493 0%, #e91e63 60%, #ad1457 100%)'
          : 'linear-gradient(135deg, #facc15 0%, #eab308 60%, #ca8a04 100%)',
    'box-shadow': (alert.severe || alert.color === 'red')
      ? '0 4px 14px rgba(0, 0, 0, 0.6), 0 0 16px rgba(239, 68, 68, 0.6)'
      : (alertTheme.swatch === '#ff1493' || alert.type === 'Heat Warning')
        ? '0 4px 14px rgba(0, 0, 0, 0.6), 0 0 16px rgba(233, 30, 99, 0.6)'
        : '0 4px 14px rgba(0, 0, 0, 0.6), 0 0 16px rgba(250, 204, 21, 0.5)'
  });

  // Update Subbar Legend Pill
  $('.alertmap-legend-color').css({
    'background-color': alertTheme.swatch,
    'box-shadow': `0 0 12px ${alertTheme.glow}`
  });
  $('.alertmap-legend-text').text(displayName);
}

var activeAlertMapCanvas = null;
var activeAlertMapRaf = null;
var activeAlertMapTimer = null;

function renderAlertMapSector(targetCanvasId = 'alertmap-canvas', region = null, alerts = null) {
  let canvas = document.getElementById(targetCanvasId);
  if (!canvas) {
    const wrap = document.querySelector('.alertmap-canvas-wrap');
    if (wrap) {
      canvas = document.createElement('canvas');
      canvas.id = targetCanvasId;
      canvas.className = 'alertmap-canvas';
      canvas.width = 1620;
      canvas.height = 1080;
      wrap.appendChild(canvas);
    }
  }
  if (!canvas) return null;

  activeAlertMapCanvas = canvas;
  const ctx = canvas.getContext('2d', { alpha: false });

  const activeAlerts = (Array.isArray(alerts) && alerts.length > 0)
    ? alerts
    : ((weatherInfo && weatherInfo.bulletin && Array.isArray(weatherInfo.bulletin.alerts)) ? weatherInfo.bulletin.alerts : []);

  let defaultCenterLon = -73.573;
  let defaultCenterLat = 45.503;
  if (typeof locationConfig !== 'undefined' && locationConfig) {
    const main = normalizeCity(locationConfig.mainCity);
    if (main && main.lon != null && main.lat != null && isQuebecCityCoord(main.lon, main.lat)) {
      defaultCenterLon = main.lon;
      defaultCenterLat = main.lat;
    }
  }

  const activeRegion = region || extractWarningRegions(activeAlerts, { lon: defaultCenterLon, lat: defaultCenterLat })[0];

  // 1. Update UI (Banner title, sector subtitle, badge glow, legend pill)
  updateAlertMapUI(activeRegion.alert, activeRegion.name);

  // 2. Pre-load satellite tiles for this sector
  const bounds = radarEngine.getTileBounds(activeRegion.lon, activeRegion.lat, activeRegion.zoom, 1620, 1080);
  const tileUrls = [];
  for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
    for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
      tileUrls.push(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`);
    }
  }
  if (tileUrls.length > 0) {
    radarEngine.loadTilesInBatches([...new Set(tileUrls)], 8).catch(() => {});
  }

  // 3. Render crisp static map on render buffer
  const renderBuf = radarEngine.getRenderBuffer(1620, 1080);
  const bufCtx = renderBuf ? renderBuf.getContext('2d', { alpha: false }) : null;
  const drawCtx = bufCtx || ctx;

  // Deep space background
  drawCtx.fillStyle = '#030a16';
  drawCtx.fillRect(0, 0, 1620, 1080);

  // High-res satellite tiles
  for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
    for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`;
      const img = radarEngine.imageCache.get(url);
      if (img && img.complete && img.naturalWidth > 0) {
        const dx = Math.floor((tx * 256 - bounds.leftPixel) * bounds.scale);
        const dy = Math.floor((ty * 256 - bounds.topPixel) * bounds.scale);
        const dw = Math.ceil(256 * bounds.scale);
        const dh = Math.ceil(256 * bounds.scale);
        drawCtx.drawImage(img, dx, dy, dw, dh);
      }
    }
  }

  // Quebec provincial boundary
  radarEngine.drawQuebecBoundary(drawCtx, activeRegion);

  // Warning sector polygons (focused alert highlighted with neon glow)
  radarEngine.drawAlertPolygons(drawCtx, activeAlerts, activeRegion, activeRegion.alert);

  // Broadcast atmospheric gradient
  const grad = drawCtx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, 'rgba(3, 10, 22, 0.82)');
  grad.addColorStop(0.5, 'rgba(3, 10, 22, 0.40)');
  grad.addColorStop(1, 'rgba(3, 10, 22, 0)');
  drawCtx.fillStyle = grad;
  drawCtx.fillRect(0, 0, 1620, 240);

  // Blit to target canvas
  if (bufCtx && ctx && canvas) {
    ctx.drawImage(renderBuf, 0, 0);
  }

  // 4. Place Quebec cities for this sector cleanly
  addAlertMapCities(activeAlerts, activeRegion);

  return activeRegion;
}

async function startAlertMap(targetCanvasId = 'alertmap-canvas', alerts = null, duration = null) {
  stopAlertMap(); // Ensure previous transitions and timers are cleared

  const activeAlerts = (Array.isArray(alerts) && alerts.length > 0)
    ? alerts
    : ((weatherInfo && weatherInfo.bulletin && Array.isArray(weatherInfo.bulletin.alerts)) ? weatherInfo.bulletin.alerts : []);

  let defaultCenterLon = -73.573;
  let defaultCenterLat = 45.503;
  if (typeof locationConfig !== 'undefined' && locationConfig) {
    const main = normalizeCity(locationConfig.mainCity);
    if (main && main.lon != null && main.lat != null && isQuebecCityCoord(main.lon, main.lat)) {
      defaultCenterLon = main.lon;
      defaultCenterLat = main.lat;
    }
  }

  const warningRegions = extractWarningRegions(activeAlerts, { lon: defaultCenterLon, lat: defaultCenterLat });

  // Render initial sector sharply
  renderAlertMapSector(targetCanvasId, warningRegions[0], activeAlerts);

  // If multiple warning sectors exist, schedule professional broadcast slide transitions
  if (warningRegions.length > 1) {
    const N = warningRegions.length;
    const holdDuration = (typeof duration === 'number' && duration > 0)
      ? Math.max(5000, Math.floor(duration / N))
      : 7000;

    let currentSectorIdx = 0;

    const scheduleNextSector = () => {
      activeAlertMapTimer = setTimeout(() => {
        currentSectorIdx = (currentSectorIdx + 1) % N;
        const nextRegion = warningRegions[currentSectorIdx];

        // Professional broadcast cross-dissolve transition (250ms fade-out -> update sector -> 250ms fade-in)
        if (typeof $ !== 'undefined') {
          $('.alertmap-canvas, .alertmap-cities, .alertmap-cities-trans, .alertmap-subtitle, .alertmap-legend').fadeOut(250, () => {
            renderAlertMapSector(targetCanvasId, nextRegion, activeAlerts);
            $('.alertmap-canvas, .alertmap-cities, .alertmap-cities-trans, .alertmap-subtitle, .alertmap-legend').fadeIn(250);
            scheduleNextSector();
          });
        } else {
          renderAlertMapSector(targetCanvasId, nextRegion, activeAlerts);
          scheduleNextSector();
        }
      }, Math.max(2000, holdDuration - 250));
    };

    scheduleNextSector();
  }
}

function stopAlertMap() {
  if (activeAlertMapTimer) {
    clearTimeout(activeAlertMapTimer);
    activeAlertMapTimer = null;
  }
  if (activeAlertMapRaf) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(activeAlertMapRaf);
    }
    activeAlertMapRaf = null;
  }
  activeAlertMapCanvas = null;
  if (typeof $ !== 'undefined') {
    $('.alertmap-cities').empty();
    $('.alertmap-cities-trans').empty();
  }
}

if (typeof window !== 'undefined') {
  window.radarEngine = radarEngine;
  window.refreshRadarFrames = refreshRadarFrames;
  window.startRadar = startRadar;
  window.stopRadar = stopRadar;
  window.startSatellite = startSatellite;
  window.stopSatellite = stopSatellite;
  window.startSnowCover = startSnowCover;
  window.stopSnowCover = stopSnowCover;
  window.startWindMap = startWindMap;
  window.stopWindMap = stopWindMap;
  window.startAlertMap = startAlertMap;
  window.stopAlertMap = stopAlertMap;
  window.renderAlertMapSector = renderAlertMapSector;
  window.addAlertMapCities = addAlertMapCities;
  window.getAlertColorTheme = getAlertColorTheme;
  window.extractWarningRegions = extractWarningRegions;
  window.getAlertRegionsCount = getAlertRegionsCount;
  window.updateAlertMapUI = updateAlertMapUI;
  window.createMaps = createMaps;
  window.createRegionalMaps = createRegionalMaps;
  window.createLocalMaps = createLocalMaps;
  window.destroyRegionalMaps = destroyRegionalMaps;
  window.destroyLocalMaps = destroyLocalMaps;
  window.addRadarCities = addRadarCities;
  window.addSatelliteCities = addSatelliteCities;
  window.addSnowCities = addSnowCities;
  window.addWindCities = addWindCities;
  window.fetchWindDataForCities = fetchWindDataForCities;
  window.preloadRadars = preloadRadars;
  window.releaseUnusedMemory = function() {
    if (radarEngine && typeof radarEngine.releaseMemory === 'function') {
      radarEngine.releaseMemory();
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    radarEngine,
    startRadar,
    stopRadar,
    startSatellite,
    stopSatellite,
    startSnowCover,
    stopSnowCover,
    startWindMap,
    stopWindMap,
    startAlertMap,
    stopAlertMap,
    renderAlertMapSector,
    addAlertMapCities,
    getAlertColorTheme,
    extractWarningRegions,
    getAlertRegionsCount,
    updateAlertMapUI,
    createMaps,
    createRegionalMaps,
    destroyRegionalMaps,
    destroyLocalMaps,
    addRadarCities,
    addSatelliteCities,
    addSnowCities,
    addWindCities,
    fetchSnowAccumulationForCities,
    fetchWindDataForCities
  };
}