#!/usr/bin/env bash
# ==============================================================================
# IntelliSTAR Simulator — Raspberry Pi NDI / UDP to HLS Transcoder
# ==============================================================================
# Receives the broadcast stream over LAN from the Steam Deck / PC (via NDI or UDP)
# and converts it into HTTP Live Streaming (HLS) segments and m3u8 playlist.
#
# Supported Raspberry Pi Hardware:
#   - Raspberry Pi 5 (Quad Cortex-A76): Uses high-efficiency libx264 software encoding.
#   - Raspberry Pi 4 / 3 (Broadcom VideoCore): Uses h264_v4l2m2m hardware encoding or libx264.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ------------------------------------------------------------------------------
# Configuration (Override via environment variables or CLI flags)
# ------------------------------------------------------------------------------
INPUT_MODE="${INPUT_MODE:-ndi}"
NDI_SOURCE="${NDI_SOURCE:-IntelliSTAR}"
BROADCASTER_IP="${BROADCASTER_IP:-}"
UDP_PORT="${UDP_PORT:-1234}"
HLS_DIR="${HLS_DIR:-./hls-live}"
HLS_SEGMENT_TIME="${HLS_SEGMENT_TIME:-4}"
HLS_LIST_SIZE="${HLS_LIST_SIZE:-8}"
VIDEO_BITRATE="${VIDEO_BITRATE:-4000k}"
VIDEO_MAXRATE="${VIDEO_MAXRATE:-5000k}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"
SERVE_HTTP="${SERVE_HTTP:-false}"
HTTP_PORT="${HTTP_PORT:-8080}"
FFMPEG_BIN="${FFMPEG_BIN:-ffmpeg}"

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Modes:
  --source <name>       NDI stream name to ingest (default: 'IntelliSTAR')
  --ip <ip>             Direct IP address of broadcaster (e.g. 10.0.0.205)
  --udp [port]          Stream over direct UDP MPEG-TS (default port: 1234)
  --list, --find        Discover and list active NDI sources on the local network

HLS & Server Options:
  --dir <path>          HLS output directory (default: './hls-live')
  --segment-time <sec>  HLS segment duration in seconds (default: 4)
  --list-size <num>     Number of segments in playlist (default: 8)
  --bitrate <rate>      Target video bitrate for HLS (default: 4000k)
  --serve [port]        Start a local HTTP server for HLS delivery (default port: 8080)
  --help, -h            Show this message
EOF
}

# Parse command line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      INPUT_MODE="ndi"
      NDI_SOURCE="$2"
      shift 2
      ;;
    --ip)
      BROADCASTER_IP="$2"
      shift 2
      ;;
    --udp)
      INPUT_MODE="udp"
      if [[ -n "$2" && "$2" =~ ^[0-9]+$ ]]; then
        UDP_PORT="$2"
        shift 2
      else
        shift 1
      fi
      ;;
    --list|--find)
      if [[ -x "${APP_DIR}/bin/ndi-bridge" ]]; then
        "${APP_DIR}/bin/ndi-bridge" --list ${BROADCASTER_IP:+--ip "$BROADCASTER_IP"}
      elif "$FFMPEG_BIN" -muxers 2>&1 | grep -q "libndi_newtek"; then
        echo "[Pi-HLS] Scanning local network for NDI sources via FFmpeg..."
        "$FFMPEG_BIN" -f libndi_newtek -find_sources 1 -i dummy 2>&1 | grep -i "source" || true
      else
        echo "[Pi-HLS] To scan for NDI sources, build the bridge on this Pi first:"
        echo "  bash scripts/setup-ndi.sh"
        echo "Or stream directly via UDP: ./scripts/raspberry-pi-ndi-to-hls.sh --udp"
      fi
      exit 0
      ;;
    --dir)
      HLS_DIR="$2"
      shift 2
      ;;
    --segment-time)
      HLS_SEGMENT_TIME="$2"
      shift 2
      ;;
    --list-size)
      HLS_LIST_SIZE="$2"
      shift 2
      ;;
    --bitrate)
      VIDEO_BITRATE="$2"
      shift 2
      ;;
    --serve)
      SERVE_HTTP=true
      if [[ -n "$2" && "$2" =~ ^[0-9]+$ ]]; then
        HTTP_PORT="$2"
        shift 2
      else
        shift 1
      fi
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      print_usage
      exit 1
      ;;
  esac
done

echo "=============================================================================="
echo " IntelliSTAR Broadcast — Raspberry Pi ${INPUT_MODE^^} -> HLS Transcoder"
echo "=============================================================================="
if [[ "${INPUT_MODE}" == "udp" ]]; then
  echo " Input Protocol    : UDP (port :${UDP_PORT})"
else
  echo " Target NDI Source : ${NDI_SOURCE}"
fi
echo " HLS Directory     : ${HLS_DIR}"
echo " Segment Time      : ${HLS_SEGMENT_TIME}s"
echo " Playlist Window   : ${HLS_LIST_SIZE} segments"
echo " Output Bitrate    : ${VIDEO_BITRATE}"
echo "=============================================================================="

# Pre-flight capability checks
USE_BRIDGE=false
if [[ "${INPUT_MODE}" == "ndi" ]]; then
  HAS_FFMPEG_NDI=false
  if "$FFMPEG_BIN" -demuxers 2>&1 | grep -q "libndi_newtek"; then
    HAS_FFMPEG_NDI=true
  fi

  if [[ "${HAS_FFMPEG_NDI}" == "false" ]]; then
    if [[ -x "${APP_DIR}/bin/ndi-bridge" ]]; then
      echo "[Pi-HLS] Standard FFmpeg detected. Using local NDI bridge (bin/ndi-bridge --recv)..."
      USE_BRIDGE=true
    else
      echo ""
      echo "=============================================================================="
      echo "[Pi-HLS] NDI RECEIVER NOT CONFIGURED ON THIS RASPBERRY PI"
      echo "=============================================================================="
      echo "Standard Raspberry Pi OS FFmpeg does not have 'libndi_newtek' compiled in."
      echo ""
      echo "You have two fast ways to stream to this Pi:"
      echo ""
      echo "OPTION 1: Instant Streaming via UDP (Works immediately, zero build needed)"
      echo "  On Raspberry Pi: ./scripts/raspberry-pi-ndi-to-hls.sh --udp ${UDP_PORT} --serve ${HTTP_PORT}"
      echo "  On Steam Deck:   STREAM_MODE=udp UDP_URL=\"udp://$(hostname -I | awk '{print $1}'):${UDP_PORT}?pkt_size=1316\" npm run start-iptv"
      echo ""
      echo "OPTION 2: Set up NDI Receiver on this Raspberry Pi"
      echo "  On Raspberry Pi: bash scripts/setup-ndi.sh"
      echo "  Then re-run:     ./scripts/raspberry-pi-ndi-to-hls.sh --source \"${NDI_SOURCE}\" --serve ${HTTP_PORT}"
      echo "=============================================================================="
      exit 1
    fi
  fi
fi

# Detect optimal video encoder for this Raspberry Pi model
select_encoder() {
  # Check if hardware V4L2 M2M encoder is functional (Pi 3 / 4)
  if "$FFMPEG_BIN" -encoders 2>&1 | grep -q "h264_v4l2m2m"; then
    if "$FFMPEG_BIN" -hide_banner -f lavfi -i testsrc=duration=0.1:size=320x240:rate=30 -c:v h264_v4l2m2m -f null - 2>/dev/null; then
      echo "h264_v4l2m2m"
      return
    fi
  fi
  # Software encoding (Raspberry Pi 5 Cortex-A76)
  echo "libx264"
}

ENCODER=$(select_encoder)
echo "[Pi-HLS] Selected Video Encoder: ${ENCODER}"

# Prepare output directory
mkdir -p "${HLS_DIR}"
HLS_DIR_ABS=$(cd "${HLS_DIR}" && pwd)

# Clean up stale segment files
# Clean up stale segment files and any orphaned bridge/ffmpeg instances
rm -f "${HLS_DIR_ABS}"/index*.ts "${HLS_DIR_ABS}"/index.m3u8 2>/dev/null || true
killall -q -9 ffmpeg ndi-bridge 2>/dev/null || true
sleep 0.5


# Optional: Background HTTP server for HLS delivery
HTTP_PID=""
BRIDGE_PID=""
cleanup() {
  echo ""
  echo "[Pi-HLS] Stopping transcoding pipeline..."
  if [[ -n "${HTTP_PID}" ]]; then
    kill "${HTTP_PID}" 2>/dev/null || true
  fi
  if [[ -n "${BRIDGE_PID}" ]]; then
    kill "${BRIDGE_PID}" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

if [[ "${SERVE_HTTP}" == "true" ]]; then
  echo "[Pi-HLS] Starting HTTP server on port ${HTTP_PORT} serving ${HLS_DIR_ABS}..."
  (cd "${HLS_DIR_ABS}" && python3 -m http.server "${HTTP_PORT}" --bind 0.0.0.0 >/dev/null 2>&1) &
  HTTP_PID=$!
  PI_IP=$(hostname -I | awk '{print $1}')
  echo "[Pi-HLS] Stream playable at: http://${PI_IP}:${HTTP_PORT}/index.m3u8"
fi

# Build encoder-specific flags
ENCODER_FLAGS=()
if [[ "${ENCODER}" == "libx264" ]]; then
  ENCODER_FLAGS=(
    -c:v libx264
    -preset veryfast
    -tune zerolatency
    -b:v "${VIDEO_BITRATE}"
    -maxrate "${VIDEO_MAXRATE}"
    -bufsize "$(( ${VIDEO_BITRATE//k/} * 2 ))k"
    -pix_fmt yuv420p
    -g "$(( HLS_SEGMENT_TIME * 30 ))"
    -keyint_min "$(( HLS_SEGMENT_TIME * 30 ))"
    -sc_threshold 0
  )
else
  ENCODER_FLAGS=(
    -c:v h264_v4l2m2m
    -b:v "${VIDEO_BITRATE}"
    -g "$(( HLS_SEGMENT_TIME * 30 ))"
  )
fi

HLS_OUTPUT_FLAGS=(
  -c:a aac
  -b:a "${AUDIO_BITRATE}"
  -ar 48000
  -ac 2
  -f hls
  -hls_time "${HLS_SEGMENT_TIME}"
  -hls_list_size "${HLS_LIST_SIZE}"
  -hls_segment_filename "${HLS_DIR_ABS}/index%d.ts"
  -hls_flags delete_segments+omit_endlist+independent_segments+temp_file
  -hls_delete_threshold 1
  -hls_allow_cache 0
  "${HLS_DIR_ABS}/index.m3u8"
)

# Transcoding execution loop
while true; do
  if [[ "${INPUT_MODE}" == "udp" ]]; then
    echo "[Pi-HLS] Listening for incoming broadcast on udp://0.0.0.0:${UDP_PORT}..."
    "$FFMPEG_BIN" \
      -hide_banner \
      -loglevel warning \
      -stats \
      -i "udp://0.0.0.0:${UDP_PORT}?listen=1&fifo_size=1000000&overrun_nonfatal=1" \
      "${ENCODER_FLAGS[@]}" \
      "${HLS_OUTPUT_FLAGS[@]}" || true
  elif [[ "${USE_BRIDGE}" == "true" ]]; then
    echo "[Pi-HLS] Connecting bridge to NDI source '${NDI_SOURCE}'${BROADCASTER_IP:+ on IP ${BROADCASTER_IP}}..."
    "${APP_DIR}/bin/ndi-bridge" --recv --source "${NDI_SOURCE}" ${BROADCASTER_IP:+--ip "$BROADCASTER_IP"} --audio-port 18890 | \
      "$FFMPEG_BIN" \
        -hide_banner \
        -loglevel warning \
        -stats \
        -thread_queue_size 2048 \
        -f rawvideo -pix_fmt uyvy422 -s 1280x720 -r 30 -i - \
        -f s16le -ar 48000 -ac 2 -i udp://127.0.0.1:18890 \
        -thread_queue_size 2048 \
        -probesize 32768 -analyzeduration 500000 \
        -f s16le -ar 48000 -ac 2 -i "udp://127.0.0.1:18890?overrun_nonfatal=1&fifo_size=1000000" \
        "${ENCODER_FLAGS[@]}" \
        "${HLS_OUTPUT_FLAGS[@]}" || true
  else
    echo "[Pi-HLS] Ingesting NDI source '${NDI_SOURCE}' directly via libndi_newtek..."
    "$FFMPEG_BIN" \
      -hide_banner \
      -loglevel warning \
      -stats \
      -f libndi_newtek \
      -i "${NDI_SOURCE}" \
      "${ENCODER_FLAGS[@]}" \
      "${HLS_OUTPUT_FLAGS[@]}" || true
  fi

  echo "[Pi-HLS] Stream ended or disconnected. Reconnecting in 3 seconds..."
  sleep 3
done
