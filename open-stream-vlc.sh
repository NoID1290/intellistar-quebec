#!/usr/bin/env bash
# ==============================================================================
# IntelliSTAR Simulator — Launch Live Stream in VLC Media Player
# ==============================================================================

set -e

# Default configuration
PORT="7070"
PLAYLIST_NAME="index.m3u8"
HOST="localhost"

# Allow custom port or URL as first parameter
if [ -n "$1" ]; then
    if [[ "$1" =~ ^https?:// ]]; then
        STREAM_URL="$1"
    elif [[ "$1" =~ ^[0-9]+$ ]]; then
        PORT="$1"
        STREAM_URL="http://${HOST}:${PORT}/stream/${PLAYLIST_NAME}"
    else
        STREAM_URL="$1"
    fi
else
    STREAM_URL="http://${HOST}:${PORT}/stream/${PLAYLIST_NAME}"
fi

echo "=========================================================================="
echo " IntelliSTAR Live Stream -> VLC Player Launcher"
echo "=========================================================================="
echo " Target Stream URL: ${STREAM_URL}"

# Detect Local LAN IP for other devices (TV, phones, tablets)
LAN_IP=$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n 1 || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
if [ -n "$LAN_IP" ] && [ "$LAN_IP" != "127.0.0.1" ]; then
    echo " Local Network URL: http://${LAN_IP}:${PORT}/stream/${PLAYLIST_NAME}"
fi
echo "=========================================================================="

# Check if stream server is currently responding
echo "[*] Checking stream server on port ${PORT}..."
if command -v curl >/dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "${STREAM_URL}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        echo "[+] Stream is LIVE and ready (HTTP 200 OK)."
    elif [ "$HTTP_CODE" = "404" ]; then
        echo "[!] Server is online, but playlist is generating. Waiting for first segments..."
    else
        echo "[!] Note: Stream server does not seem to be running on port ${PORT} yet (HTTP ${HTTP_CODE})."
        echo "    Tip: You can start the server with: ./deck-start.sh  or  npm run start-iptv"
    fi
fi

# Locate VLC binary or Flatpak (common on Steam Deck / SteamOS)
VLC_CMD=""

if command -v vlc >/dev/null 2>&1; then
    VLC_CMD="vlc"
elif command -v flatpak >/dev/null 2>&1 && flatpak info org.videolan.VLC >/dev/null 2>&1; then
    VLC_CMD="flatpak run org.videolan.VLC"
elif [ -f "/var/lib/flatpak/exports/bin/org.videolan.VLC" ]; then
    VLC_CMD="/var/lib/flatpak/exports/bin/org.videolan.VLC"
elif [ -f "$HOME/.local/share/flatpak/exports/bin/org.videolan.VLC" ]; then
    VLC_CMD="$HOME/.local/share/flatpak/exports/bin/org.videolan.VLC"
fi

if [ -z "$VLC_CMD" ]; then
    echo ""
    echo "[x] Error: VLC Media Player was not found on your system."
    echo ""
    echo "    On Steam Deck (SteamOS) Desktop Mode:"
    echo "      Install VLC from Discover Software Center, or run:"
    echo "      flatpak install flathub org.videolan.VLC"
    echo ""
    echo "    On Arch / Manjaro:"
    echo "      sudo pacman -S vlc"
    echo ""
    echo "    On Ubuntu / Debian / Raspberry Pi:"
    echo "      sudo apt update && sudo apt install vlc"
    echo ""
    echo "    You can still open this stream URL manually in any player:"
    echo "    ${STREAM_URL}"
    exit 1
fi

echo "[*] Launching VLC ($VLC_CMD)..."
echo "    Settings: fullscreen, 1000ms low-latency caching, auto-retry on failure"
echo "=========================================================================="

# Low-latency streaming flags for VLC:
#   --fullscreen           : Always start in fullscreen mode
#   --network-caching=1000 : 1 second buffer (reduces live stream delay)
#   --clock-jitter=0       : Prevents jitter compensation lag
#   --clock-synchro=0      : Direct clock sync with live frames
#   --no-video-title-show  : Hide title overlay on start
#   --input-repeat=65535   : Retry/repeat the stream on failure (keeps VLC open)
#   --no-play-and-exit     : Don't exit VLC when playback ends or fails
exec $VLC_CMD \
    --fullscreen \
    --network-caching=1000 \
    --clock-jitter=0 \
    --clock-synchro=0 \
    --no-video-title-show \
    --input-repeat=65535 \
    --no-play-and-exit \
    "$STREAM_URL" \
    "$@"

