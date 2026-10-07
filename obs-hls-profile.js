'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ini = require('ini');

function findProfile(root, name) {
  const directory = path.join(root, 'basic', 'profiles');
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name, 'basic.ini');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const config = ini.parse(fs.readFileSync(file, 'utf8'));
    if (config.General?.Name === name) return { directory: path.dirname(file), config };
  }
  throw new Error(`OBS profile "${name}" not found.`);
}

function validateHlsProfile(root, name, hls) {
  const profile = findProfile(root, name);
  const serviceFile = path.join(profile.directory, 'service.json');
  const service = fs.existsSync(serviceFile) ? JSON.parse(fs.readFileSync(serviceFile, 'utf8')) : {};
  if (service.type !== 'rtmp_custom' || service.settings?.server !== `rtmp://127.0.0.1:${hls.ingestPort}/live` ||
      service.settings?.key !== 'intellistar' || service.settings?.use_auth) {
    throw new Error(`Profile "${name}" must stream to rtmp://127.0.0.1:${hls.ingestPort}/live with key intellistar. Use the launcher HLS setup command.`);
  }
  return profile;
}

function createHlsProfile(root, sourceName, name, hls, device = '/dev/dri/renderD128') {
  const source = findProfile(root, sourceName);
  const profilesDirectory = path.join(root, 'basic', 'profiles');
  for (const entry of fs.readdirSync(profilesDirectory, { withFileTypes: true })) {
    const file = path.join(profilesDirectory, entry.name, 'basic.ini');
    if (entry.isDirectory() && fs.existsSync(file) && ini.parse(fs.readFileSync(file, 'utf8')).General?.Name === name) {
      throw new Error(`OBS profile "${name}" already exists; it was not modified.`);
    }
  }
  const destination = path.join(profilesDirectory, 'IntelliSTAR_HLS');
  const config = structuredClone(source.config);
  config.General = { ...config.General, Name: name };
  config.Output = { ...config.Output, Mode: 'Advanced', DelayEnable: false, Reconnect: false };
  config.AdvOut = { ...config.AdvOut, Encoder: 'ffmpeg_vaapi_tex', AudioEncoder: 'ffmpeg_aac',
    TrackIndex: 1, Track1Bitrate: 192, ApplyServiceSettings: false, UseRescale: false, VodTrackEnabled: false };
  config.Audio = { ...config.Audio, SampleRate: 48000, ChannelSetup: 'Stereo' };
  config.Video = { ...config.Video, ColorFormat: 'NV12', ColorSpace: '709', ColorRange: 'Partial' };
  fs.mkdirSync(destination, { mode: 0o700 });
  try {
    fs.writeFileSync(path.join(destination, 'basic.ini'), ini.stringify(config), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'service.json'), JSON.stringify({ type: 'rtmp_custom', settings: {
      server: `rtmp://127.0.0.1:${hls.ingestPort}/live`, key: 'intellistar', use_auth: false,
    } }, null, 2), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'streamEncoder.json'), JSON.stringify({
      vaapi_device: device, bitrate: 10000, rate_control: 'CBR', keyint_sec: 2, profile: 100, bf: 0,
    }, null, 2), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

const YOUTUBE_DEFAULT_KEY = '0bwt-p2gw-q02k-0y0q-7vph';
const YOUTUBE_DEFAULT_SERVER = 'rtmp://a.rtmp.youtube.com/live2';

function getResolvedStreamKey(env = process.env) {
  if (env && env.YOUTUBE_STREAM_KEY) return env.YOUTUBE_STREAM_KEY;
  if (env && env.OBS_YOUTUBE_KEY) return env.OBS_YOUTUBE_KEY;
  try {
    const launcher = require('./launcher');
    if (launcher.YOUTUBE_STREAM_KEY) return launcher.YOUTUBE_STREAM_KEY;
  } catch {}
  return YOUTUBE_DEFAULT_KEY;
}

function validateYouTubeProfile(root, name) {
  const profile = findProfile(root, name);
  const serviceFile = path.join(profile.directory, 'service.json');
  const service = fs.existsSync(serviceFile) ? JSON.parse(fs.readFileSync(serviceFile, 'utf8')) : {};
  if (service.type !== 'rtmp_custom' || !service.settings?.server || !service.settings?.key) {
    throw new Error(`Profile "${name}" must have a custom RTMP server and stream key configured.`);
  }
  return profile;
}

function createYouTubeProfile(root, sourceName, name, streamKey = null, server = YOUTUBE_DEFAULT_SERVER, device = '/dev/dri/renderD128', overwrite = false) {
  const actualKey = streamKey || getResolvedStreamKey();
  let source;
  try {
    source = findProfile(root, sourceName);
  } catch {
    try {
      source = findProfile(root, 'IntelliSTAR');
    } catch {
      source = findProfile(root, 'IntelliSTAR HLS');
    }
  }
  const profilesDirectory = path.join(root, 'basic', 'profiles');
  const destination = path.join(profilesDirectory, 'IntelliSTAR_YouTube');
  for (const entry of fs.readdirSync(profilesDirectory, { withFileTypes: true })) {
    const file = path.join(profilesDirectory, entry.name, 'basic.ini');
    if (entry.isDirectory() && fs.existsSync(file) && ini.parse(fs.readFileSync(file, 'utf8')).General?.Name === name) {
      if (!overwrite) {
        throw new Error(`OBS profile "${name}" already exists; it was not modified.`);
      }
    }
  }
  const config = structuredClone(source.config);
  config.General = { ...config.General, Name: name };
  config.Output = { ...config.Output, Mode: 'Advanced', DelayEnable: false, Reconnect: false };
  config.AdvOut = { ...config.AdvOut, Encoder: 'ffmpeg_vaapi_tex', AudioEncoder: 'ffmpeg_aac',
    TrackIndex: 1, Track1Bitrate: 192, ApplyServiceSettings: false, UseRescale: false, VodTrackEnabled: false };
  config.Audio = { ...config.Audio, SampleRate: 48000, ChannelSetup: 'Stereo' };
  config.Video = { ...config.Video, ColorFormat: 'NV12', ColorSpace: '709', ColorRange: 'Partial' };
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(path.join(destination, 'basic.ini'), ini.stringify(config), { flag: 'w', mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'service.json'), JSON.stringify({ type: 'rtmp_custom', settings: {
      server, key: actualKey, use_auth: false,
    } }, null, 2), { flag: 'w', mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'streamEncoder.json'), JSON.stringify({
      vaapi_device: device, bitrate: 10000, rate_control: 'CBR', keyint_sec: 2, profile: 100, bf: 0,
    }, null, 2), { flag: 'w', mode: 0o600 });
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  return destination;
}

function ensureYouTubeProfile(root, name = 'IntelliSTAR YouTube', env = process.env) {
  const streamKey = getResolvedStreamKey(env);
  const server = env.YOUTUBE_RTMP_URL || YOUTUBE_DEFAULT_SERVER;
  const device = env.STREAM_VAAPI_DEVICE || '/dev/dri/renderD128';
  try {
    const profile = findProfile(root, name);
    const serviceFile = path.join(profile.directory, 'service.json');
    let service = {};
    if (fs.existsSync(serviceFile)) {
      try { service = JSON.parse(fs.readFileSync(serviceFile, 'utf8')); } catch {}
    }
    if (service.settings?.key !== streamKey || service.settings?.server !== server) {
      fs.writeFileSync(serviceFile, JSON.stringify({
        type: 'rtmp_custom',
        settings: { server, key: streamKey, use_auth: false },
      }, null, 2), { mode: 0o600 });
    }
    return profile.directory;
  } catch {
    return createYouTubeProfile(root, env.OBS_SOURCE_PROFILE || 'IntelliSTAR', name, streamKey, server, device, true);
  }
}

module.exports = {
  findProfile,
  validateHlsProfile,
  createHlsProfile,
  validateYouTubeProfile,
  createYouTubeProfile,
  ensureYouTubeProfile,
  getResolvedStreamKey,
  YOUTUBE_DEFAULT_KEY,
  YOUTUBE_DEFAULT_SERVER,
};