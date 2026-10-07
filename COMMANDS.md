# IntelliSTAR Simulator — Commands & Cheat Sheet

Comprehensive guide for all commands, CLI tools, REST APIs, URL parameters, and console scripts in the IntelliSTAR Simulator.

**Quick launcher:** run `./launch.sh` or `npm run launcher`. One terminal menu
starts OBS HLS/NDI in the background, configures encoding presets (720p/1080p/4K @ 24/30/60 fps),
and provides forecast, alert, message, editor, VLC, status, stop and log commands.
Menu-started broadcasts survive SSH disconnects while the Deck desktop remains active. See [OBS_SETUP.md](OBS_SETUP.md).

---

## Table of Contents
1. [Server & IPTV Stream Commands](#1-server--iptv-stream-commands)
2. [Forecast Presentation Control (CLI)](#2-forecast-presentation-control-cli)
3. [Alert Injection Commands (CLI)](#3-alert-injection-commands-cli)
4. [Custom LDL Network Message Commands (CLI)](#4-custom-ldl-network-message-commands-cli)
5. [Live JS Hot-Reload (CLI)](#5-live-js-hot-reload-cli)
6. [HTTP REST API Endpoints](#6-http-rest-api-endpoints)
7. [URL Query Parameters](#7-url-query-parameters)
8. [Browser Console Commands](#8-browser-console-commands)
9. [Music & Custom Folder Details](#9-music--custom-folder-details)
10. [IPTV Environment Variables](#10-iptv-environment-variables)

---

## 1. Server & IPTV Stream Commands

Run these commands from the root project folder (`l:\`):

| Action | NPM Command | Windows Batch | Linux/macOS Shell |
|---|---|---|---|
| **Start Web Server** | `npm start` | `start.bat` | `./start.sh` |
| **Unified Command Menu** | `npm run launcher` | Not supported | `./launch.sh` |
| **Change Encoding Preset** | `node launcher.js encoding [720p\|1080p\|4k] [24\|30\|60]` | `node launcher.js encoding` | `node launcher.js encoding [720p\|1080p\|4k] [24\|30\|60]` |
| **Create OBS HLS Profile** | `npm run obs:setup-hls` | Not supported | `node start-obs.js setup-hls` |
| **Start OBS HLS** | `npm run start-obs-hls` | Not supported | `node start-obs.js start hls` |
| **Start IPTV Stream** *(Color Bars Init)* | `npm run start-iptv` | `start-iptv.bat` | `./start-iptv.sh` |
| **Check OBS Setup** *(Linux Desktop)* | `npm run obs:check` | Not supported | `node start-obs.js check` |
| **Start Background OBS** *(Experimental NDI Backend)* | `npm run start-obs` | Not supported | `node start-obs.js start` |
| **OBS Backend Status** | `npm run obs:status` | Not supported | `node start-obs.js status` |
| **Stop Owned OBS Backend** | `npm run obs:stop` | Not supported | `node start-obs.js stop` |
| **Setup NDI Output** *(SDK & Bridge)* | `npm run setup-ndi` | — | `bash scripts/setup-ndi.sh` |
| **Start NDI Broadcast** *(Raw LAN Stream)* | `npm run start-ndi` | `STREAM_MODE=ndi npm run start-iptv` | `STREAM_MODE=ndi npm run start-iptv` |
| **Open Stream in VLC** | `npm run vlc` | `open-stream-vlc.bat` | `bash open-stream-vlc.sh` |
| **Start Forecast Presentation** | `npm run forecast:start` | `start-forecast.bat` | `./start-forecast.sh` |
| **Stop Forecast** *(Return to Color Bars)* | `npm run forecast:stop` | `stop-forecast.bat` | `./stop-forecast.sh` |
| **Send Custom LDL Message** | `npm run message -- "<msg>"` | `message.bat "<msg>"` | `./message.sh "<msg>"` |
| **Hot-Reload All JS (Zero Downtime)** | `npm run refresh` | `refresh.bat` | `./refresh.sh` |
| **Inject Alert Test** | `npm run alert -- <type>` | `node alert.js <type>` | `node alert.js <type>` |
| **Generate All UI Assets & Icons** | `npm run generate:all` | Not supported | `npm run generate:all` |
| **Generate 24/30/60 fps Icons** | `npm run generate:icons:all` | Not supported | `npm run generate:icons:all` |
| **Generate 24 fps Icons** | `npm run generate:icons:24` | Not supported | `npm run generate:icons:24` |
| **Generate 30 fps Icons** | `npm run generate:icons:30` | Not supported | `npm run generate:icons:30` |
| **Generate 60 fps Icons** | `npm run generate:icons:60` | Not supported | `npm run generate:icons:60` |
| **Generate 2026 UI Assets** | `npm run generate:assets` | Not supported | `npm run generate:assets` |
| **Put Monitors to Sleep (Turn Off Screen)** | `node launcher.js sleep` | Not supported | `node launcher.js sleep` |
| **Wake Monitors** | `node launcher.js wake` | Not supported | `node launcher.js wake` |
| **Display Power Status** | `node display-control.js status` | Not supported | `node display-control.js status` |
| **Install Dependencies** | `npm install` | `install.bat` | `./install.sh` |
| **Stop Running Stream & Server** | `npm run stop` | `stop.bat` | `./stop.sh` |

> **Note on IPTV Flow**: When launching `npm run start-iptv` (or `start-iptv.bat` / `./start-iptv.sh`), the IPTV stream initializes and remains at the **SMPTE Color Bars & 1000 Hz Calibration Tone** screen. Use `start-forecast.bat` (or `node forecast.js start`) to transition into the live weather presentation, and `stop-forecast.bat` (or `node forecast.js stop`) to return back to color bars without killing the stream.

### Background OBS Instead of Puppeteer Capture

Complete [OBS_SETUP.md](OBS_SETUP.md) once before using the OBS commands. This
Linux desktop backend renders `http://127.0.0.1:7070/?iptv` directly in OBS and
uses its saved DistroAV NDI output. It does not run the legacy capture pipeline.
Forecast, alert, editor and message controls remain available. Use `obs:stop`,
not the legacy `stop` command, to stop this backend; a reused web server is left
running. `obs:status` reports process/app health, not successful NDI delivery.

Choose `OBS_INSTALLATION=native` or `flatpak` if both are installed. Saved names
default to `IntelliSTAR` and can be set using `OBS_PROFILE`, `OBS_COLLECTION`,
and `OBS_SCENE`. A changed `PORT` must match the Browser Source URL. Set FPS,
dimensions and NDI options in OBS, not through legacy `STREAM_VIDEO_*` variables.
OBS runs minimized in an active desktop session, not as a headless daemon.

---

## 2. Forecast Presentation Control (CLI)

Use the built-in `forecast.js` CLI (or batch/shell scripts) to transition into and out of the forecast presentation on demand.

### Basic Syntax
```bash
node forecast.js <start|stop|status>
# Or via npm
npm run forecast:start
npm run forecast:stop
npm run forecast -- status
```

### Examples
```bash
# Start the weather forecast presentation (fades out color bars and starts slides & audio)
node forecast.js start

# Stop the forecast and return to color bars & 1000 Hz calibration tone (stream remains alive)
node forecast.js stop

# Check current forecast status
node forecast.js status
```

---

## 3. Alert Injection Commands (CLI)

Use the built-in `alert.js` CLI to trigger or clear alert tests in real-time while the simulator is running without restarting the server.

### Basic Syntax
```bash
node alert.js <type|command>
# Or via npm
npm run alert -- <type|command>
```

### Common Examples

```bash
# Trigger specific alerts by alias
node alert.js tornado
node alert.js severe
node alert.js amber
node alert.js flash-flood
node alert.js blizzard
node alert.js winter-storm
node alert.js ice-storm
node alert.js smog
node alert.js heat
node alert.js wind

# Trigger alert test with auto-expiry duration (in seconds)
node alert.js tornado --duration 30
node alert.js severe -d 60
node alert.js quebec --duration 45

# Trigger with full disaster name in quotes
node alert.js "Tornado Warning"
node alert.js "Severe Thunderstorm Warning"
node alert.js "Avertissement de tempête hivernale"

# Trigger Québec En Alerte suite (civil emergency, tornado, amber, etc.)
node alert.js quebec

# Trigger all disaster alerts in catalog simultaneously
node alert.js all

# Clear active alert test (returns to normal live weather)
node alert.js clear

# List all available alert types and aliases
node alert.js list
```

---

## 4. Custom LDL Network Message Commands (CLI)

Inject custom text messages that crawl across the LDL marquee banner in real-time at any moment without interrupting or dropping the stream.

### Basic Syntax
```bash
node message.js "<your message text>"
# Or via npm
npm run message -- "<your message text>"
# Or via batch / shell
message.bat "<your message text>"
./message.sh "<your message text>"
```

### Examples
```bash
# Display immediate custom marquee banner in LDL
node message.js "Bienvenue sur le canal météo IntelliSTAR"
node message.js "Abonnez-vous à notre chaîne pour plus de prévisions"
node message.js "Suivez notre bulletin météo en direct 24/7"

# Clear active custom message command
node message.js clear
```

---

## 5. Live JS Hot-Reload (CLI)

When you make changes to frontend JavaScript files (`webroot/js/slides.js`, `ldl.js`, `radar.js`, `weather.js`, `settings.js`, `config.js`, `audio.js`, etc.), you can reload all scripts in the running client **instantly** without killing or restarting the IPTV stream.

### Basic Syntax
```bash
node refresh.js
# Or via npm
npm run refresh
# Or via batch / shell
refresh.bat
./refresh.sh
```

---

## 6. HTTP REST API Endpoints

You can trigger forecast transitions, alerts, custom LDL messages, live JS hot-reloads, or inspect system data remotely using `curl` or any HTTP client on port `7070`:

### Forecast Control Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/forecast/start` | GET / POST | Start the forecast presentation |
| `/api/forecast/stop` | GET / POST | Stop the forecast and return to color bars |
| `/api/forecast` | GET | Retrieve current forecast status |

#### Curl Examples
```bash
# Start forecast presentation
curl http://localhost:7070/api/forecast/start

# Stop forecast presentation (return to color bars)
curl http://localhost:7070/api/forecast/stop

# Check forecast state
curl http://localhost:7070/api/forecast
```

### Custom LDL Message Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/message/send?text=<msg>` | GET / POST | Inject custom text into LDL crawl immediately |
| `/api/message?text=<msg>` | GET / POST | Shortcut to inject custom text into LDL crawl |
| `/api/message/clear` | GET / POST | Clear active message command |
| `/api/message` | GET | Retrieve current message state |

#### Curl Examples
```bash
# Send custom LDL crawl text
curl "http://localhost:7070/api/message/send?text=Previsions+locales+en+cours"

# Clear message command
curl http://localhost:7070/api/message/clear
```

### Live JS Hot-Reload Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/refresh?trigger=1` | GET | Trigger live hot-reload of all frontend JS modules |
| `/api/refresh` | POST | Trigger live hot-reload of all frontend JS modules |
| `/api/refresh` | GET | Retrieve current refresh command state |

#### Curl Examples
```bash
# Hot-reload all frontend JavaScript files
curl "http://localhost:7070/api/refresh?trigger=1"
curl -X POST http://localhost:7070/api/refresh
```

### Alert Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/alert/trigger?type=<type>` | GET / POST | Trigger specific alert test |
| `/api/alert/quebec` | GET / POST | Trigger Québec En Alerte suite |
| `/api/alert/all` | GET / POST | Trigger all disaster alerts |
| `/api/alert/clear` | GET / POST | Clear active alert test |
| `/api/alert` | GET | Retrieve current alert test state |

#### Curl Examples
```bash
# Trigger Tornado Warning with crawl & tone
curl http://localhost:7070/api/alert/trigger?type=tornado

# Trigger AMBER Alert without lower crawl banner
curl "http://localhost:7070/api/alert/trigger?type=amber&includeCrawl=false"

# Trigger Quebec alert suite
curl http://localhost:7070/api/alert/quebec

# Trigger all alerts
curl http://localhost:7070/api/alert/all

# Clear alert test
curl http://localhost:7070/api/alert/clear
```

### System & Music Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/music` | GET | Returns array of all detected audio files in `webroot/music/custom/` |
| `/api/config` | GET | Returns contents of `MYCONFIG.json` |
| `/stream/index.m3u8` | GET | Live HLS IPTV video playlist |

### Touch Launcher & Display Power Endpoints (Port 7080)
| Endpoint | Method | Description |
|---|---|---|
| `/api/launcher/status` | GET | Comprehensive telemetry: OBS, app, alerts, CPU/GPU/RAM/Disk, encoding, and display status |
| `/api/launcher/action` | POST | Trigger launcher actions (`sleep-monitors`, `wake-monitors`, `set-encoding`, `close-instance`, etc.) |

#### Display Power Examples
```bash
# Put all Steam Deck displays to sleep (DPMS off)
curl -X POST http://localhost:7080/api/launcher/action \
  -H "Content-Type: application/json" \
  -d '{"action":"sleep-monitors"}'

# Wake displays remotely
curl -X POST http://localhost:7080/api/launcher/action \
  -H "Content-Type: application/json" \
  -d '{"action":"wake-monitors"}'
```

---

## 7. URL Query Parameters

Append parameters to the URL to start the simulator with pre-set modes:

| URL Parameter | Description |
|---|---|
| `?iptv` | Initializes with SMPTE color bars and 1000 Hz calibration tone |
| `?alertTest=tornado` | Auto-starts with Tornado Warning alert test |
| `?alertTest=amber` | Auto-starts with AMBER alert test |
| `?alertTest=quebec` | Auto-starts with Québec En Alerte suite |
| `?alertTest=all` | Auto-starts with all disaster alerts |
| `?alertTestCrawl=false` | Disables the lower red alert crawl banner |
| `?iptv&alertTest=tornado` | Combines IPTV mode with Tornado Warning test |

---

## 8. Browser Console Commands

Open Developer Tools Console (F12) on the web page:

### Forecast Presentation Controls
```javascript
// Start the forecast presentation
window.startForecast();

// Stop the forecast and return to color bars & calibration tone
window.stopForecast();
```

### Custom LDL Message & Live JS Reload
```javascript
// Show custom marquee message in LDL crawl
window.showLDLMessage("Votre message personnalisé ici");

// Hot-reload all frontend JavaScript modules immediately
window.reloadScripts();
```

### Alert Commands
```javascript
// Trigger specific alerts
alertTest.trigger("tornado");
alertTest.trigger("amber");
alertTest.trigger("severe");
alertTest.trigger("blizzard");
alertTest.trigger("Alerte de tornade");

// Trigger suites
alertTest.triggerQuebec();
alertTest.triggerAll();

// Clear and return to live alerts
alertTest.clear();

// View catalog and status
alertTest.listTypes();
alertTest.status();
```

### Audio & Playlist Controls
```javascript
// Volume control (0.0 = silent, 1.0 = 100%, >1.0 = boosted)
audioPlayer.setMusicVolume(0.8);
audioPlayer.setVocalVolume(1.0);
audioPlayer.levelUpMusic(0.1);
audioPlayer.levelDownMusic(0.1);

// Stop all audio
audioPlayer.stopAll();

// Rebuild and re-randomize playlist
audioPlayer.buildPlaylist();
```

---

## 7. Music & Custom Folder Details

- **Directory**: `webroot/music/custom/`
- **Supported Formats**: `.wav`, `.mp3`, `.ogg`, `.oga`, `.m4a`, `.flac`, `.aac`, `.webm`
- **Auto-Discovery**: Any audio files placed into `webroot/music/custom/` are automatically scanned via `/api/music` and randomized using Fisher-Yates shuffle.
- **Continuous Reshuffle**: When background music finishes playing through the entire playlist, it automatically reshuffles before starting the next loop cycle.
- **Settings Config** (`webroot/js/config.js`):
  ```javascript
  var audioSettings = {
      enableMusic: true,
      shuffle: true,     // Randomizes playlist on start and reshuffles each cycle
      randomStart: true  // Starts playback at a random track
  };
  ```

---

## 8. IPTV Environment Variables

Customize streaming parameters by setting environment variables before running `npm run start-iptv`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `7070` | Web server port |
| `STREAM_PRESET` | `deck-quality` on Deck, `1080p` otherwise | `deck-kms` (1080p60, `8000k` CBR, `h264_vaapi`, KMS video + PipeWire audio), `deck-uhd` (4K30, 16 Mbps), `deck-uhd-smooth` (4K60, 25 Mbps), `deck-quality` (1080p30, 3/4 Mbps target/peak VBR HLS/UDP; 10 Mbps CBR on `rtmp`), `deck-smooth` (720p60, 5 Mbps), `deck` (720p30, 3.5 Mbps), `deck-800p`, `1080p-60fps`, `1080p`, `720p-60fps`, `720p`, `1440p-60fps`, `1440p`, `4k-60fps`, `4k`, `480p` |
| `STREAM_FPS` | Preset default (`60` or `30`) | Target frame rate (override preset default) |
| `STREAM_WIDTH` / `STREAM_HEIGHT` | Preset dimensions | Capture/browser geometry; for KMS set to actual physical scanout dimensions for correct aspect-ratio padding. For PipeWire, explicitly negotiated raw-video dimensions |
| `STREAM_OUTPUT_WIDTH` / `STREAM_OUTPUT_HEIGHT` | Capture dimensions | Encoded output size; does not change the physical display mode. Capture/output dimensions must be positive even integers |
| `STREAM_AUDIO_MODE` | `pipewire` for `deck-kms`, else `browser` | `browser` (WebAudio capture), `pipewire` (Pulse-protocol monitor capture with optional isolation), `file`, `system`, `silent`; independent of video capture mode |
| `STREAM_PIPEWIRE_AUDIO_SINK` | `IntelliStar_Audio` | Isolated null-sink name; only letters, digits, underscore, dot or hyphen. Supply the same name to [stop.sh](stop.sh) for recovery |
| `STREAM_PIPEWIRE_AUDIO_ISOLATE` | `true` | `true` / `false`: create/probe sink before browser launch and set `PULSE_SINK` only for that child; never switch global default. Disabled/failed isolation tries a non-isolated monitor with a desktop-audio warning |
| `STREAM_AUDIO_DEVICE` | `default` on Linux | For PipeWire audio's non-isolated path: an explicit non-`default` value selects the capture source (e.g. a sink monitor); otherwise uses `@DEFAULT_MONITOR@`. If that fails, browser WebAudio is used |
| `STREAM_VIDEO_ENCODER` | `h264_vaapi` | Checked-in preference; `auto` probes hardware encoders. Also `hevc_vaapi` (compatible players only), or explicit `libx264` |
| `STREAM_ALLOW_SOFTWARE_FALLBACK` | `false` on Deck / Deck presets | Opt into automatic CPU encoding when hardware is unavailable |
| `STREAM_FFMPEG_THREADS` | `2` on Deck (`3` for `deck-uhd*`), `4` otherwise | CPU decoding/filter/software-encoding thread budget (not Chromium's thread count) |
| `STREAM_VAAPI_ASYNC_DEPTH` | `4` | In-flight VAAPI encoding operations |
| `STREAM_VAAPI_DEVICE` | `/dev/dri/renderD128` | DRM render node for hardware VAAPI encoding (AMD RDNA 2 GPU on Steam Deck) |
| `STREAM_CAPTURE_MODE` | `kmsgrab` for `deck-kms`, else `puppeteer-stream` (including `deck-quality`) | Linux `kmsgrab` (active DRM scanout), `pipewire` (GStreamer public video node); also `xvfb`, `puppeteer-stream`, `screencast`, `screenshot`. Explicit `auto` tries KMS on detected Linux Decks at ≥60 FPS with a visible display session; otherwise Xvfb when installed on Linux, then tab capture. KMS/PipeWire preflight failure warns and falls back to Xvfb/tab |
| `STREAM_KMS_DEVICE` | `/dev/dri/card0` | DRM card for KMS scanout, separate from the VAAPI render node; requires active output and access permissions |
| `STREAM_KMS_CRTC` | Unset | Optional unsigned 32-bit decimal CRTC ID (`0..4294967295`); selects the output being captured |
| `STREAM_KMS_PLANE` | Unset | Optional unsigned 32-bit decimal plane ID (`0..4294967295`) passed to FFmpeg |
| `STREAM_KMS_HEADLESS_XVFB` | `false` | `true` / `false`: when KMS is requested, `true` explicitly selects Xvfb/X11 or tab fallback. Xvfb has no KMS scanout; this does not spawn gamescope or provide zero-copy KMS |
| `STREAM_PIPEWIRE_NODE` | Unset | Required for PipeWire video: externally authorized, accessible public video node ID (unsigned 32-bit decimal). No automatic Portal picker or private portal remote FD support |
| `STREAM_XVFB_PATH` | Auto-detected (`which Xvfb`, `/usr/bin/Xvfb`, …) | Path to the Xvfb binary when it is not on PATH. SteamOS: `sudo steamos-readonly disable && sudo pacman -S xorg-server-xvfb` |
| `STREAM_CAPTURE_VIDEO_CODEC` | `h264` | Tab MediaRecorder codec; `vp8` for compatibility. Unsupported H.264 falls back to VP8 |
| `STREAM_CAPTURE_VIDEO_BITRATE` | `40000k` for `deck-quality`; else at least 8 Mbps or twice output target | Intermediate tab-recording bitrate; accepts `12000k`, `12M` or bits/second |
| `STREAM_HARDWARE_DECODE` | `true` | Probe VAAPI H.264 tab decoding; false disables it. CPU fallback if unsupported |
| `XVFB_DISPLAY` | `:99` | Virtual X11 display number for `xvfb` mode. If a server already owns it (orphan from a previous run) it is reused; `stop.sh` clears orphaned capture displays |
| `STREAM_MODE` | `hls` | Target output: `hls`, `rtmp`, `udp`, or `ndi` |
| `STREAM_NDI_NAME` | `IntelliSTAR` | Stream name advertised on local network when `STREAM_MODE=ndi` |
| `STREAM_NDI_PIXEL_FORMAT` | `uyvy422` | Pixel format for NDI (`uyvy422`, `bgra`, `bgr0`) |
| `STREAM_HLS_SEGMENT_TIME` | `4` | Seconds per HLS segment (aligned with GOP keyframes) |
| `STREAM_KEYFRAME_INTERVAL` | HLS segment time; `2` for `deck-quality` on `rtmp` | Keyframe/GOP interval in seconds (0–10). YouTube recommends 2 s and rejects intervals above 4 s |
| `STREAM_HLS_LIST_SIZE` | `8` | Number of segments kept in playlist (~32–48s buffer window) |
| `STREAM_SCREENSHOT_QUALITY` | `85` | JPEG compression quality for `screencast` mode (1-100) |
| `STREAM_RAF_THROTTLE` | `true` on Deck, `false` otherwise | Cap JavaScript animation callbacks at target FPS; does not cap CSS animations |
| `STREAM_VIDEO_BITRATE` | Preset default | Target bitrate; `deck-quality` uses `3000k` (`10000k` on `rtmp`); `deck-kms` uses `8000k`. An explicit target also becomes the peak unless a peak is supplied |
| `STREAM_VIDEO_MAXRATE` | Preset peak or target | VBV peak; `deck-quality` uses `4000k` (`10000k` CBR on `rtmp`); `deck-kms` uses `8000k`; must be at least target |
| `STREAM_VIDEO_BUFSIZE` | Twice target bitrate | VBV size in bits, e.g. `12M`; not a CPU or RAM limit |
| `STREAM_AUDIO_BITRATE` | `128k` | AAC audio bitrate |
| `STREAM_MUSIC_VOLUME` | `0.5` | Background music capture level |
| `STREAM_VOCAL_VOLUME` | `1.0` | Vocal narration capture level |
| `STREAM_MUSIC_DUCKED_VOLUME` | `0.2` | Music volume when voice narration is active |
| `STREAM_USE_RAM_CACHE` | `true` (Linux) / `false` (Win) | Write HLS segments to RAM disk (/dev/shm) to eliminate SSD wear |
| `STREAM_RAM_CACHE_DIRECTORY` | `/dev/shm/intelli-stream` | Path for RAM disk HLS cache |
| `STREAM_BROWSER_PATH` | `null` | Path to system Chromium binary |

> **Steam Deck Performance Tip**: `npm run deck` selects the quality-balanced 1080p30 preset (tab capture, 3/4 Mbps HLS target/peak). Hardware decoding/encoding reduce FFmpeg CPU use, but browser recording and radar still consume CPU/GPU. No fixed total-CPU percentage is guaranteed. RAM caching avoids HLS segment disk writes only. See [README.md](README.md) for measured synthetic-test results and limitations. `npm run stream:check` covers only tab/Xvfb browser/audio-to-HLS operation, not KMS/PipeWire video or isolated Pulse audio. `npm test` mocks hardware/external processes for the new paths; their hardware performance remains unverified.

### KMS / PipeWire requirements and safety

- **KMS:** use an existing active DRM output with the visible Chromium kiosk on the same display/CRTC/plane (`DISPLAY` or `WAYLAND_DISPLAY` required). Capture may broadcast unrelated windows/notifications; it does not bypass compositor scanout. Match `STREAM_WIDTH` / `STREAM_HEIGHT` to physical scanout, not just the desired browser size, and set output dimensions separately for correct padding. The preset does not configure the monitor. Xvfb cannot supply KMS scanout; gamescope is not launched automatically.
- **Permissions:** no automatic grants. Missing access falls back; only opt in manually after reviewing the [KMS permission commands and broad-privilege warning](README.md#kms-permissions-optional-manual-administrator-action). Use a trusted dedicated FFmpeg binary and revoke its capability when finished. Never run Node or the browser as root.
- **Mapping:** KMS preflight tests the selected encoder/filter chain. VAAPI maps DRM frames and scales on GPU, with CPU padding/download/re-upload for aspect-ratio changes. Software DRM uses `hwmap=mode=read`, **not DRM `hwdownload`**, and requires CPU-mappable linear BGR0; mapping failures fall back to Xvfb/tab. No unconditional zero-copy claim applies.
- **PipeWire video:** requires `gst-launch-1.0` plus `pipewiresrc`, `videoconvert`, `videoscale`, `videorate`, `fdsink` and `fakesink` plugins. Authorize/export an accessible public node externally; there is no automatic Portal picker or private portal FD support. BGRx width/height/FPS are explicitly negotiated and preflighted before raw BGR0 is piped to FFmpeg; failed access/negotiation falls back to Xvfb/tab. Runtime capture failure shuts down, rather than switching engines live.
- **Audio:** requires FFmpeg Pulse input and a working PipeWire-Pulse/PulseAudio server; `pactl` manages the isolated sink. This is low-latency, **not zero-latency**, audio. The sink is created before Chromium and `PULSE_SINK` applies only to its child environment, not the global default. Isolation failure/disablement tries `STREAM_AUDIO_DEVICE` or `@DEFAULT_MONITOR@` with a warning that desktop sound may be broadcast, then browser WebAudio if that fails.
- **Cleanup:** `SIGINT`/`SIGTERM`, uncaught exceptions and unhandled rejections stop owned children and unload the sink, with an exit-time retry. After an unclean exit, [stop.sh](stop.sh) recovers the named GStreamer process and exact null-sink name. Run as the same desktop user and pass the original custom `STREAM_PIPEWIRE_AUDIO_SINK`; cleanup is best-effort if the audio server is unavailable.

### Examples (Steam Deck / Linux Bash)
```bash
# KMS video + isolated PipeWire audio: active 1920x1080 display required
STREAM_PRESET=deck-kms npm run start-iptv

# Explicit externally authorized public PipeWire video node (replace 42)
STREAM_PRESET=deck-kms STREAM_CAPTURE_MODE=pipewire STREAM_PIPEWIRE_NODE=42 STREAM_WIDTH=1920 STREAM_HEIGHT=1080 npm run start-iptv

# Browser/tab video + isolated audio, without KMS permissions
STREAM_PRESET=deck-quality STREAM_CAPTURE_MODE=puppeteer-stream STREAM_AUDIO_MODE=pipewire STREAM_PIPEWIRE_AUDIO_ISOLATE=true STREAM_PIPEWIRE_AUDIO_SINK=Weather_Audio npm run start-iptv

# Stop/recover using the same custom sink name as the launch above
STREAM_PIPEWIRE_AUDIO_SINK=Weather_Audio npm run stop

# Ultra-smooth 1080p @ 60fps Full HD broadcast (Dedicated command)
npm run start-1080p60
# Or using the shell script:
./start-1080p60.sh

# Or via environment variable:
STREAM_PRESET=1080p-60fps npm run start-iptv

# Standard 1080p @ 30fps docked mode
STREAM_PRESET=1080p npm run start-iptv

# Steam Deck handheld mode (1280x720 @ 30fps)
STREAM_PRESET=deck npm run start-iptv

# Force CPU encoding with 8-thread Zen 2 optimization (fallback)
STREAM_VIDEO_ENCODER=libx264 npm run start-iptv
```

### Examples (Windows PowerShell)
```powershell
$env:STREAM_MUSIC_VOLUME = "0.7"
$env:STREAM_VIDEO_BITRATE = "3000k"
npm run start-iptv
```
