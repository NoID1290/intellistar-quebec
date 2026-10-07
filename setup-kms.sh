#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ -f /.flatpak-info ]; then
    exec flatpak-spawn --host "$0" "$@"
fi

mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.config/environment.d"
DEDICATED_FFMPEG="$HOME/.local/bin/ffmpeg-kms"
SYSTEM_FFMPEG="$(which ffmpeg 2>/dev/null || echo '/usr/bin/ffmpeg')"

echo "=== IntelliStar KMS & PipeWire Setup ==="

# 1. Check/Set CAP_SYS_ADMIN capabilities
if getcap "$SYSTEM_FFMPEG" 2>/dev/null | grep -q "cap_sys_admin"; then
    echo "System FFmpeg ($SYSTEM_FFMPEG) already has CAP_SYS_ADMIN capability."
elif [ -f "$DEDICATED_FFMPEG" ] && getcap "$DEDICATED_FFMPEG" 2>/dev/null | grep -q "cap_sys_admin"; then
    echo "Dedicated FFmpeg ($DEDICATED_FFMPEG) already has CAP_SYS_ADMIN capability."
else
    echo "Creating dedicated FFmpeg copy at $DEDICATED_FFMPEG..."
    cp "$SYSTEM_FFMPEG" "$DEDICATED_FFMPEG"
    echo "Setting CAP_SYS_ADMIN capability on $DEDICATED_FFMPEG..."
    if [ -x "/home/deck/app/.host-askpass.sh" ] && [ -n "$DISPLAY" ]; then
        SUDO_ASKPASS="/home/deck/app/.host-askpass.sh" sudo -A setcap cap_sys_admin+ep "$DEDICATED_FFMPEG" 2>/dev/null || sudo setcap cap_sys_admin+ep "$DEDICATED_FFMPEG"
    else
        sudo setcap cap_sys_admin+ep "$DEDICATED_FFMPEG"
    fi
fi

# 2. Set connector maxbpc to 8
if command -v kscreen-doctor >/dev/null 2>&1; then
    echo "Configuring display connector link to 8-bit color (maxbpc 8)..."
    kscreen-doctor output.DP-0.maxbpc.8 output.eDP-0.maxbpc.8 output.1.maxbpc.8 output.2.maxbpc.8 2>/dev/null || true
fi

# 3. Configure KWin to prefer 24-bit color depth (8-bit ARGB8888) instead of 30-bit (10-bit AB30)
KWIN_ENV_FILE="$HOME/.config/environment.d/10-kwin-color-depth.conf"
if ! grep -q "KWIN_DRM_PREFER_COLOR_DEPTH=24" "$KWIN_ENV_FILE" 2>/dev/null; then
    echo "Writing KWIN_DRM_PREFER_COLOR_DEPTH=24 to $KWIN_ENV_FILE..."
    echo "KWIN_DRM_PREFER_COLOR_DEPTH=24" >> "$KWIN_ENV_FILE"
fi

echo ""
echo "=== Setup Complete! ==="
echo "1. PipeWire Capture: Works IMMEDIATELY right now with zero reboot or restart!"
echo "   Run: ./start-pipewire.sh (or 'npm run deck-pipewire')"
echo ""
echo "2. KMS Direct DRM Scanout:"
echo "   KWin 8-bit color preference has been saved to $KWIN_ENV_FILE."
echo "   Once you restart your desktop session (log out / log in or reboot), KWin will allocate"
echo "   8-bit scanout framebuffers, enabling direct KMS capture."
echo "   Run: ./start-kms.sh (or 'npm run deck-kms')"
echo "======================="
