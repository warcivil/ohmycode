#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
exec env -u ELECTRON_RUN_AS_NODE packages/desktop/node_modules/electron/dist/electron packages/desktop "$@"
