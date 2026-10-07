#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Ensure Node/NPM are discovered across standard paths including NVM/asdf
export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$HOME/.asdf/shims:$HOME/.asdf/bin"

echo "=========================================================================="
echo " Starting IntelliSTAR Stream (1080p @ 60fps Full HD)"
echo " Preset:   1920x1080 @ 60fps (1080p-60fps) | Bitrate: 5500k"
echo " Hardware: Auto-detected Hardware Acceleration (VAAPI / NVENC / QSV)"
echo " Cache:    /dev/shm (RAM Disk tmpfs)"
echo "=========================================================================="

export STREAM_PRESET="1080p-60fps"
export STREAM_USE_RAM_CACHE="${STREAM_USE_RAM_CACHE:-true}"
export STREAM_ENABLE_GPU="${STREAM_ENABLE_GPU:-true}"

exec npm run start-iptv
