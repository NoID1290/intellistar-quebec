# Engineering Directive: Integrate KMSGrab and PipeWire Capture Engines into IntelliSTAR Streaming

## Role & Mission
You are an expert Linux multimedia systems and Node.js streaming engineer specializing in FFmpeg, the Linux DRM/KMS subsystem, VAAPI hardware acceleration, and PipeWire audio/video architecture.

Your mission is to integrate two next-generation Linux capture engines into the IntelliSTAR IPTV streaming pipeline:
1. **`kmsgrab` Video Engine**: Direct Linux Kernel Mode Setting (DRM/KMS) screen capture with zero-copy DMA-BUF/DRM_PRIME mapping directly into VAAPI (`h264_vaapi` / `hevc_vaapi`). This eliminates X11/Xvfb display server overhead, eliminates Chromium tab encoding load, and enables direct framebuffer capture on SteamOS / Steam Deck and Linux HTPCs.
2. **`pipewire` Capture Engine**:
   - **Audio Engine**: Low-latency, high-fidelity PipeWire audio routing via isolated virtual sink / loopback nodes, preventing system alert sounds from bleeding into the broadcast while avoiding ALSA device contention.
   - **Video Engine**: Native Wayland / PipeWire screen capture integration via PipeWire stream nodes / Portal / GStreamer pipe.

---

## 1. Context & Existing Architecture

The IntelliSTAR simulator streams a continuous weather presentation (broadcast graphics, radar animations, audio playlist, and voice narrations) to HLS / RTMP / UDP using FFmpeg and headless Puppeteer Chromium.

### Existing Core Files:
- [`stream-config.js`](file:///home/deck/app/stream-config.js): Resolves configuration from environment variables, user config, and presets (`PRESET_MAP`). Manages video bitrate, dimensions, FPS, encoder selection, and capture engine selection.
- [`start-iptv.js`](file:///home/deck/app/start-iptv.js): Main streaming orchestrator. Spawns display servers (Xvfb), launches Puppeteer Chromium, constructs the FFmpeg CLI arguments, probes hardware encoders, manages pipes, and monitors progress.
- [`stream-encoding.js`](file:///home/deck/app/stream-encoding.js): Encoding math and filter graph builder (`videoFilter`), VAAPI arguments (`vaapiEncoderArgs`), and bitrate parsers.
- [`stream-browser.js`](file:///home/deck/app/stream-browser.js): Controls browser compatibility and `requestAnimationFrame` pacing.
- [`scripts/check-stream-pipeline.js`](file:///home/deck/app/scripts/check-stream-pipeline.js): Isolated synthetic test verifying browser -> capture -> FFmpeg -> HLS output.
- [`tests/stream-encoding.test.js`](file:///home/deck/app/tests/stream-encoding.test.js): Unit test suite for stream configuration and encoding.

### Current Capture Modes in `start-iptv.js`:
- `xvfb` / `x11grab`: Launches virtual X11 server `:99`, runs Chromium on it, captures via `ffmpeg -f x11grab -i :99.0+0,0`. High CPU/memory overhead due to software X11 blitting.
- `puppeteer-stream`: Injects WebRTC/MediaRecorder extension into Chromium to stream WebM/VP8/H.264 over stdio to FFmpeg. High CPU/GPU load inside Chromium due to double-encoding.
- `screencast`: Captures JPEG frames over Chrome DevTools Protocol (CDP). Low performance, high CPU.

### Current Audio Modes in `start-iptv.js`:
- `browser`: Captures WebAudio from puppeteer-stream via `pipe:3` or stdin.
- `file`: Loops local audio file.
- `system`: Uses DirectShow on Windows (`dshow`), ALSA/PulseAudio on Linux (`-f alsa` / `-f pulse`).
- `silent`: `lavfi` null source (`anullsrc`).

---

## 2. Technical Specification: `kmsgrab` Video Engine

### 2.1 Overview & Benefits
`kmsgrab` is FFmpeg's built-in Linux DRM (Direct Rendering Manager) / KMS (Kernel Mode Setting) input demuxer. It reads pixel buffers directly from the display controller scanout plane.
- **Zero-Copy Pipeline**: Frames captured as `drm_prime` buffers can be directly mapped into VAAPI hardware surface memory (`hwmap=derive_device=vaapi`) without copying uncompressed 1080p/4K frames through system RAM.
- **Minimal CPU Overhead**: Bypasses X11, Xvfb, compositors, and browser MediaRecorder extensions.
- **Ideal for Steam Deck**: AMD Van Gogh APU (RDNA 2) on SteamOS exposes `/dev/dri/card0` and `/dev/dri/renderD128`.

### 2.2 FFmpeg Input Flags for `kmsgrab`
```bash
# Direct DRM scanout grab
ffmpeg \
  -device /dev/dri/card0 \
  -f kmsgrab \
  -nodisplay 0 \
  -framerate 30 \
  -thread_queue_size 32 \
  -i -
```
- Optional plane/CRTC overrides via environment variables:
  - `-crtc_id <id>` (controlled by `STREAM_KMS_CRTC`)
  - `-plane_id <id>` (controlled by `STREAM_KMS_PLANE`)

### 2.3 Filter Graph (`stream-encoding.js`)
1. **VAAPI Zero-Copy Hardware Path (`h264_vaapi` / `hevc_vaapi`)**:
   `kmsgrab` produces `drm_prime` pixel format. The filter graph must derive the VAAPI device from DRM and convert to NV12 on the GPU:
   ```
   hwmap=derive_device=vaapi,scale_vaapi=w=1920:h=1080:format=nv12:mode=hq
   ```
   If aspect ratio differs and padding is needed:
   ```
   hwmap=derive_device=vaapi,hwdownload,format=nv12,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=nv12,hwupload
   ```
2. **Software Encoding Fallback Path (`libx264`)**:
   If hardware encoding is unavailable and `STREAM_ALLOW_SOFTWARE_FALLBACK=true`:
   ```
   hwdownload,format=bgr0,format=yuv420p,scale=1920:1080
   ```

### 2.4 Linux Permissions & Capability Pre-flight
- **DRM Master Security**: `kmsgrab` requires either `root` privileges or the `CAP_SYS_ADMIN` capability set on the `ffmpeg` binary:
  ```bash
  sudo setcap cap_sys_admin+ep $(which ffmpeg)
  ```
- **Pre-flight Probe in `start-iptv.js`**:
  Implement a function `probeKmsgrabCapability(drmDevice)` that tests whether `ffmpeg -device /dev/dri/card0 -f kmsgrab -framerate 1 -i - -t 0.1 -f null -` succeeds.
  - If access is denied (EPERM / permission denied), log a user-friendly diagnostic warning:
    `"[IPTV] KMSGrab requires CAP_SYS_ADMIN permissions. Run: sudo setcap cap_sys_admin+ep $(which ffmpeg)"`
  - Fall back gracefully to `xvfb` (if installed) or `puppeteer-stream`.

### 2.5 Browser Execution under `kmsgrab`
When using `kmsgrab`:
- Chromium must render to a screen or display buffer monitored by DRM/KMS.
- Under SteamOS Gaming Mode (gamescope) or standard X11/Wayland desktop session, Chromium runs fullscreen/kiosk (`--start-fullscreen --kiosk --ozone-platform=wayland` or `--ozone-platform=x11`).
- Provide an environment flag `STREAM_KMS_HEADLESS_XVFB=true` to optionally run an Xvfb/Gamescope session that KMSGrab attaches to when running completely headless without an active physical display.

---

## 3. Technical Specification: `pipewire` Capture Engine

### 3.1 Audio Capture Engine (`STREAM_AUDIO_MODE=pipewire`)
PipeWire is the modern low-latency multimedia routing daemon on modern Linux and SteamOS (`PulseAudio on PipeWire 1.6.8`).

#### Objectives:
1. Provide zero-latency, high-fidelity 48 kHz stereo audio capture for FFmpeg.
2. Prevent ALSA device locking (e.g. `Device or resource busy`).
3. **Application Isolation**: Create a dedicated PipeWire virtual sink (null-sink) named `IntelliStar_Audio`:
   ```bash
   pactl load-module module-null-sink sink_name=IntelliStar_Audio sink_properties=media.class=Audio/Sink
   ```
   Route Chromium's audio output exclusively to `IntelliStar_Audio`, and attach FFmpeg's audio input to `IntelliStar_Audio.monitor`. This completely isolates the stream from desktop sound effects, notifications, and voice chat.
4. If virtual sink creation is not requested or fails, capture from the default PipeWire monitor source or specified device.

#### FFmpeg Audio Input Args:
```bash
-thread_queue_size 128 \
-f pulse \
-i IntelliStar_Audio.monitor
```
*(Note: FFmpeg's `-f pulse` input driver connects natively to PipeWire via its socket `/run/user/1000/pulse/native` with zero latency).*
Alternative native PipeWire CLI pipe via `pw-record`:
```bash
pw-record --target <node_id> --rate 48000 --channels 2 --format s16 - | ffmpeg -f s16le -ar 48000 -ac 2 -i pipe:3
```

#### Lifecycle & Cleanup:
When the stream shuts down (in `start-iptv.js` exit handlers and `stop.sh`), unload the virtual null-sink module:
```bash
pactl unload-module <module_id>
```

### 3.2 Video Capture Engine (`STREAM_CAPTURE_MODE=pipewire`)
On Wayland systems, screensharing and window capture occur via PipeWire video streams:
- Support `-f pipewire` if compiled into FFmpeg, or capture via GStreamer `pipewiresrc` pipeline / `pw-cat`:
  ```bash
  gst-launch-1.0 -q pipewiresrc path=<target_node> ! video/x-raw,format=BGRx ! fdsink fd=1 | ffmpeg -f rawvideo -pix_fmt bgr0 -s 1920x1080 -r 30 -i -
  ```
- Expose `STREAM_PIPEWIRE_NODE` for explicit node selection.

---

## 4. Configuration Schema Updates (`stream-config.js`)

Add the following configuration options and environment variable overrides to `stream-config.js`:

```javascript
// In userConfig / module.exports:
{
  // Capture Engine
  // 'auto' | 'kmsgrab' | 'pipewire' | 'xvfb' | 'puppeteer-stream' | 'screencast'
  captureMode: process.env.STREAM_CAPTURE_MODE || userConfig.captureMode || 'puppeteer-stream',

  // KMSGrab Settings
  kmsDevice: process.env.STREAM_KMS_DEVICE || userConfig.kmsDevice || '/dev/dri/card0',
  kmsCrtc: process.env.STREAM_KMS_CRTC ? parseInt(process.env.STREAM_KMS_CRTC, 10) : null,
  kmsPlane: process.env.STREAM_KMS_PLANE ? parseInt(process.env.STREAM_KMS_PLANE, 10) : null,
  kmsHeadlessXvfb: process.env.STREAM_KMS_HEADLESS_XVFB === 'true',

  // PipeWire Audio Settings
  // 'browser' | 'pipewire' | 'file' | 'system' | 'silent'
  audioMode: process.env.STREAM_AUDIO_MODE || userConfig.audioMode || 'browser',
  pipewireAudioSink: process.env.STREAM_PIPEWIRE_AUDIO_SINK || 'IntelliStar_Audio',
  pipewireAudioIsolate: process.env.STREAM_PIPEWIRE_AUDIO_ISOLATE !== 'false', // default true

  // PipeWire Video Settings
  pipewireVideoNode: process.env.STREAM_PIPEWIRE_NODE || null,
}
```

### Add Presets to `PRESET_MAP`:
- `'deck-kms'`: 1920x1080 @ 60fps, 8000k bitrate, `videoEncoder: 'h264_vaapi'`, `captureMode: 'kmsgrab'`, `audioMode: 'pipewire'`, `deck: true`.
- Update `'auto'` mode resolution logic:
  If running on Linux on Steam Deck and `kmsgrab` capability passes, allow selecting `kmsgrab` for high-performance presets.

---

## 5. Implementation Roadmap & Detailed Changes

### Step 1: `stream-encoding.js`
1. Update `videoFilter(config, encoder, hardwareInput = false, inputFormat = 'raw')`:
   - Add support for `inputFormat === 'drm_prime'` (used by `kmsgrab`).
   - When `inputFormat === 'drm_prime'` and `isVaapi(encoder)`:
     Generate filter chain: `hwmap=derive_device=vaapi,scale_vaapi=w=${ow}:h=${oh}:format=nv12:mode=hq`.
   - When `inputFormat === 'drm_prime'` and software encoding (`libx264`):
     Generate filter chain: `hwdownload,format=bgr0,format=yuv420p` + scaling.
2. Export helper functions `isKmsgrab(captureMode)` and `isPipewire(captureMode)`.

### Step 2: `start-iptv.js` - Capability Probing & Preflight
1. Add `probeKmsgrabCapability(device)`:
   - Run quick `spawnSync('ffmpeg', ['-device', device, '-f', 'kmsgrab', '-framerate', '1', '-i', '-', '-t', '0.1', '-f', 'null', '-'])`.
   - Check if returncode is 0 or if stderr mentions `Permission denied` / `Operation not permitted`.
   - If permission fails, return `{ available: false, error: 'CAP_SYS_ADMIN required' }`.
2. Add `setupPipewireAudioSink(sinkName)`:
   - Check if `pactl` exists and PipeWire/Pulse server is active.
   - Run `pactl load-module module-null-sink sink_name=${sinkName} sink_properties=media.class=Audio/Sink`.
   - Parse returned module ID so it can be unlinked upon SIGINT/SIGTERM.
   - Set environment `PULSE_SINK=${sinkName}` for the Chromium browser spawn so browser audio routes automatically into the isolated sink.
3. Add `cleanupPipewireAudioSink(moduleId)`:
   - Unload module via `pactl unload-module ${moduleId}` on process exit.

### Step 3: `start-iptv.js` - FFmpeg Argument Construction
1. In the input selection section:
   - When `captureMode === 'kmsgrab'`:
     ```javascript
     ffmpegArgs.push(
       '-device', config.kmsDevice || '/dev/dri/card0',
       '-f', 'kmsgrab'
     );
     if (config.kmsCrtc !== null) ffmpegArgs.push('-crtc_id', String(config.kmsCrtc));
     if (config.kmsPlane !== null) ffmpegArgs.push('-plane_id', String(config.kmsPlane));
     ffmpegArgs.push(
       '-framerate', `${config.fps}`,
       '-thread_queue_size', threadQueueSize,
       '-i', '-'
     );
     ```
   - When `captureMode === 'pipewire'`:
     Add PipeWire demuxer args or GStreamer/pipewire node input.
2. In the audio selection section:
   - When `config.audioMode === 'pipewire'`:
     ```javascript
     const audioTarget = config.pipewireAudioIsolate ? `${config.pipewireAudioSink}.monitor` : (config.linuxAudioDevice || 'default');
     logger.audio(`[IPTV] Audio mode: PipeWire isolated loopback (${audioTarget})`);
     ffmpegArgs.push('-thread_queue_size', threadQueueSize, '-f', 'pulse', '-i', audioTarget);
     ```
3. Update `videoFilter` call:
   Pass `inputFormat = (captureMode === 'kmsgrab' ? 'drm_prime' : 'raw')`.

### Step 4: Cleanup & Lifecycle (`start-iptv.js` & `stop.sh`)
- Register process event listeners (`SIGINT`, `SIGTERM`, `exit`, `uncaughtException`) to clean up:
  - PipeWire virtual sink modules (`pactl unload-module`).
  - Xvfb display locks if headless KMS helper was used.
- Update `stop.sh` to remove any lingering `IntelliStar_Audio` null-sinks:
  ```bash
  pactl list short modules | grep IntelliStar_Audio | awk '{print $1}' | xargs -r -n1 pactl unload-module
  ```

### Step 5: Unit Tests (`tests/`)
1. Create `tests/kmsgrab-pipewire.test.js`:
   - Test `stream-config.js` correctly parses `STREAM_CAPTURE_MODE=kmsgrab` and `STREAM_CAPTURE_MODE=pipewire`.
   - Test `stream-config.js` correctly parses `STREAM_AUDIO_MODE=pipewire` and custom sink names.
   - Test `stream-encoding.js` produces valid filter strings:
     - `hwmap=derive_device=vaapi,scale_vaapi=w=1920:h=1080:format=nv12:mode=hq` for kmsgrab + VAAPI.
     - `hwdownload,format=bgr0,format=yuv420p` for kmsgrab + libx264 software fallback.
   - Test argument builders reject invalid KMS CRTC or plane values.
2. Update `tests/stream-encoding.test.js` to ensure existing preset tests remain valid.

### Step 6: Documentation (`COMMANDS.md` and `README.md`)
- Document new environment variables:
  - `STREAM_CAPTURE_MODE=kmsgrab`
  - `STREAM_CAPTURE_MODE=pipewire`
  - `STREAM_KMS_DEVICE`
  - `STREAM_KMS_CRTC`
  - `STREAM_KMS_PLANE`
  - `STREAM_AUDIO_MODE=pipewire`
  - `STREAM_PIPEWIRE_AUDIO_SINK`
- Provide Linux / SteamOS permission setup instructions:
  ```bash
  # Grant FFmpeg permission for direct DRM/KMS capture without root
  sudo setcap cap_sys_admin+ep $(which ffmpeg)
  ```

---

## 6. Acceptance Criteria

1. **Clean Syntax & Architectural Fit**:
   - Follow existing code idioms (`logger.capture()`, `logger.audio()`, config inheritance).
   - Zero regression for Windows (`gdigrab`, `dshow`), macOS, and standard Linux (`xvfb`, `puppeteer-stream`).
2. **Robust Fallbacks**:
   - If `kmsgrab` fails pre-flight (e.g. lack of `CAP_SYS_ADMIN`), clear diagnostic message is logged and the engine automatically falls back to `xvfb` or `puppeteer-stream`.
   - If PipeWire is not available, audio falls back to `pulse`, `alsa`, or `browser`.
3. **No Memory or Resource Leaks**:
   - PipeWire virtual sink modules are reliably torn down on exit.
   - No zombie FFmpeg or browser processes.
4. **All Tests Pass**:
   - `npm test` passes cleanly.
   - `tests/kmsgrab-pipewire.test.js` passes 100%.
