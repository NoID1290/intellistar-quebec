#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Auto-detect display session if not set in environment (e.g. nohup or background run)
export DISPLAY="${DISPLAY:-:0}"
if [ -z "$WAYLAND_DISPLAY" ] && [ -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/wayland-0" ]; then
    export WAYLAND_DISPLAY="wayland-0"
fi
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}"

# Ensure Node/NPM are discovered
export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$HOME/.asdf/shims:$HOME/.asdf/bin:$HOME/.local/bin"

# If running inside Flatpak, re-launch on host so DBus, PipeWire, and GStreamer connect directly
if [ -f /.flatpak-info ]; then
    echo "[IPTV] Running inside Flatpak; delegating to host environment..."
    exec flatpak-spawn --host \
        --env=DISPLAY="$DISPLAY" \
        --env=WAYLAND_DISPLAY="$WAYLAND_DISPLAY" \
        --env=XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
        --env=DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
        "$0" "$@"
fi

export STREAM_PRESET="${STREAM_PRESET:-deck-kms}"
export STREAM_CAPTURE_MODE=pipewire
export STREAM_PIPEWIRE_PORTAL=true
export STREAM_AUDIO_MODE=pipewire
export STREAM_PIPEWIRE_AUDIO_ISOLATE=true
export STREAM_RAF_THROTTLE="${STREAM_RAF_THROTTLE:-true}"

echo "=========================================================="
echo " Starting IntelliStar IPTV with PipeWire Video & Audio"
echo "=========================================================="
echo " Video: PipeWire Wayland screen capture (via Portal bridge)"
echo " Audio: Isolated PipeWire virtual sink (IntelliStar_Audio)"
echo " Note: If a 'Screen Sharing' dialog appears, click 'Share'"
echo "       and check 'Remember' to allow seamless streaming."
echo "=========================================================="

exec npm run start-iptv
