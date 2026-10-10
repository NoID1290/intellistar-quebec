#!/usr/bin/env bash

PORT="${1:-7070}"

echo "========================================="
echo " Stopping IntelliSTAR Services & Streams "
echo "========================================="

FOUND=0

# 1. Stop node processes matching project scripts
PIDS=$(pgrep -f "node.*(start-iptv\.js|app\.js)" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "Stopping IntelliSTAR Node processes (PID: $PIDS)..."
    kill $PIDS 2>/dev/null || true
    # Allow bounded browser/FFmpeg shutdown and audio-module unload to finish.
    sleep 5
    # Force kill if still alive
    kill -9 $PIDS 2>/dev/null || true
    echo "  Stopped Node processes."
    FOUND=1
fi

# 2. Stop any process listening on the target port (preserve OBS encoder backend)
kill_non_obs_pid() {
    local pid="$1"
    local cmd
    cmd=$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)
    if [[ "$cmd" =~ start-obs|stream-obs ]]; then
        echo "  Preserving OBS encoder standby listener on port ${PORT} (PID: ${pid})."
    else
        echo "  Freeing port ${PORT} (PID: ${pid})..."
        kill -9 "$pid" 2>/dev/null || true
        FOUND=1
    fi
}

if command -v fuser >/dev/null 2>&1; then
    PORT_PIDS=$(fuser "${PORT}/tcp" 2>/dev/null || true)
    if [ -n "$PORT_PIDS" ]; then
        for pid in $PORT_PIDS; do
            kill_non_obs_pid "$pid"
        done
    fi
elif command -v lsof >/dev/null 2>&1; then
    PORT_PIDS=$(lsof -ti ":${PORT}" 2>/dev/null || true)
    if [ -n "$PORT_PIDS" ]; then
        for pid in $PORT_PIDS; do
            kill_non_obs_pid "$pid"
        done
    fi
elif command -v ss >/dev/null 2>&1; then
    PORT_PIDS=$(ss -lptn "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)
    if [ -n "$PORT_PIDS" ]; then
        for pid in $PORT_PIDS; do
            kill_non_obs_pid "$pid"
        done
    fi
fi

# 3. Clean up any orphaned ffmpeg or chromium processes created by start-iptv
FFMPEG_PIDS=$(pgrep -f "ffmpeg.*(image2pipe|matroska|x11grab|intelli-stream|index.*\.ts|vaapi)" 2>/dev/null || true)
if [ -n "$FFMPEG_PIDS" ]; then
    echo "Stopping streaming FFmpeg processes (PID: $FFMPEG_PIDS)..."
    kill -9 $FFMPEG_PIDS 2>/dev/null || true
fi

CHROMIUM_PIDS=$(pgrep -f "(\.cache/puppeteer/chrome|chromium|google-chrome).*(--headless|puppeteer)" 2>/dev/null || true)
if [ -n "$CHROMIUM_PIDS" ]; then
    echo "Stopping headless Chromium capture processes (PID: $CHROMIUM_PIDS)..."
    kill -9 $CHROMIUM_PIDS 2>/dev/null || true
fi

# Only Xvfb servers launched by start-iptv (matched on its exact argument set); -noreset keeps them alive otherwise
XVFB_PIDS=$(pgrep -f "Xvfb :[0-9]+ -screen 0 [0-9]+x[0-9]+x24 -ac \+extension GLX" 2>/dev/null || true)
if [ -n "$XVFB_PIDS" ]; then
    echo "Stopping orphaned Xvfb capture displays (PID: $XVFB_PIDS)..."
    kill $XVFB_PIDS 2>/dev/null || true
fi

# Only our named PipeWire pipeline, not other GStreamer desktop sessions.
PIPEWIRE_PIDS=$(pgrep -f 'gst-launch-1.0.*pipewiresrc.*name=intellistar_capture' 2>/dev/null || true)
if [[ -n "$PIPEWIRE_PIDS" ]]; then
    kill $PIPEWIRE_PIDS 2>/dev/null || true
fi

# Recover modules after SIGKILL/power loss. Match the exact null-sink name token,
# never a substring (which could unload unrelated sinks). Custom names can be supplied.
if command -v pactl >/dev/null 2>&1; then
    SINK_NAME="${STREAM_PIPEWIRE_AUDIO_SINK:-IntelliStar_Audio}"
    while read -r MODULE_ID MODULE_NAME MODULE_ARGS; do
        if [[ "$MODULE_NAME" == 'module-null-sink' && "$MODULE_ID" =~ ^[0-9]+$ ]]; then
            for ARG in $MODULE_ARGS; do
                if [[ "$ARG" == "sink_name=$SINK_NAME" ]]; then
                    pactl unload-module "$MODULE_ID" 2>/dev/null || true
                    break
                fi
            done
        fi
    done < <(pactl list short modules 2>/dev/null)
fi

if [ "$FOUND" -eq 0 ]; then
    echo "No running server or stream processes found on port ${PORT}."
else
    echo "IntelliSTAR stopped. Port ${PORT} is now free."
fi
echo "========================================="
