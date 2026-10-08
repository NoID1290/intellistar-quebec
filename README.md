# 🌦️ IntelliStar Simulator (Quebec & Canadian Broadcast Edition)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Steam%20Deck%20%7C%20Raspberry%20Pi%20%7C%20Windows-informational.svg)](#)
[![Tests](https://img.shields.io/badge/tests-138%20passing-brightgreen.svg)](#)

A high-performance broadcast simulator of The Weather Channel's legendary **IntelliStar 1** "Local On The 8s" (2007–2008 era), enhanced for **Quebec & Canadian regional weather**, **Linux & Steam Deck hardware acceleration (AMD VAAPI)**, **headless IPTV/HLS streaming**, **NDI network video**, and **emergency alert system (En Alerte)**.

---

## 📜 Upstream Attribution & Open-Source License Notice

> [!NOTE]
> This repository is an open-source fork of **[IntelliStar Simulator](https://github.com/MistWeatherMedia/intellistar-1)** by **Mist Weather Media** (Lead Developer: **JensonWX**, Advanced Settings: **Miceoroni**, Documentation: **zachNet**).  
> In compliance with **Section 5 of the GNU General Public License v3.0 (GPLv3)**, this work retains all original copyright notices and is distributed under the same license terms. See [NOTICE](NOTICE) and [LICENSE](LICENSE) for full legal disclosures.

---

## ✨ Features Added in This Fork

### 🍁 1. Quebec & Canadian Regional Localization
- **Major Quebec & Canadian Metros**: Pre-configured regional and 8-city displays for Montréal, Québec City, Laval, Gatineau, Longueuil, Sherbrooke, Saguenay, Lévis, Trois-Rivières, and national Canadian overviews.
- **Metric System & Bilingual Support**: Canadian weather data defaults to Celsius, km/h, and kPa with bilingual display overlays.
- **Enhanced Radar & Cloud Cover**: Multi-frame Doppler radar loops and satellite cloud animations covering eastern Canada and bordering regions.

### ⚡ 2. Steam Deck & Linux Hardware Acceleration (AMD VAAPI)
- **Zero-Copy VAAPI GPU Pipelines**: Direct H.264 and HEVC hardware encoding (`h264_vaapi`, `hevc_vaapi`) with zero CPU-side color space bottlenecks.
- **DRM KMS Video Grab (`kmsgrab`)**: High-performance, low-overhead direct DRM scanout capture for dedicated displays.
- **PipeWire Audio & Video Capture**: Native Wayland desktop portal streaming and isolated PulseAudio sinks for pristine broadcast audio.
- **Custom Tuned Presets**: Dedicated profiles optimized for the Steam Deck GPU (`deck-quality`, `deck-uhd`, `deck-smooth`, `deck-kms`).

### 📡 3. Broadcast-Grade IPTV & NDI Streaming Engine
- **Headless IPTV / HLS Broadcast Server**: Automated Chromium tab-capture engine producing ultra-low-latency HLS streams with atomic segment publication and Linux RAM caching.
- **NDI C++ Bridge (`scripts/ndi-bridge.cpp`)**: High-performance NDI video sender and receiver for broadcasting over local gigabit LAN to OBS Studio or remote decoders.
- **Raspberry Pi Transcoding Bridge**: Shell scripts and deployment pipeline to offload HLS transcoding or playback to a networked Raspberry Pi 5.
- **OBS Studio Integration**: Automated OBS profile generator for local HLS loopback and direct YouTube Live RTMP streaming.

### 🚨 4. Quebec "En Alerte" Public Safety System
- **Emergency Alert Crawl & Sirens**: Simulated Canadian emergency broadcast tests (Tornado, Amber Alert, Severe Thunderstorm, Quebec Civil Emergencies) with authentic dual-tone attention signals and ticker scrolls.
- **REST API & CLI Dispatchers**: Trigger live emergency alerts programmatically via `node alert.js <type>` or HTTP endpoints (`/api/alert/trigger`).

### 🎨 5. Modern Studio Editor & 2026 Visual Remaster
- **IntelliStar Studio Visual Editor**: Browser-based WYSIWYG broadcast editor (`http://localhost:7070/editor.html`) with drag-and-drop layer management, slide sequence customizer, named presets, and undo/redo.
- **2026 Sapphire Glass UI Theme**: Vector graphics remaster with crisp 1080p slide artwork, anti-aliased fonts, and smooth frame interpolation.
- **Interactive Launcher**: GUI and terminal launcher with real-time system stats (CPU, GPU, RAM, thermals).

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or newer recommended)
- [FFmpeg](https://ffmpeg.org/) (compiled with VAAPI, PipeWire, or libx264 support)
- Modern Linux system (SteamOS / Arch, Debian / Ubuntu, Fedora) or Windows

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/NoID1290/intellistar-quebec.git
cd intellistar-quebec

# 2. Install dependencies
npm install

# 3. (Optional) Run tests to verify the pipeline
npm test
```

### Running the Simulator

#### 1. Interactive Preview (Web Browser)
```bash
npm start
# Opens the simulator on http://localhost:7070
```

#### 2. Visual Studio Broadcast Editor
```bash
# Open in your browser:
http://localhost:7070/editor.html
```

#### 3. Headless IPTV Streaming Server
```bash
# Default Steam Deck / Linux hardware-accelerated stream (1080p30 HLS):
npm run start-iptv

# Or use the launcher:
npm run launcher:ui
```

#### 4. OBS Studio Stream Integration
```bash
# Check OBS connection and generate profile:
npm run obs:check
npm run obs:setup-hls

# Start live broadcast to OBS:
npm run start-obs
```

---

## 📺 Streaming Presets & Hardware Profiles

| Preset | Resolution & FPS | Video Bitrate | Hardware Encoder | Best Use Case |
|---|---|---|---|---|
| `deck-quality` | 1920×1080 @ 30 FPS | 3–4 Mbps VBR | `h264_vaapi` | Default for IPTV, OBS, and home networks |
| `deck-kms` | 1920×1080 @ 60 FPS | 8 Mbps CBR | `h264_vaapi` + KMS | Direct display DRM scanout + PipeWire audio |
| `deck-uhd` | 3840×2160 @ 30 FPS | 16–22 Mbps VBR | `h264_vaapi` | 4K TV broadcast source |
| `deck-smooth` | 1280×720 @ 60 FPS | 5–6.5 Mbps VBR | `h264_vaapi` | Ultra-smooth crawls on handheld display |
| `deck-720p` | 1280×720 @ 30 FPS | 3.5–4.5 Mbps VBR | `h264_vaapi` | Power-efficient background broadcasting |

*Select a preset by prefixing the launch command:*
```bash
STREAM_PRESET=deck-kms npm run start-iptv
```

---

## 🎙️ Vocal Assets & Voice Narration Notice

- **Standard English Vocals**: The original 2007–2008 English vocal narration clips (`webroot/vocallocal/`) are included for full out-of-the-box compatibility with the upstream simulation.
- **French Vocal Assets & Voice Cloning**: French voice audio files are **not checked into git** to respect repository size limits and prevent multi-gigabyte repository bloat.
- **Workflow & Generation**: The repository includes ComfyUI and F5-TTS voice synthesis workflows (`comfyui_intellistar_french_workflow.json` and `comfyui_intellistar_french_api.json`) for local French narration generation. Generated French vocals should be placed in `webroot/vocallocal_fr/` (automatically ignored by `.gitignore`).

---

## 🚨 Emergency Alert Control ("En Alerte")

Trigger simulated severe weather alerts and civil safety crawls at any time:

```bash
# Trigger specific alerts via CLI:
npm run alert -- tornado
npm run alert -- amber
npm run alert -- quebec
npm run alert -- clear

# Trigger via HTTP API:
curl "http://localhost:7070/api/alert/trigger?type=tornado"
curl "http://localhost:7070/api/alert/clear"
```

---

## 📂 Project Structure

```
├── app.js                          # Main Express HTTP & API web server
├── start-iptv.js                   # Headless IPTV capture & FFmpeg streaming orchestrator
├── stream-config.js                # Video encoding presets and hardware detection
├── stream-obs.js                   # OBS Studio integration controller
├── launcher-ui.js                  # Interactive terminal/web launcher UI
├── alert.js                        # Emergency alert test dispatcher
├── forecast.js                     # Live forecast sequence controller
├── encoding-presets.js             # VAAPI / x264 video encoding presets
├── scripts/
│   ├── check-stream-pipeline.js    # Streaming diagnostic preflight
│   ├── ndi-bridge.cpp              # C++ NDI video sender & receiver bridge
│   ├── setup-ndi.sh                # NDI SDK compiler & installation script
│   ├── raspberry-pi-ndi-to-hls.sh  # Raspberry Pi remote HLS transcoder
│   └── sync-to-pi.sh               # LAN deployment script for remote servers
├── webroot/                        # Web application assets
│   ├── index.html                  # Main broadcast display page
│   ├── editor.html                 # Studio visual layout editor
│   ├── js/                         # Simulator rendering engines & weather feeds
│   ├── css/                        # Broadcast typography and styling
│   ├── images/                     # 2026 remastered vectors, radar basemaps
│   ├── music/                      # Background broadcast audio library
│   └── vocallocal/                 # Core vocal narration assets
├── tests/                          # 138-test automated regression suite
├── LICENSE                         # GNU General Public License v3.0
├── NOTICE                          # Upstream copyright & fork modifications notice
└── README.md                       # Documentation
```

---

## 👥 Credits & Acknowledgments

- **[Mist Weather Media](https://github.com/MistWeatherMedia)**: Original creators of the [IntelliStar 1 HTML Simulator](https://github.com/MistWeatherMedia/intellistar-1).
  - **JensonWX**: Lead Developer
  - **Miceoroni**: Advanced Settings Developer
  - **zachNet**: Documentation & README
- **[NoID1290](https://github.com/NoID1290)**: Quebec/Canadian localization, Linux VAAPI acceleration, IPTV streaming pipeline, NDI bridge, and En Alerte system.

---

## ⚖️ License

Distributed under the **GNU General Public License v3.0 (GPLv3)**.  
See [LICENSE](LICENSE) for the full license text and [NOTICE](NOTICE) for copyright attribution.
