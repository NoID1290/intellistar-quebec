#!/usr/bin/env bash
set -eo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Discover node across common paths including NVM
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST_NODE="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)"
  if [ -n "$LATEST_NODE" ] && [ -x "$HOME/.nvm/versions/node/$LATEST_NODE/bin/node" ]; then
    NODE_BIN="$HOME/.nvm/versions/node/$LATEST_NODE/bin/node"
    export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
  fi
fi

if [ -z "$NODE_BIN" ]; then
  echo "Error: Node.js could not be found." >&2
  exit 1
fi

export PATH="$PATH:/usr/local/bin:/usr/bin:$HOME/.local/bin"

exec "$NODE_BIN" launcher-ui.js "$@"
