// Linux capture helpers are dependency-injectable so tests need no display or audio server.
const { spawnSync } = require('child_process');
const { videoFilter, isVaapi, vaapiEncoderArgs, rateControl } = require('./stream-encoding');

const probeOptions = { encoding: 'utf8', timeout: 8000, maxBuffer: 1024 * 1024 };

function uint32(value, name, optional = true) {
  if (optional && (value === null || value === undefined)) return null;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 0xffffffff || Object.is(value, -0)) {
    throw new Error(`${name} must be an unsigned 32-bit integer.`);
  }
  return String(Number(value));
}

function kmsgrabInputArgs(config, queue = '32') {
  const args = ['-device', config.kmsDevice || '/dev/dri/card0', '-f', 'kmsgrab'];
  for (const [key, flag] of [['kmsCrtc', '-crtc_id'], ['kmsPlane', '-plane_id']]) {
    const value = uint32(config[key], key);
    if (value !== null) args.push(flag, value);
  }
  return [...args, '-framerate', String(config.fps), '-thread_queue_size', String(queue), '-i', '-'];
}

function probeKmsgrabCapability(device, config = {}, encoder = null, run = spawnSync) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (encoder && isVaapi(encoder)) args.push('-vaapi_device', config.vaapiDevice || '/dev/dri/renderD128');
  args.push(...kmsgrabInputArgs({ ...config, kmsDevice: device, fps: config.kmsProbeFps || 30 }), '-frames:v', '1', '-an');
  if (encoder) {
    args.push('-vf', videoFilter({ ...config, fps: 1 }, encoder, false, 'drm_prime'), '-c:v', encoder);
    if (isVaapi(encoder)) args.push(...vaapiEncoderArgs(config, encoder), '-b:v', String(rateControl(config).target));
  } else {
    // Packet copy tests KMS access without asking the null encoder to download DRM frames.
    args.push('-c:v', 'copy');
  }
  args.push('-f', 'null', '-');
  const result = run(config.ffmpegPath || 'ffmpeg', args, probeOptions);
  const error = String(result.stderr || result.error?.message || '').trim();
  if (result.status === 0) return { available: true };
  if (/permission denied|operation not permitted|EPERM|EACCES|additional capabilities|no handle set on framebuffer/i.test(error)) {
    return { available: false, error: 'CAP_SYS_ADMIN required' };
  }
  if (/not a known supported format/i.test(error)) {
    return { available: false, error: 'DRM scanout uses an unsupported pixel format (e.g. 10-bit HDR AB30). KMSGrab requires 8-bit ARGB8888 scanout; use PipeWire capture or configure 8-bit display.' };
  }
  return { available: false, error: error || 'KMS probe failed or timed out' };
}

function pipewireVideoArgs(config) {
  const node = uint32(config.pipewireVideoNode, 'STREAM_PIPEWIRE_NODE', Boolean(config.pipewirePortal));
  for (const value of [config.captureWidth, config.captureHeight, config.fps]) {
    if (!Number.isInteger(value) || value <= 0) throw new Error('PipeWire dimensions and FPS must be positive integers.');
  }
  // Fix format, dimensions AND rate before fdsink: rawvideo carries no frame metadata.
  return ['-q', 'pipewiresrc', `path=${node}`, 'do-timestamp=true', 'name=intellistar_capture', '!', 'videoconvert', '!',
    'videoscale', '!', 'videorate', '!',
    `video/x-raw,format=BGRx,width=${config.captureWidth},height=${config.captureHeight},framerate=${config.fps}/1`,
    '!', 'fdsink', 'fd=1', 'sync=false'];
}

function pipewireInputArgs(config, queue = '32') {
  if (!config.pipewirePortal) pipewireVideoArgs(config); // Validate also when called without a preflight.
  return ['-thread_queue_size', String(queue), '-f', 'rawvideo', '-pixel_format', 'bgr0',
    '-video_size', `${config.captureWidth}x${config.captureHeight}`, '-framerate', String(config.fps), '-i', 'pipe:0'];
}

function probePipewireVideo(config, run = spawnSync) {
  if (config.pipewireVideoNode === null || config.pipewireVideoNode === undefined) {
    if (config.pipewirePortal) {
      const check = run('python3', ['-c', 'import dbus; bus = dbus.SessionBus(); bus.get_object("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop")'], probeOptions);
      if (check.status === 0) return { available: true };
      return { available: false, error: 'ScreenCast portal unavailable via DBus' };
    }
    return { available: false, error: 'STREAM_PIPEWIRE_NODE must identify an accessible video node; authorize screen sharing first. Portal-only private remotes are not supported.' };
  }
  const args = pipewireVideoArgs(config);
  args.splice(4, 0, 'num-buffers=1');
  args.splice(args.indexOf('fdsink'), 3, 'fakesink');
  const result = run('gst-launch-1.0', args, probeOptions);
  return result.status === 0 ? { available: true } : {
    available: false, error: String(result.stderr || result.error?.message || 'PipeWire video probe timed out').trim(),
  };
}

function setupPipewireAudioSink(sinkName, run = spawnSync) {
  if (!/^[A-Za-z0-9_.-]+$/.test(sinkName)) throw new Error('Invalid PipeWire sink name.');
  const info = run('pactl', ['info'], probeOptions);
  if (info.status !== 0) return { available: false, error: 'PipeWire/PulseAudio server or pactl unavailable' };
  const result = run('pactl', ['load-module', 'module-null-sink', `sink_name=${sinkName}`,
    'rate=48000', 'channels=2', 'sink_properties=media.class=Audio/Sink'], probeOptions);
  const id = String(result.stdout || '').trim();
  if (result.status !== 0 || !/^\d+$/.test(id)) {
    return { available: false, error: String(result.stderr || 'Could not create isolated sink').trim() };
  }
  return { available: true, moduleId: id, sinkName, target: `${sinkName}.monitor` };
}

function cleanupPipewireAudioSink(moduleId, run = spawnSync) {
  if (moduleId === null || moduleId === undefined) return true;
  return run('pactl', ['unload-module', uint32(moduleId, 'moduleId', false)], probeOptions).status === 0;
}

function pipewireAudioArgs(target, queue = '128') {
  return ['-thread_queue_size', String(queue), '-f', 'pulse', '-sample_rate', '48000', '-channels', '2', '-i', target];
}

function preparePipewireAudio(config, run = spawnSync) {
  let sink = null;
  const warnings = [];
  if (config.pipewireAudioIsolate) {
    sink = setupPipewireAudioSink(config.pipewireAudioSink, run);
    if (!sink.available) warnings.push(`Audio isolation unavailable: ${sink.error}`);
  }
  const probe = target => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin',
    ...pipewireAudioArgs(target), '-t', '0.1', '-f', 'null', '-'], probeOptions).status === 0;
  if (sink?.available) {
    if (probe(sink.target)) return { ...sink, mode: 'pipewire', warnings };
    // Keep the ID for the caller to retry cleanup if the server temporarily disappears.
    if (!cleanupPipewireAudioSink(sink.moduleId, run)) {
      warnings.push(`Could not unload audio module ${sink.moduleId}; cleanup will retry.`);
    } else sink.moduleId = null;
    warnings.push('Isolated monitor capture failed; trying a non-isolated monitor.');
  }
  const explicit = config.linuxAudioDevice && config.linuxAudioDevice !== 'default' ? config.linuxAudioDevice : null;
  const target = explicit || '@DEFAULT_MONITOR@';
  if (probe(target)) return { mode: 'pipewire', target, moduleId: sink?.moduleId, warnings: [...warnings,
    `Capturing non-isolated audio from ${target}; desktop sounds may enter the broadcast.`] };
  return { mode: 'browser', moduleId: sink?.moduleId, warnings: [...warnings,
    'PipeWire/Pulse capture unavailable; falling back to browser WebAudio.'] };
}

function resolveLinuxCaptureMode(config, { platform = process.platform, env = process.env,
  hasXvfb = () => false, probeKms = () => ({ available: false }),
  probePipewire = () => ({ available: false }), warn = () => {} } = {}) {
  const fallback = () => platform === 'linux' && hasXvfb() ? 'xvfb' : 'puppeteer-stream';
  let mode = config.captureMode;
  if (mode === 'auto') {
    mode = platform === 'linux' && config.isSteamDeck && config.fps >= 60 && (env.DISPLAY || env.WAYLAND_DISPLAY)
      ? 'kmsgrab' : fallback();
  }
  if (mode !== 'kmsgrab' && mode !== 'pipewire') return mode;
  if (platform !== 'linux') { warn(`${mode} is Linux-only; using tab capture.`); return 'puppeteer-stream'; }
  if (mode === 'kmsgrab' && config.kmsHeadlessXvfb) {
    warn('Xvfb has no DRM/KMS scanout plane. STREAM_KMS_HEADLESS_XVFB uses x11grab/tab capture instead; run gamescope on an active DRM output for KMS.');
    return fallback();
  }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) {
    warn(`${mode} requires a visible Chromium display session; falling back to virtual/tab capture.`);
    return fallback();
  }
  const result = mode === 'kmsgrab' ? probeKms() : probePipewire();
  if (result.available) return mode;
  if (result.error === 'CAP_SYS_ADMIN required') {
    warn('[IPTV] KMSGrab requires CAP_SYS_ADMIN permissions. Run: sudo setcap cap_sys_admin+ep $(which ffmpeg)');
    warn('CAP_SYS_ADMIN is broad privilege; use only a trusted dedicated FFmpeg binary, not the browser or Node.');
  } else warn(`${mode} preflight failed: ${result.error || 'unavailable'}`);
  const next = fallback();
  warn(`Falling back from ${mode} to ${next}.`);
  return next;
}

module.exports = { kmsgrabInputArgs, probeKmsgrabCapability, pipewireVideoArgs, pipewireInputArgs,
  probePipewireVideo, setupPipewireAudioSink, cleanupPipewireAudioSink, pipewireAudioArgs,
  preparePipewireAudio, resolveLinuxCaptureMode };