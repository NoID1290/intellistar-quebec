#!/usr/bin/env node
'use strict';

const { obsOptions, preflight, probeApp, createBackend, resolveDesktopEnvironment,
  runningCaptureProcesses, detectInstallation, obsConfigDirectory } = require('./stream-obs');
const { hlsOptions } = require('./stream-hls');
const { createHlsProfile, createYouTubeProfile } = require('./obs-hls-profile');
const { controlRequest, listenControl } = require('./obs-control');
const logger = require('./console-view');

async function main() {
  const action = process.argv[2] || 'start';
  if (['help', '--help', '-h'].includes(action)) {
    console.log('Usage: node start-obs.js <start|stop|status|check|setup-hls|setup-youtube> [ndi|hls|youtube|dual]\nSetup: OBS_SETUP.md\nOBS encodes HLS/YouTube; FFmpeg packages HLS without re-encoding.');
    return;
  }
  if (!['start', 'stop', 'status', 'check', 'setup-hls', 'setup-youtube'].includes(action)) throw new Error(`Unknown OBS command: ${action}`);
  if (process.platform !== 'linux') throw new Error('The OBS launcher supports Linux desktop sessions only.');
  let launcherKey;
  try { launcherKey = require('./launcher').YOUTUBE_STREAM_KEY; } catch {}
  const selectedEnv = {
    ...process.env,
    ...(process.argv[3] ? { OBS_OUTPUT: process.argv[3] } : {}),
    YOUTUBE_STREAM_KEY: process.env.YOUTUBE_STREAM_KEY || launcherKey,
  };
  const env = ['start', 'check'].includes(action) ? resolveDesktopEnvironment(selectedEnv) : selectedEnv;
  const options = obsOptions(env);
  if (action === 'setup-hls') {
    if (runningCaptureProcesses().length) throw new Error('Close OBS and legacy capture before creating the HLS profile.');
    const installation = detectInstallation(options);
    const destination = createHlsProfile(obsConfigDirectory(installation, env), env.OBS_SOURCE_PROFILE || 'IntelliSTAR',
      env.OBS_HLS_PROFILE || 'IntelliSTAR HLS', hlsOptions(env), env.STREAM_VAAPI_DEVICE || '/dev/dri/renderD128');
    logger.stream(`Created HLS profile at ${destination}. Existing profiles and scene collection were not modified.`);
    return;
  }
  if (action === 'setup-youtube') {
    if (runningCaptureProcesses().length) throw new Error('Close OBS and legacy capture before creating the YouTube profile.');
    const installation = detectInstallation(options);
    const streamKey = env.YOUTUBE_STREAM_KEY || env.OBS_YOUTUBE_KEY || launcherKey || '0bwt-p2gw-q02k-0y0q-7vph';
    const rtmpUrl = env.YOUTUBE_RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';
    const destination = createYouTubeProfile(obsConfigDirectory(installation, env), env.OBS_SOURCE_PROFILE || 'IntelliSTAR',
      env.OBS_YOUTUBE_PROFILE || 'IntelliSTAR YouTube', streamKey, rtmpUrl, env.STREAM_VAAPI_DEVICE || '/dev/dri/renderD128', true);
    logger.stream(`Created YouTube profile at ${destination}. Existing profiles and scene collection were not modified.`);
    return;
  }
  if (action === 'check') {
    const result = preflight(options, env);
    logger.stream(`OBS preflight passed (${result.installation}). Browser Source: ${options.url}`);
    logger.warn('Preflight checks saved configuration, not actual rendering, audio or NDI delivery. Verify these in OBS and at the receiver.');
    return;
  }
  if (action === 'status' || action === 'stop') {
    const response = await controlRequest(options.socketPath, action, __dirname);
    if (!response) { logger.stream('OBS launcher is not running. No other OBS processes were touched.'); return; }
    if (action === 'status') {
      try { response.app.health = await probeApp(Number(new URL(response.url).port)) ? 'ready' : 'unavailable'; }
      catch { response.app.health = 'unavailable'; }
      console.log(JSON.stringify(response, null, 2));
      return;
    }
    const deadline = Date.now() + 15000;
    while (await controlRequest(options.socketPath, 'status', __dirname)) {
      if (Date.now() >= deadline) throw new Error('OBS shutdown has not completed; inspect the launcher terminal. No unrelated processes were killed.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    logger.stream('OBS backend stopped. A reused web server is left running.');
    return;
  }

  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const backend = createBackend(options, { env, log: message => logger.stream(message), onExit: finish });
  const control = await listenControl(options.socketPath, __dirname, backend.status, () => { void backend.stop(); });
  const onSignal = () => { void backend.stop(); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    await backend.start();
    logger.stream('Forecast remains in standby until npm run forecast:start. Stop this backend with npm run obs:stop or Ctrl+C.');
    await finished;
    if (backend.status().error) throw new Error(backend.status().error);
  } finally {
    await backend.stop();
    await control.close();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

main().catch(error => { logger.error(error.message); process.exitCode = 1; });