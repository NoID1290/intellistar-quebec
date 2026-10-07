# Background OBS Streaming

This opt-in Linux backend uses the app web server and OBS Browser Source, with
either DistroAV NDI output or classic HLS. HLS is encoded in OBS, then packaged
by FFmpeg with stream copy, not re-encoded. Neither mode uses Puppeteer capture,
the GStreamer raw-frame bridge, or the custom NDI sender. Existing commands remain.

## One Launcher for Everything

```bash
./launch.sh
# Or:
npm run launcher
```

The terminal menu provides HLS/NDI startup, stop, status, forecast start/stop,
messages, alerts, refresh, editor, VLC, setup checks, and logs. All remaining npm
commands are available under **All other project commands** (legacy commands run
in the foreground). Start a broadcast, return to the menu, then start the forecast.

OBS broadcasts started through this menu are detached from the terminal and
survive closing the menu or disconnecting SSH. The desktop session must still be
logged in and awake. Use the menu's **Stop OBS broadcast** to stop them. Direct
`npm run start-obs` and `npm run start-obs-hls` remain foreground commands.
Logs are appended to `~/.local/state/intellistar/obs.log` (or `$XDG_STATE_HOME`).
The log is not rotated automatically; archive it periodically during downtime.

## Classic HLS with OBS

The HLS setup action creates a separate **IntelliSTAR HLS** profile based on
your existing IntelliSTAR profile's video settings. It leaves existing profiles
and the scene collection unchanged, and refuses to overwrite an existing HLS
profile. On the Steam Deck it uses VAAPI H.264 at 10 Mbps, AAC at 192 kbps/stereo
48 kHz, and two-second keyframes. The default device is `/dev/dri/renderD128`;
`STREAM_VAAPI_DEVICE` can select another device when creating the profile.

With OBS closed, select **Create OBS HLS profile (once)**, then **Start OBS - HLS**.
Equivalent commands:

```bash
npm run obs:setup-hls
node start-obs.js check hls
npm run start-obs-hls
```

On this Deck the HLS profile has already been created. Do not rerun setup unless
you deliberately remove/rename that profile in OBS first. Other Linux hardware
may require selecting a compatible H.264 encoder in OBS's HLS profile.

Pipeline: OBS Browser Source -> OBS H.264/AAC -> loopback RTMP -> FFmpeg stream
copy -> HLS served by the existing app. No RTMP service is exposed to the LAN:
the listener binds to `127.0.0.1:19350`. Playback:

```text
http://127.0.0.1:7070/stream/index.m3u8
http://<steam-deck-address>:7070/stream/index.m3u8
```

Open it with the menu's VLC action or an HLS-capable player/browser. Chrome and
Firefox do not generally play a bare HLS URL without an HLS player. The menu
opens VLC/editor on the Deck's desktop even when used over SSH.

The packager uses the same RAM/disk HLS directory and playlist settings as the
web server: `STREAM_USE_RAM_CACHE`, `STREAM_RAM_CACHE_DIRECTORY`,
`STREAM_HLS_DIRECTORY`, `STREAM_HLS_SEGMENT_TIME`, `STREAM_HLS_LIST_SIZE`. Default
segments are four seconds with eight in the playlist, so player buffering adds
latency. `OBS_RTMP_PORT` changes ingest; the HLS profile's custom RTMP server must
match it. Its stream key is `intellistar` (local routing, not a secret).

HLS startup waits for new-session segments and checks that the HTTP endpoint
serves them. A wrong/reused-server directory, occupied ingest port, encoder
failure or missing audio fails startup with cleanup. Status checks segment
freshness, but transport readiness does not prove weather data has loaded.
The first frames can be black while Browser Source loads external resources;
wait for color bars, or use **Refresh forecast page**, before starting forecast.

NDI plugin output is independent of OBS streaming. Disable DistroAV's main output
in OBS when you do not want simultaneous NDI traffic; choosing HLS does not change
that global plugin preference. Stop the current broadcast before changing mode.

Automated startup archives known stale OBS `run_*` shutdown markers under
`obs-studio/intellistar-recovery/` only after verifying no OBS is running. This
avoids the blocking recovery prompt after a forced stop, while preserving the
markers and crash logs. Other dialogs or encoder failures can still require OBS
inspection; the launcher times out rather than reporting HLS success.

Live verification on this Deck confirmed VAAPI H.264/AAC, 1080p60 HLS and decoded
forecast standby graphics. This is not a long-duration CPU or quality benchmark.
Complete the receiver checks below before replacing your production broadcast.

## YouTube Live (RTMP) with OBS

The launcher includes built-in streaming directly to YouTube Live via RTMP using
hardware VAAPI H.264 encoding (10 Mbps CBR, 2s GOP interval, matching YouTube's
1080p recommendation) and 48 kHz stereo AAC audio.

To start streaming:
1. In `launcher.js`, select **Start OBS - YouTube (RTMP)** (command 3), or click
   the red **Start YouTube (RTMP)** button in the Touch Screen UI (`npm run ui`).
2. Alternatively, from the terminal:
   ```bash
   npm run start-obs-youtube
   # Or:
   node launcher.js youtube
   ```

The stream key defaults to `0bwt-p2gw-q02k-0y0q-7vph` targeting
`rtmp://a.rtmp.youtube.com/live2`. You can override the stream key anytime via the
`YOUTUBE_STREAM_KEY` environment variable. The launcher automatically creates and
maintains the **IntelliSTAR YouTube** OBS profile.

## One-Time Setup

1. Use a terminal in the logged-in desktop session. OBS runs minimized, not
   headless. Keep that session active and prevent suspend during broadcast.
   Over SSH, when display variables are absent, the launcher discovers an
   existing same-user Plasma, GNOME, Xfce, Cinnamon or MATE desktop and verifies
   its display socket. It imports only the display/session variables, not the
   desktop process's entire environment. Explicit display settings are preserved.
   If no usable desktop or multiple desktop sessions are found, export the
   intended session environment manually. It does not create a desktop, guess a
   display number, or change permissions.

2. Confirm OBS has Browser Source, a working GPU renderer, DistroAV, and its
   compatible NDI runtime. With Flatpak OBS, use its matching DistroAV extension,
   not a host-native plugin. Check the current
   [DistroAV installation requirements](https://github.com/DistroAV/DistroAV#installation).
   The usual Flatpak installation command is:

   ```bash
   flatpak install flathub com.obsproject.Studio.Plugin.DistroAV
   ```

   Choose the branch compatible with your OBS installation. Follow DistroAV's
   Flatpak instructions for Avahi discovery permissions when required. The
   launcher does not install plugins, change sandbox permissions, or modify OBS
   settings. Plugin package presence alone does not prove it loads successfully;
   check the OBS log and its Tools menu.

3. Stop the old capture pipeline yourself before testing OBS. Do not broadcast
   two sources with the same NDI name. Start only the web server:

   ```bash
   npm start
   ```

   Leave it running while configuring OBS. It does not launch capture or encode
   video. The editor is at <http://127.0.0.1:7070/editor.html>.

4. In OBS, create a **new** profile, scene collection, and scene, each named
   `IntelliSTAR`. Do not reuse an unrelated production profile. Set Base (Canvas)
   Resolution and Output (Scaled) Resolution to 1920x1080, FPS to 60, and audio to
   48 kHz stereo. Initially use the same dimensions/FPS as the baseline being
   compared; do not reduce FPS silently to make a CPU comparison look better.

5. Add a Browser Source to that scene:

   | Property | Value |
   | --- | --- |
   | Local file | Off |
   | URL | `http://127.0.0.1:7070/?iptv` |
   | Width / Height | 1920 / 1080 |
   | Use custom frame rate / FPS | On / 60 |
   | Control audio via OBS | On |
   | Shutdown source when not visible | Off |
   | Refresh browser when scene becomes active | Off |
   | Custom CSS | Empty, to preserve the application's own styles |

   `http://localhost:7070/?iptv` is also accepted; it is treated as the local
   `127.0.0.1` address for saved-scene validation. The port must still match
   `PORT`, and the Browser Source must be visible in the selected scene.

   Fit the source to the canvas without cropping or stretching. Keep it visible
   in the active scene. Disable global desktop audio and microphone devices.
   Keep audio monitoring off to avoid duplicate audio. In Advanced Audio
   Properties, ensure the Browser Source is unmuted and assigned to the audio
   track used by NDI output. Confirm the calibration tone reaches the receiver.

6. Enable DistroAV's main/program NDI output in OBS's Tools menu and name it
   `IntelliSTAR`, or your receiver's existing expected source name. NDI output is
   separate from OBS's Start Streaming button: neither `--startstreaming` nor the
   core WebSocket `StartStream` command enables this plugin's NDI output.

7. Validate the forecast, audio and NDI output manually, then close OBS normally
   so its settings are saved. The launcher reads saved profile/scene names and
   verifies the selected scene contains a visible Browser Source pointing to the
   configured local URL. It refuses missing settings rather than letting OBS
   silently fall back to a different scene. It does not validate every plugin or
   audio setting. Unrelated malformed scene JSON can also block preflight; fix
   that configuration in OBS rather than deleting it blindly.

## Running

From the desktop terminal or SSH as the same logged-in user, after the one-time setup:

```bash
npm run obs:check
npm run start-obs
```

OBS launches minimized to the desktop tray. The launcher stays in the foreground
with app and OBS logs in the terminal. It starts the web server if the port is
free, or reuses a server that answers IntelliSTAR's `/api/health` endpoint. An
older running app must be restarted once to gain this endpoint. A different or
unresponsive service on the port is an error, not a reason to kill that service.

In another terminal:

```bash
npm run obs:status
npm run forecast:start
npm run forecast:stop
npm run obs:stop
```

- `obs:status` reports app/process state and HLS freshness when applicable, not NDI receiver health.
- `forecast:stop` returns to color bars and tone while NDI stays active.
- `obs:stop` or Ctrl+C stops this launcher's OBS and any web server it created.
  A reused server is left running. Do not use the legacy `npm run stop` command
  for this backend: that command does not manage OBS ownership.
- A running OBS or legacy capture process blocks startup. Close it yourself;
  this launcher will not take over an unrelated OBS session.
- App/server crashes during an owned session stop the backend. A failed OBS
  process also triggers cleanup. A reused server's health is checked by status;
  it is not restarted or owned by this launcher.
- Graceful child shutdown is bounded; unresponsive processes may be forcibly
  stopped. Configure and save OBS normally before relying on automation.
- A private per-user Unix socket prevents duplicate launchers. A stale socket
  can be reclaimed after a crash, but surviving OBS processes are not adopted or
  killed. There is no network control port or WebSocket password to configure.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `7070` | App port; the saved Browser Source must use this same port |
| `OBS_INSTALLATION` | `auto` | `native` or `flatpak`; required if both exist |
| `OBS_PROFILE` | `IntelliSTAR` | Saved profile display name |
| `OBS_COLLECTION` | `IntelliSTAR` | Saved scene collection display name |
| `OBS_SCENE` | `IntelliSTAR` | Saved scene name |
| `XDG_RUNTIME_DIR` | `/run/user/<uid>` | Desktop runtime directory; also locates private control socket |

Use the same runtime directory for start/status/stop. Only one launcher per user
is allowed, even across different workspaces. The controller refuses commands
from another workspace.

Use `OBS_OUTPUT=ndi` (default) or `OBS_OUTPUT=hls` to select the backend output;
the menu passes that selection automatically. HLS defaults to profile
`IntelliSTAR HLS`; NDI defaults to `IntelliSTAR`. `OBS_PROFILE` overrides either.
`OBS_SOURCE_PROFILE` and `OBS_HLS_PROFILE` name the source and destination for
one-time HLS setup; select a custom destination with `OBS_PROFILE` when starting.

Resolution, FPS, output name and encoding are configured in OBS. Existing
`STREAM_CAPTURE_*`, `STREAM_VIDEO_*`, and `STREAM_NDI_*` settings do not configure
this OBS backend. Configure forecast content and audio in the existing editor.
Puppeteer's injected audio-volume, lazy-map and animation-throttle overrides are
not applied to OBS Browser Source automatically; verify the actual browser/editor
settings and performance. OBS uses its own CEF browser, not Puppeteer's Chromium.

## Receiver Acceptance Checks

Run these before considering a switch complete:

1. Verify color bars/tone on cold startup without mouse interaction, then issue
   a fresh `npm run forecast:start`. Check fonts, multilingual text, scrolling
   crawls, radar/WebGL, music, narration, ducking, alerts and editor changes at
   the NDI receiver. Check audio/video sync over an entire forecast cycle.
2. Stop/start the forecast and refresh the page. Reloads deliberately return to
   standby and ignore stale start commands; issue a new start after loading.
   Confirm no desktop sounds or doubled audio enter the broadcast.
3. Disable OBS preview and minimize OBS; verify rendering/audio/NDI continue.
   Close/relaunch with `npm run start-obs` and verify DistroAV resumes output
   without clicking anything. If your plugin version does not restore output,
   unattended NDI is not ready; investigate its supported controls first.
4. Compare OBS against the old PipeWire path **separately**, at equal resolution,
   FPS, content, receiver and network. Warm each for two minutes and observe for
   at least ten minutes. Record total CPU including browser subprocesses, memory,
   GPU renderer/load, OBS rendering lag, receiver frame drops and A/V drift.
   Compare matching screenshots of text, crawls and radar.
5. Suggested acceptance: lower total CPU with no quality regression, rendering
   lag below 0.1%, stable receiver FPS, and no accumulating memory or A/V drift.
   Ordinary NDI still encodes/compresses and uses substantial LAN bandwidth; it
   is not a CPU-free raw network transport. OBS H.264/VAAPI bitrate controls do
   not tune DistroAV's normal NDI encoding. Prefer wired Ethernet for testing.

If Browser Source fails these checks, test OBS's native PipeWire capture of a
GPU-rendered Chromium window as a separate alternative. Do not feed the existing
encoded output into OBS to address the original capture overhead.

Only after restart tests pass, optionally add `npm run start-obs` to your desktop
session's autostart with this repository as the working directory and a suitable
Node/npm PATH. This is not a headless boot service. Keep logs, and test a complete
login/reboot cycle before unattended operation.

## Rollback

Run `npm run obs:stop`, confirm OBS has exited, then use your existing PipeWire
or other legacy startup command. Existing stream configuration and the custom
NDI bridge are unchanged. Stop any manually launched OBS instance yourself.

## Development Verification

```bash
node --test tests/obs-lifecycle.test.js
node --test tests/obs-hls.test.js tests/launcher.test.js
npm test
```

The focused suite covers launch arguments, saved setup, HTTP health, private
control, stale/duplicate launchers, cancellation, timeout and child cleanup. Its
end-to-end case uses a simulated OBS executable with the **real app server**;
this does not replace testing the real OBS/DistroAV/GPU/receiver combination.