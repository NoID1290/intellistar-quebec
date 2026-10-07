#!/usr/bin/env bash
# ==============================================================================
# IntelliSTAR — Linux / Steam Deck NDI Setup Helper
# ==============================================================================
# Sets up the NewTek/Vizrt NDI SDK and builds the high-performance standalone
# NDI sender bridge (bin/ndi-bridge).
#
# This allows IntelliSTAR to stream raw broadcast video & audio natively over NDI
# using the standard system FFmpeg without needing to recompile FFmpeg from source.
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_DIR="${HOME}/.local/ndi"
NDI_SDK_URL="https://downloads.ndi.tv/SDK/NDI_SDK_Linux/Install_NDI_SDK_v6_Linux.tar.gz"

echo "=============================================================================="
echo " IntelliSTAR NDI Setup Helper"
echo "=============================================================================="
echo ""

mkdir -p "${INSTALL_DIR}"
mkdir -p "${APP_DIR}/bin"

# 1. Check if NDI SDK is downloaded and unpacked
SDK_DIR=$(find "${INSTALL_DIR}" -type d -name "NDI SDK for Linux" 2>/dev/null | head -n 1)

if [[ -z "${SDK_DIR}" || ! -f "${SDK_DIR}/include/Processing.NDI.Lib.h" ]]; then
  echo "[NDI-Setup] NDI SDK not found in ${INSTALL_DIR}."
  echo "[NDI-Setup] Downloading official NDI Linux SDK from Vizrt/NewTek..."
  cd "${INSTALL_DIR}"
  if [[ ! -f "Install_NDI_SDK_v6_Linux.tar.gz" ]]; then
    curl -L -o Install_NDI_SDK_v6_Linux.tar.gz "${NDI_SDK_URL}" || {
      echo "[NDI-Setup] Download failed. Please download the Linux SDK from https://ndi.video/ and place it in ${INSTALL_DIR}."
      exit 1
    }
  fi

  echo "[NDI-Setup] Extracting installer archive..."
  tar -xzf Install_NDI_SDK_v6_Linux.tar.gz

  INSTALLER=$(find . -maxdepth 1 -name "Install_NDI_SDK_*.sh" | head -n 1)
  if [[ -n "${INSTALLER}" ]]; then
    echo "[NDI-Setup] Unpacking NDI SDK components..."
    chmod +x "${INSTALLER}"
    echo "y" | "${INSTALLER}" || true
  fi

  SDK_DIR=$(find "${INSTALL_DIR}" -type d -name "NDI SDK for Linux" 2>/dev/null | head -n 1)
fi

if [[ -z "${SDK_DIR}" || ! -f "${SDK_DIR}/include/Processing.NDI.Lib.h" ]]; then
  echo "[NDI-Setup] Error: Unable to locate NDI SDK include directory."
  exit 1
fi

echo "[NDI-Setup] Found NDI SDK at: ${SDK_DIR}"

# 2. Locate libndi.so based on system architecture
ARCH=$(uname -m)
if [[ "${ARCH}" == "aarch64" ]]; then
  LIB_DIR="${SDK_DIR}/lib/aarch64-rpi4-linux-gnueabi"
elif [[ "${ARCH}" =~ ^arm ]]; then
  LIB_DIR="${SDK_DIR}/lib/arm-rpi4-linux-gnueabihf"
else
  LIB_DIR="${SDK_DIR}/lib/x86_64-linux-gnu"
fi

if [[ ! -f "${LIB_DIR}/libndi.so" && ! -f "${LIB_DIR}/libndi.so.6" ]]; then
  # Fallback search
  LIB_FILE=$(find "${SDK_DIR}" -name "libndi.so*" 2>/dev/null | head -n 1)
  if [[ -n "${LIB_FILE}" ]]; then
    LIB_DIR=$(dirname "${LIB_FILE}")
  elif [[ -f "/usr/lib/libndi.so" ]]; then
    LIB_DIR="/usr/lib"
  else
    echo "[NDI-Setup] Error: Could not locate libndi.so for architecture ${ARCH}."
    exit 1
  fi
fi

echo "[NDI-Setup] Target architecture: ${ARCH}"
echo "[NDI-Setup] Found NDI library directory: ${LIB_DIR}"

# 3. Compile standalone NDI bridge binary
echo "[NDI-Setup] Building IntelliSTAR NDI Bridge (bin/ndi-bridge)..."

g++ -O2 -pthread -I"${SDK_DIR}/include" \
  "${APP_DIR}/scripts/ndi-bridge.cpp" \
  -L"${LIB_DIR}" \
  -Wl,-rpath="${LIB_DIR}" \
  -lndi \
  -o "${APP_DIR}/bin/ndi-bridge"

chmod +x "${APP_DIR}/bin/ndi-bridge"

# 4. Verify compilation
if "${APP_DIR}/bin/ndi-bridge" --help &>/dev/null; then
  echo ""
  echo "=============================================================================="
  echo " SUCCESS: NDI Setup is complete!"
  echo "=============================================================================="
  echo "Bridge binary created at: ${APP_DIR}/bin/ndi-bridge"
  echo ""
  echo "You can now start streaming over NDI immediately using:"
  echo ""
  echo "  npm run start-ndi"
  echo ""
  echo "Or with environment variables:"
  echo "  STREAM_MODE=ndi npm run start-iptv"
  echo "=============================================================================="
else
  echo "[NDI-Setup] Error: Bridge verification failed."
  exit 1
fi
