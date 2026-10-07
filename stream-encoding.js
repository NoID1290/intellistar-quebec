// Pure encoding helpers shared by startup probes, the live pipeline, and tests.
function bitrateBits(value) {
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)([kmg]?)$/i);
  if (!match) throw new Error(`Invalid bitrate '${value}'; use e.g. 6000k or 6M.`);
  const bits = Math.round(Number(match[1]) * ({ '': 1, k: 1e3, m: 1e6, g: 1e9 }[match[2].toLowerCase()]));
  if (!Number.isSafeInteger(bits) || bits <= 0) throw new Error(`Invalid bitrate '${value}'.`);
  return bits;
}

function normalizeEncoder(encoder) {
  return encoder === 'h265_vaapi' ? 'hevc_vaapi' : encoder;
}

function isVaapi(encoder) {
  return encoder === 'h264_vaapi' || encoder === 'hevc_vaapi';
}

function isKmsgrab(captureMode) {
  return captureMode === 'kmsgrab';
}

function isPipewire(captureMode) {
  return captureMode === 'pipewire';
}

function rateControl(config) {
  const target = bitrateBits(config.videoBitrate);
  const maxrate = bitrateBits(config.videoMaxrate || config.videoBitrate);
  if (maxrate < target) throw new Error('STREAM_VIDEO_MAXRATE must be at least STREAM_VIDEO_BITRATE.');
  const bufsize = config.videoBufsize ? bitrateBits(config.videoBufsize) : target * 2;
  return { target, maxrate, bufsize, mode: maxrate > target ? 'VBR' : 'CBR' };
}

function keyframeFrames(config) {
  const seconds = config.keyframeSeconds ?? config.hlsSegmentTime ?? 4;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10) {
    throw new Error('STREAM_KEYFRAME_INTERVAL must be between 0 and 10 seconds.');
  }
  const frames = Math.round(seconds * config.fps);
  if (!Number.isInteger(frames) || frames < 1) throw new Error('Keyframe interval must span at least one frame.');
  return frames;
}

// Intermediate tab-capture bitrate: preset/explicit value, else at least twice the output target.
function captureBitrate(config) {
  return config.captureVideoBitrate ? bitrateBits(config.captureVideoBitrate) : Math.max(8000000, rateControl(config).target * 2);
}

function vaapiEncoderArgs(config, encoder) {
  return [
    '-rc_mode', rateControl(config).mode,
    '-profile:v', encoder === 'hevc_vaapi' ? 'main' : 'high',
    // Deck VCN H.264 does not support B-frames. Keep independent, predictable GOPs.
    '-bf', '0', '-idr_interval', '0',
    '-async_depth', String(config.vaapiAsyncDepth || 4),
  ];
}

function isNdi(config) {
  return Boolean(config && config.outputMode === 'ndi');
}

function videoFilter(config, encoder, hardwareInput = false, inputFormat = 'raw') {
  const { captureWidth: cw, captureHeight: ch, outputWidth: ow, outputHeight: oh, fps } = config;
  for (const dimension of [cw, ch, ow, oh]) {
    if (!Number.isInteger(dimension) || dimension <= 0 || dimension % 2) {
      throw new Error('Capture/output dimensions must be positive even integers for 4:2:0 video.');
    }
  }
  if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error('STREAM_FPS must be between 1 and 120.');
  const ndiMode = isNdi(config);
  const targetPixelFormat = ndiMode ? (config.ndiPixelFormat || 'uyvy422') : (encoder === 'h264_qsv' ? 'nv12' : 'yuv420p');

  if (inputFormat === 'drm_prime') {
    const filters = [];
    if (isVaapi(encoder) && !ndiMode) {
      filters.push('hwmap=derive_device=vaapi');
      if (cw * oh === ch * ow) {
        // Same aspect ratio: direct GPU hardware scale & color conversion
        filters.push(`scale_vaapi=w=${ow}:h=${oh}:format=nv12:mode=hq`);
      } else {
        // Different aspect ratio: 100% GPU hardware scale + pad_vaapi (zero-copy VRAM)
        const scaleRatio = Math.min(ow / cw, oh / ch);
        const fitW = Math.round((cw * scaleRatio) / 2) * 2;
        const fitH = Math.round((ch * scaleRatio) / 2) * 2;
        const padX = Math.round((ow - fitW) / 2);
        const padY = Math.round((oh - fitH) / 2);
        filters.push(`scale_vaapi=w=${fitW}:h=${fitH}:format=nv12:mode=hq`);
        if (fitW !== ow || fitH !== oh) {
          filters.push(`pad_vaapi=w=${ow}:h=${oh}:x=${padX}:y=${padY}`);
        }
      }
      // Note: No CPU 'fps' filter in the VAAPI chain! Framerate is enforced via kmsgrab -framerate and muxer -r/-fps_mode cfr.
    } else {
      // DRM hwcontext does not support hwdownload; read-map CPU-accessible BGR0 scanout instead.
      const scaleAndPad = [
        `scale=${ow}:${oh}:flags=bicubic:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        `pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black`,
      ];
      if (!ndiMode) {
        filters.push('hwmap=mode=read', 'format=bgr0', 'format=yuv420p', ...scaleAndPad);
        if (encoder === 'h264_qsv') filters.push('format=nv12');
      } else {
        filters.push('hwmap=mode=read', 'format=bgr0', ...scaleAndPad, `format=${targetPixelFormat}`);
      }
      filters.push(`fps=fps=${fps}:round=near`);
    }
    return filters.join(',');
  }
  // Drop excess frames BEFORE conversion/upload, not after costly pixel processing.
  const filters = [`fps=fps=${fps}:round=near`];
  const resize = cw !== ow || ch !== oh;
  const sameAspect = cw * oh === ch * ow;
  if (isVaapi(encoder) && !ndiMode) {
    const gpuScale = `scale_vaapi=w=${ow}:h=${oh}:format=nv12:mode=hq`;
    if (resize && !sameAspect) {
      if (hardwareInput) filters.push('hwdownload', 'format=nv12');
      // CPU padding preserves letterboxing when the requested aspect ratio differs.
      filters.push(`scale=${ow}:${oh}:flags=bicubic:force_original_aspect_ratio=decrease:force_divisible_by=2`,
        `pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black`, 'format=nv12', 'hwupload');
    } else if (!hardwareInput) {
      // Upload raw capture as-is; the GPU VPP does the colorspace conversion instead of the CPU.
      filters.push('hwupload', resize ? gpuScale : 'scale_vaapi=format=nv12');
    } else if (resize) {
      filters.push(gpuScale);
    }
  } else {
    if (hardwareInput) filters.push('hwdownload', 'format=nv12');
    if (resize) filters.push(`scale=${ow}:${oh}:flags=bicubic:force_original_aspect_ratio=decrease:force_divisible_by=2`,
      `pad=${ow}:${oh}:(ow-iw)/2:(oh-ih)/2:color=black`);
    filters.push(`format=${targetPixelFormat}`);
  }
  return filters.join(',');
}

module.exports = { bitrateBits, normalizeEncoder, isVaapi, isKmsgrab, isPipewire, isNdi, rateControl, keyframeFrames, captureBitrate, vaapiEncoderArgs, videoFilter };