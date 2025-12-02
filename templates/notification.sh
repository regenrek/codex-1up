#!/usr/bin/env bash
# Codex notification hook — installed to ~/.codex/notify.sh by codex-1up
# Reads JSON payload on stdin or as first arg. Plays a short sound for specific events.

set -euo pipefail

payload="${1:-$(cat)}"

# Default sound path, set by codex-1up installer. Override via CODEX_CUSTOM_SOUND env var if needed.
DEFAULT_CODEX_SOUND="${HOME}/.codex/sounds/default.wav"

# Respect opt-out via env var
if [ "${CODEX_DISABLE_SOUND:-0}" = "1" ]; then
  exit 0
fi

# Resolve configured sound (absolute path recommended). Allow special value 'none'.
CODEX_CUSTOM_SOUND="${CODEX_CUSTOM_SOUND:-$DEFAULT_CODEX_SOUND}"
if [ -z "$CODEX_CUSTOM_SOUND" ] || [ "$CODEX_CUSTOM_SOUND" = "none" ]; then
  exit 0
fi

# Choose an available audio player
_pick_player() {
  if command -v afplay >/dev/null 2>&1; then echo "afplay"; return 0; fi
  if command -v paplay >/dev/null 2>&1; then echo "paplay"; return 0; fi
  if command -v aplay  >/dev/null 2>&1; then echo "aplay";  return 0; fi
  if command -v mpg123 >/dev/null 2>&1; then echo "mpg123"; return 0; fi
  if command -v ffplay >/dev/null 2>&1; then echo "ffplay -nodisp -autoexit"; return 0; fi
  echo ""
}

PLAYER_CMD=$(_pick_player)
[ -n "$PLAYER_CMD" ] || exit 0

# Only attempt to play if file exists
if [ ! -f "$CODEX_CUSTOM_SOUND" ]; then
  exit 0
fi

_play() {
  # shellcheck disable=SC2086
  $PLAYER_CMD "$CODEX_CUSTOM_SOUND" >/dev/null 2>&1 < /dev/null &
}

if command -v jq >/dev/null 2>&1; then
  notification_type=$(printf '%s' "$payload" | jq -r '.type // empty')
  case "$notification_type" in
    "agent-turn-complete") _play ;;
    *) : ;;
  esac
else
  _play
fi
