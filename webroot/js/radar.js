// ═══════════════════════════════════════════════════════════════════════
// IntelliStar High-Performance Low-Memory 2D Canvas Radar Engine
// Optimized for Raspberry Pi & embedded systems (Zero memory leaks,
// on-demand single-canvas compositing, and aggressive bitmap reclamation).
// ═══════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.__iptvMapsAvailable = true;
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

  // Pre-render high-resolution satellite basemap with reference boundaries for alert maps
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
    const refDrawInfo = [];
    for (let ty = bounds.minTileY; ty <= bounds.maxTileY; ty++) {
      for (let tx = bounds.minTileX; tx <= bounds.maxTileX; tx++) {
        const satUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`;
        const refUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${bounds.baseZoom}/${ty}/${tx}`;
        const dx = Math.floor((tx * 256 - bounds.leftPixel) * bounds.scale);
        const dy = Math.floor((ty * 256 - bounds.topPixel) * bounds.scale);
        const dw = Math.ceil(256 * bounds.scale);
        const dh = Math.ceil(256 * bounds.scale);
        tileUrls.push(satUrl, refUrl);
        satDrawInfo.push({ url: satUrl, dx, dy, dw, dh });
        refDrawInfo.push({ url: refUrl, dx, dy, dw, dh });
      }
    }

    await this.loadTilesInBatches(tileUrls, 8);

    // 1. Draw Satellite Terrain
    for (const info of satDrawInfo) {
      const img = this.imageCache.get(info.url);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, info.dx, info.dy, info.dw, info.dh);
      }
    }

    // 2. Draw Boundaries & Regional Reference Overlay
    ctx.save();
    ctx.globalAlpha = 0.82;
    for (const info of refDrawInfo) {
      const img = this.imageCache.get(info.url);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, info.dx, info.dy, info.dw, info.dh);
      }
    }
    ctx.restore();

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
  drawAlertPolygons(ctx, alerts, loc) {
    if (!alerts || !Array.isArray(alerts) || alerts.length === 0) return;

    alerts.forEach((alert) => {
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
            ctx.shadowBlur = 18;
            ctx.fill();

            // 2. Vibrant neon boundary stroke
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = style.stroke;
            ctx.stroke();

            // 3. Crisp inner boundary accent line
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
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

// ═══════════════════════════════════════════════════════════════════════
// Active Weather Alert Regions Map Engine (Slide 14b)
// ═══════════════════════════════════════════════════════════════════════

const CANADIAN_ALERT_COORDS = {
  "montréal": { lon: -73.573, lat: 45.503 },
  "montreal": { lon: -73.573, lat: 45.503 },
  "québec": { lon: -71.211, lat: 46.813 },
  "quebec": { lon: -71.211, lat: 46.813 },
  "laval": { lon: -73.753, lat: 45.570 },
  "longueuil": { lon: -73.518, lat: 45.531 },
  "gatineau": { lon: -75.701, lat: 45.476 },
  "ottawa": { lon: -75.697, lat: 45.421 },
  "sherbrooke": { lon: -71.890, lat: 45.401 },
  "trois-rivières": { lon: -72.548, lat: 46.343 },
  "saguenay": { lon: -71.068, lat: 48.427 },
  "lévis": { lon: -71.178, lat: 46.800 },
  "joliette": { lon: -73.442, lat: 46.027 },
  "saint-jérôme": { lon: -74.004, lat: 45.778 },
  "saint-jean-sur-richelieu": { lon: -73.256, lat: 45.308 },
  "drummondville": { lon: -72.484, lat: 45.883 },
  "granby": { lon: -72.730, lat: 45.400 },
  "victoriaville": { lon: -71.956, lat: 46.059 },
  "rouyn-noranda": { lon: -79.022, lat: 48.243 },
  "val-d'or": { lon: -77.783, lat: 48.100 },
  "rimouski": { lon: -68.524, lat: 48.449 },
  "sept-îles": { lon: -66.383, lat: 50.217 },
  "toronto": { lon: -79.383, lat: 43.653 },
  "winnipeg": { lon: -97.138, lat: 49.895 },
  "brandon": { lon: -99.953, lat: 49.848 },
  "dauphin": { lon: -100.049, lat: 51.149 },
  "thompson": { lon: -97.856, lat: 55.743 },
  "flin flon": { lon: -101.877, lat: 54.766 },
  "regina": { lon: -104.619, lat: 50.445 },
  "saskatoon": { lon: -106.670, lat: 52.133 },
  "yorkton": { lon: -102.463, lat: 51.214 },
  "estevan": { lon: -102.986, lat: 49.139 },
  "nipawin": { lon: -104.015, lat: 53.363 },
  "redvers": { lon: -101.681, lat: 49.578 },
  "berens river": { lon: -97.020, lat: 52.361 },
  "sandy lake": { lon: -93.344, lat: 53.056 },
  "red lake": { lon: -93.817, lat: 51.017 },
  "calgary": { lon: -114.071, lat: 51.045 },
  "edmonton": { lon: -113.491, lat: 53.544 },
  "vancouver": { lon: -123.121, lat: 49.283 },
  "halifax": { lon: -63.575, lat: 44.649 },
  "moncton": { lon: -64.778, lat: 46.088 }
};

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
    for (const [key, coords] of Object.entries(CANADIAN_ALERT_COORDS)) {
      if (norm.includes(key) || key.includes(norm)) {
        return { lon: coords.lon, lat: coords.lat };
      }
    }
  }

  return defaultLoc;
}

function addAlertMapCities(alerts, loc) {
  $('.alertmap-cities').empty();
  $('.alertmap-cities-trans').empty();

  let candidatePool = [];

  for (const [cName, cCoords] of Object.entries(CANADIAN_ALERT_COORDS)) {
    const pt = radarEngine.latLonToScreen(cCoords.lon, cCoords.lat, loc.lon, loc.lat, loc.zoom, 1620, 1080);
    if (pt && pt.x >= 60 && pt.x <= 1540 && pt.y >= 240 && pt.y <= 830) {
      const capName = cName.split(/[\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      candidatePool.push({
        name: capName,
        lon: cCoords.lon,
        lat: cCoords.lat
      });
    }
  }

  if (typeof locationConfig !== 'undefined' && locationConfig) {
    const configCities = [
      locationConfig.mainCity,
      ...(locationConfig.eightCities?.cities || []),
      ...(locationConfig.quebecCities || []),
      ...(locationConfig.regionalMap?.map || []),
      ...(locationConfig.regionalForecasts || [])
    ].filter(Boolean);
    candidatePool.push(...configCities);
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

var activeAlertMapCanvas = null;

async function startAlertMap(targetCanvasId = 'alertmap-canvas', alerts = null) {
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
  if (!canvas) return;

  activeAlertMapCanvas = canvas;
  const ctx = canvas.getContext('2d', { alpha: false });

  const activeAlerts = (Array.isArray(alerts) && alerts.length > 0)
    ? alerts
    : ((weatherInfo && weatherInfo.bulletin && Array.isArray(weatherInfo.bulletin.alerts)) ? weatherInfo.bulletin.alerts : []);

  const topAlert = activeAlerts[0] || { name: "Avertissement d'orages violents", color: "red", severe: true };
  const alertTheme = getAlertColorTheme(topAlert);

  const lang = (typeof locationConfig !== 'undefined' && locationConfig && locationConfig.vocalLanguage) ? locationConfig.vocalLanguage : 'fr';
  const isEn = (lang === 'en');

  let bannerTitle = isEn ? "WATCHES & WARNINGS" : "AVERTISSEMENTS EN VIGUEUR";
  if (topAlert.color === 'yellow' || (!topAlert.severe && !topAlert.color)) {
    bannerTitle = isEn ? "YELLOW WATCHES & WARNINGS" : "SURVEILLANCE ET AVERTISSEMENTS";
  }
  let bannerSub = isEn ? alertTheme.subtitleEn : alertTheme.subtitleFr;

  $('.alertmap-title').text(bannerTitle);
  $('.alertmap-subtitle').text(bannerSub);

  // Update Icon Badge
  $('.alertmap-icon-box').css({
    'background': (topAlert.severe || topAlert.color === 'red')
      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 60%, #991b1b 100%)'
      : (topAlert.color === 'orange')
        ? 'linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)'
        : 'linear-gradient(135deg, #facc15 0%, #eab308 60%, #ca8a04 100%)',
    'box-shadow': (topAlert.severe || topAlert.color === 'red')
      ? '0 4px 14px rgba(0, 0, 0, 0.6), 0 0 16px rgba(239, 68, 68, 0.6)'
      : '0 4px 14px rgba(0, 0, 0, 0.6), 0 0 16px rgba(250, 204, 21, 0.5)'
  });

  // Update Legend Pill
  const displayName = typeof getAlertDisplayNameFr === 'function' ? getAlertDisplayNameFr(topAlert.name) : topAlert.name;
  $('.alertmap-legend-color').css({
    'background-color': alertTheme.swatch,
    'box-shadow': `0 0 12px ${alertTheme.glow}`
  });
  $('.alertmap-legend-text').text(displayName);

  // Determine Map Center & Zoom
  let centerLon = -73.573;
  let centerLat = 45.503;
  let zoom = 7.5;

  if (typeof locationConfig !== 'undefined' && locationConfig) {
    if (locationConfig.radar && locationConfig.radar.regionalCoords && locationConfig.radar.regionalCoords.lon != null) {
      centerLon = Number(locationConfig.radar.regionalCoords.lon) || centerLon;
      centerLat = Number(locationConfig.radar.regionalCoords.lat) || centerLat;
    } else if (locationConfig.mainCity && locationConfig.mainCity.lon != null) {
      centerLon = Number(locationConfig.mainCity.lon) || centerLon;
      centerLat = Number(locationConfig.mainCity.lat) || centerLat;
    }
  }

  const alertCoords = getCoordinatesForAlert(topAlert, { lon: centerLon, lat: centerLat });
  if (alertCoords && alertCoords.lon != null && alertCoords.lat != null) {
    centerLon = alertCoords.lon;
    centerLat = alertCoords.lat;
  }

  const mapLoc = {
    key: 'alert_map',
    lon: centerLon,
    lat: centerLat,
    zoom: zoom
  };

  const basemap = await radarEngine.bakeAlertBasemap(mapLoc);
  if (canvas && activeAlertMapCanvas === canvas) {
    ctx.drawImage(basemap, 0, 0);
    radarEngine.drawAlertPolygons(ctx, activeAlerts, mapLoc);
    addAlertMapCities(activeAlerts, mapLoc);
  }
}

function stopAlertMap() {
  activeAlertMapCanvas = null;
  $('.alertmap-cities').empty();
  $('.alertmap-cities-trans').empty();
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
  window.startAlertMap = startAlertMap;
  window.stopAlertMap = stopAlertMap;
  window.addAlertMapCities = addAlertMapCities;
  window.getAlertColorTheme = getAlertColorTheme;
  window.createMaps = createMaps;
  window.createRegionalMaps = createRegionalMaps;
  window.createLocalMaps = createLocalMaps;
  window.destroyRegionalMaps = destroyRegionalMaps;
  window.destroyLocalMaps = destroyLocalMaps;
  window.addRadarCities = addRadarCities;
  window.addSatelliteCities = addSatelliteCities;
  window.addSnowCities = addSnowCities;
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
    startAlertMap,
    stopAlertMap,
    addAlertMapCities,
    getAlertColorTheme,
    createMaps,
    createRegionalMaps,
    destroyRegionalMaps,
    destroyLocalMaps,
    addRadarCities,
    addSatelliteCities,
    addSnowCities,
    fetchSnowAccumulationForCities
  };
}