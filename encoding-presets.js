'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ini = require('ini');

const RESOLUTIONS = {
  '720p': { key: '720p', label: '720p HD (1280x720)', width: 1280, height: 720 },
  '1080p': { key: '1080p', label: '1080p Full HD (1920x1080)', width: 1920, height: 1080 },
  '4k': { key: '4k', label: '4K Ultra HD (3840x2160)', width: 3840, height: 2160 },
};

const FRAME_RATES = [24, 30, 60];

const BITRATES = {
  '720p': { 24: 4000, 30: 4000, 60: 6000 },
  '1080p': { 24: 8000, 30: 8000, 60: 10000 },
  '4k': { 24: 16000, 30: 16000, 60: 25000 },
};

function normalizeResolution(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();
  if (['1', '720', '720p', 'hd', '1280x720'].includes(str)) return '720p';
  if (['2', '1080', '1080p', 'fhd', '1920x1080'].includes(str)) return '1080p';
  if (['3', '4k', '2160', '2160p', 'uhd', '3840x2160'].includes(str)) return '4k';
  throw new Error(`Invalid resolution '${input}'. Supported presets: 720p, 1080p, 4k.`);
}

function normalizeFps(input) {
  if (input === null || input === undefined || input === '') return null;
  const match = String(input).trim().match(/^([0-9]+)/);
  if (!match) throw new Error(`Invalid frame rate '${input}'. Supported: 24, 30, 60.`);
  const num = parseInt(match[1], 10);
  if (FRAME_RATES.includes(num)) return num;
  if (num === 1) return 24;
  if (num === 2) return 30;
  if (num === 3) return 60;
  throw new Error(`Invalid frame rate '${input}'. Supported: 24, 30, 60.`);
}

function getRecommendedBitrate(resolution, fps) {
  const res = RESOLUTIONS[resolution] ? resolution : '1080p';
  const targetFps = FRAME_RATES.includes(fps) ? fps : 30;
  return BITRATES[res]?.[targetFps] || 8000;
}

function configFilePath(appDir = __dirname) {
  return path.join(appDir, 'encoding-preset.json');
}

function getObsConfigDirectories(env = process.env) {
  const home = env.HOME || os.homedir();
  const dirs = [
    path.join(home, '.var', 'app', 'com.obsproject.Studio', 'config', 'obs-studio'),
    path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obs-studio'),
  ];
  return dirs.filter(d => fs.existsSync(d));
}

function getEncodingPreset(appDir = __dirname, env = process.env) {
  const file = configFilePath(appDir);
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && RESOLUTIONS[data.resolution] && FRAME_RATES.includes(Number(data.fps))) {
        const resObj = RESOLUTIONS[data.resolution];
        const fps = Number(data.fps);
        const bitrateKbps = data.bitrateKbps || getRecommendedBitrate(data.resolution, fps);
        return {
          preset: `${data.resolution}-${fps}fps`,
          resolution: data.resolution,
          label: resObj.label,
          width: resObj.width,
          height: resObj.height,
          fps,
          bitrateKbps,
          bitrate: `${bitrateKbps}k`,
          updatedAt: data.updatedAt || null,
        };
      }
    } catch {}
  }

  // Fallback: detect from existing OBS profile if available
  const obsRoots = getObsConfigDirectories(env);
  for (const obsRoot of obsRoots) {
    const profilesDir = path.join(obsRoot, 'basic', 'profiles');
    if (!fs.existsSync(profilesDir)) continue;
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const iniFile = path.join(profilesDir, entry.name, 'basic.ini');
      if (!fs.existsSync(iniFile)) continue;
      try {
        const config = ini.parse(fs.readFileSync(iniFile, 'utf8'));
        if (config.Video) {
          const cx = Number(config.Video.BaseCX || config.Video.OutputCX);
          const cy = Number(config.Video.BaseCY || config.Video.OutputCY);
          const fps = Number(config.Video.FPSCommon || config.Video.FPSInt || config.Video.FPSNum || 30);
          let resKey = '1080p';
          if (cx === 1280 && cy === 720) resKey = '720p';
          else if (cx === 3840 && cy === 2160) resKey = '4k';
          const validFps = FRAME_RATES.includes(fps) ? fps : 30;
          const bitrateKbps = getRecommendedBitrate(resKey, validFps);
          return {
            preset: `${resKey}-${validFps}fps`,
            resolution: resKey,
            label: RESOLUTIONS[resKey].label,
            width: RESOLUTIONS[resKey].width,
            height: RESOLUTIONS[resKey].height,
            fps: validFps,
            bitrateKbps,
            bitrate: `${bitrateKbps}k`,
            updatedAt: null,
          };
        }
      } catch {}
    }
  }

  // Default fallback: 1080p @ 30fps
  return {
    preset: '1080p-30fps',
    resolution: '1080p',
    label: RESOLUTIONS['1080p'].label,
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateKbps: 8000,
    bitrate: '8000k',
    updatedAt: null,
  };
}

function applyEncodingToObs(presetConfig, obsRoots = []) {
  const roots = Array.isArray(obsRoots) ? obsRoots : [obsRoots];
  const { width, height, fps, bitrateKbps } = presetConfig;
  const filesUpdated = [];

  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;

    // 1. Update Profiles in basic/profiles
    const profilesDir = path.join(root, 'basic', 'profiles');
    if (fs.existsSync(profilesDir)) {
      for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const profilePath = path.join(profilesDir, entry.name);
        const iniPath = path.join(profilePath, 'basic.ini');
        if (fs.existsSync(iniPath)) {
          try {
            const config = ini.parse(fs.readFileSync(iniPath, 'utf8'));
            config.Video = config.Video || {};
            config.Video.BaseCX = String(width);
            config.Video.BaseCY = String(height);
            config.Video.OutputCX = String(width);
            config.Video.OutputCY = String(height);
            config.Video.FPSType = '0';
            config.Video.FPSCommon = String(fps);
            config.Video.FPSInt = String(fps);
            config.Video.FPSNum = String(fps);
            config.Video.FPSDen = '1';

            fs.writeFileSync(iniPath, ini.stringify(config), 'utf8');
            filesUpdated.push(iniPath);
          } catch (e) {
            console.error(`Failed to update OBS profile ini ${iniPath}:`, e.message);
          }
        }

        // Update streamEncoder.json if present
        const encoderFile = path.join(profilePath, 'streamEncoder.json');
        if (fs.existsSync(encoderFile)) {
          try {
            const encoderConfig = JSON.parse(fs.readFileSync(encoderFile, 'utf8'));
            encoderConfig.bitrate = bitrateKbps;
            fs.writeFileSync(encoderFile, JSON.stringify(encoderConfig, null, 2), 'utf8');
            filesUpdated.push(encoderFile);
          } catch (e) {
            console.error(`Failed to update encoder config ${encoderFile}:`, e.message);
          }
        }
      }
    }

    // 2. Update Scene Collections in basic/scenes
    const scenesDir = path.join(root, 'basic', 'scenes');
    if (fs.existsSync(scenesDir)) {
      for (const entry of fs.readdirSync(scenesDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.bak')) continue;
        const sceneFile = path.join(scenesDir, entry.name);
        try {
          const sceneData = JSON.parse(fs.readFileSync(sceneFile, 'utf8'));
          let modified = false;

          if (sceneData.resolution) {
            sceneData.resolution.x = width;
            sceneData.resolution.y = height;
            modified = true;
          }

          if (Array.isArray(sceneData.sources)) {
            for (const source of sceneData.sources) {
              if (source.id === 'browser_source' && source.settings) {
                source.settings.width = width;
                source.settings.height = height;
                modified = true;
              }
              if (source.settings && Array.isArray(source.settings.items)) {
                for (const item of source.settings.items) {
                  if (item.name === 'Browser' || item.scale_ref || item.bounds) {
                    if (item.scale_ref) {
                      item.scale_ref.x = Number(width);
                      item.scale_ref.y = Number(height);
                      modified = true;
                    }
                    if (item.bounds) {
                      item.bounds.x = Number(width);
                      item.bounds.y = Number(height);
                      modified = true;
                    }
                  }
                }
              }
            }
          }

          if (modified) {
            fs.writeFileSync(sceneFile, JSON.stringify(sceneData, null, 4), 'utf8');
            filesUpdated.push(sceneFile);
          }
        } catch (e) {
          console.error(`Failed to update scene collection ${sceneFile}:`, e.message);
        }
      }
    }
  }

  return filesUpdated;
}

function setEncodingPreset({ resolution, fps }, appDir = __dirname, env = process.env, options = {}) {
  const current = getEncodingPreset(appDir, env);
  const selectedRes = resolution ? normalizeResolution(resolution) : current.resolution;
  const selectedFps = (fps !== null && fps !== undefined && fps !== '') ? normalizeFps(fps) : current.fps;

  const resObj = RESOLUTIONS[selectedRes];
  const bitrateKbps = getRecommendedBitrate(selectedRes, selectedFps);
  const updatedAt = new Date().toISOString();

  const presetPayload = {
    preset: `${selectedRes}-${selectedFps}fps`,
    resolution: selectedRes,
    label: resObj.label,
    width: resObj.width,
    height: resObj.height,
    fps: selectedFps,
    bitrateKbps,
    bitrate: `${bitrateKbps}k`,
    updatedAt,
  };

  // 1. Save to encoding-preset.json
  const file = configFilePath(appDir);
  fs.writeFileSync(file, JSON.stringify(presetPayload, null, 2), 'utf8');

  // 2. Apply to OBS directories
  const obsRoots = options.obsRoots || getObsConfigDirectories(env);
  const filesUpdated = applyEncodingToObs(presetPayload, obsRoots);

  // 3. Sync weather icons to matching framerate if available
  const iconSyncResult = syncActiveIcons(selectedFps, appDir);

  return {
    ...presetPayload,
    filesUpdated,
    iconsSynced: iconSyncResult.synced,
    iconCount: iconSyncResult.count || 0,
  };
}

function syncActiveIcons(fps, appDir = __dirname) {
  const targetFps = normalizeFps(fps) || 60;
  const icons2026Dir = path.join(appDir, 'webroot', 'images', 'icons', '2026');
  const srcDir = path.join(icons2026Dir, `${targetFps}fps`);
  const dstDir = path.join(icons2026Dir, 'large');

  if (!fs.existsSync(srcDir)) {
    return { synced: false, fps: targetFps, reason: `Directory ${targetFps}fps not found` };
  }

  fs.mkdirSync(dstDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.webp'));
  if (files.length === 0) {
    return { synced: false, fps: targetFps, reason: `No webp icons found in ${targetFps}fps` };
  }

  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
  }

  return { synced: true, fps: targetFps, count: files.length };
}

function getIconStatus(appDir = __dirname) {
  const icons2026Dir = path.join(appDir, 'webroot', 'images', 'icons', '2026');
  const availableFps = [24, 30, 60].filter(fps => {
    const dir = path.join(icons2026Dir, `${fps}fps`);
    return fs.existsSync(dir) && fs.readdirSync(dir).filter(f => f.endsWith('.webp')).length > 0;
  });
  const preset = getEncodingPreset(appDir);
  return {
    currentFps: preset.fps,
    availableFps,
    isSynced: availableFps.includes(preset.fps),
  };
}

function formatEncodingText(preset) {
  if (!preset) return 'Unknown';
  return `${preset.resolution.toUpperCase()} @ ${preset.fps} fps (${preset.width}x${preset.height}, ${preset.bitrate})`;
}

module.exports = {
  RESOLUTIONS,
  FRAME_RATES,
  normalizeResolution,
  normalizeFps,
  getRecommendedBitrate,
  getEncodingPreset,
  setEncodingPreset,
  applyEncodingToObs,
  syncActiveIcons,
  getIconStatus,
  formatEncodingText,
  getObsConfigDirectories,
  configFilePath,
};

