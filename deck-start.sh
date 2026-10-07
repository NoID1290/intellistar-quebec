#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Ensure Node/NPM are discovered across standard paths including NVM/asdf
export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$HOME/.asdf/shims:$HOME/.asdf/bin"

# The Deck launcher selects the quality profile; caller overrides still win.
# GPU/RAM-cache choices are resolved in stream-config.js, not forced here.
export STREAM_PRESET="${STREAM_PRESET:-deck-quality}"

exec npm run start-iptv
