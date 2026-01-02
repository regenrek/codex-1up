#!/usr/bin/env bash
set -euo pipefail

tmp_home="$(mktemp -d)"

pnpm build

HOME="$tmp_home" ./bin/codex-1up install
