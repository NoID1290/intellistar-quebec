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

# If running inside Flatpak, re-launch on host so CAP_SYS_ADMIN works (Flatpak drops capabilities)
if [ -f /.flatpak-info ]; then
    echo "[IPTV] Running inside Flatpak; delegating to host environment for KMSGrab..."
    exec flatpak-spawn --host \
        --env=DISPLAY="$DISPLAY" \
        --env=WAYLAND_DISPLAY="$WAYLAND_DISPLAY" \
        --env=XDG_RUNTIME_DIR="$XDG_RUNTIME_DIR" \
        --env=DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
        "$0" "$@"
fi

# Detect capability-enabled ffmpeg
if [ -x "$HOME/.local/bin/ffmpeg-kms" ] && getcap "$HOME/.local/bin/ffmpeg-kms" 2>/dev/null | grep -q cap_sys_admin; then
    export STREAM_FFMPEG_PATH="$HOME/.local/bin/ffmpeg-kms"
elif [ -x "/usr/bin/ffmpeg" ] && getcap "/usr/bin/ffmpeg" 2>/dev/null | grep -q cap_sys_admin; then
    export STREAM_FFMPEG_PATH="/usr/bin/ffmpeg"
fi

# Auto-detect physical monitor scanout from DRM
SCANOUT=$(drm_info /dev/dri/card0 2>/dev/null | grep "Size:" | head -n 1 | sed 's/×/x/g' | grep -oE '[0-9]+x[0-9]+' || echo "1280x800")
WIDTH=${SCANOUT%x*}
HEIGHT=${SCANOUT#*x}
# Handle native portrait scanout on Steam Deck internal panel (800x1280) by swapping to landscape (1280x800)
if [ -n "$WIDTH" ] && [ -n "$HEIGHT" ] && [ "$WIDTH" -lt "$HEIGHT" ]; then
    TMP=$WIDTH
    WIDTH=$HEIGHT
    HEIGHT=$TMP
fi

export STREAM_PRESET="${STREAM_PRESET:-deck-kms}"
export STREAM_CAPTURE_MODE="${STREAM_CAPTURE_MODE:-kmsgrab}"
export STREAM_WIDTH="${STREAM_WIDTH:-${WIDTH:-1280}}"
export STREAM_HEIGHT="${STREAM_HEIGHT:-${HEIGHT:-800}}"
export STREAM_OUTPUT_WIDTH="${STREAM_OUTPUT_WIDTH:-1920}"
export STREAM_OUTPUT_HEIGHT="${STREAM_OUTPUT_HEIGHT:-1080}"
export STREAM_FPS="${STREAM_FPS:-60}"
export STREAM_VIDEO_MAXRATE="${STREAM_VIDEO_MAXRATE:-8000k}"
export STREAM_RAF_THROTTLE="${STREAM_RAF_THROTTLE:-true}"
export STREAM_AUDIO_MODE=pipewire
export STREAM_PIPEWIRE_AUDIO_ISOLATE=true

# Check if DRM scanout format is 10-bit (unsupported by FFmpeg kmsgrab demuxer)
IS_10BIT=false
if drm_info /dev/dri/card0 2>/dev/null | grep -qE "Format: (ABGR2101010|ARGB2101010)"; then
    IS_10BIT=true
    echo " Notice: DRM scanout is 10-bit color (ABGR2101010)."
    echo "         FFmpeg kmsgrab only supports 8-bit DRM scanouts."
    echo "         Automatically using PipeWire Wayland screen capture engine."
    export STREAM_CAPTURE_MODE=pipewire
    export STREAM_PIPEWIRE_PORTAL=true
fi

echo "=========================================================="
if [ "$IS_10BIT" = "true" ]; then
    echo " Starting IntelliStar IPTV with PipeWire (DRM 10-Bit Scanout)"
else
    echo " Starting IntelliStar IPTV with KMSGrab Direct DRM Scanout"
fi
echo "=========================================================="
echo " Physical Scanout: ${STREAM_WIDTH}x${STREAM_HEIGHT}"
echo " Output Stream:    ${STREAM_OUTPUT_WIDTH}x${STREAM_OUTPUT_HEIGHT} (GPU VAAPI scaled)"
echo " Capture Engine:   ${STREAM_CAPTURE_MODE}"
echo " FFmpeg binary:    ${STREAM_FFMPEG_PATH:-ffmpeg}"
echo "=========================================================="

exec npm run start-iptv
