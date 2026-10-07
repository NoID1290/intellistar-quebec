#!/usr/bin/env bash
set -e

PI_USER="${PI_USER:-noid1290}"
PI_HOST="${PI_HOST:-intellistar.local}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=============================================================================="
echo " Syncing updated NDI bridge & transcoder scripts to Raspberry Pi (${PI_HOST})..."
echo "=============================================================================="

scp "${APP_DIR}/scripts/ndi-bridge.cpp" \
    "${APP_DIR}/scripts/setup-ndi.sh" \
    "${APP_DIR}/scripts/raspberry-pi-ndi-to-hls.sh" \
    "${PI_USER}@${PI_HOST}:~/app/scripts/"

echo "Making scripts executable on Raspberry Pi..."
ssh "${PI_USER}@${PI_HOST}" "chmod +x ~/app/scripts/*.sh"

echo "Rebuilding NDI bridge on Raspberry Pi..."
ssh "${PI_USER}@${PI_HOST}" "cd ~/app && bash scripts/setup-ndi.sh"

echo "=============================================================================="
echo " SUCCESS: Raspberry Pi scripts and NDI bridge have been updated!"
echo "=============================================================================="

