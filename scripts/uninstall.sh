#!/usr/bin/env bash
set -euo pipefail

PROJECT="codex-1up"
echo "Uninstall: removing shell alias blocks"

remove_block() {
  local rc="$1"
  [ -f "$rc" ] || return 0
  # Remove both commented markers (new format) and legacy bare markers (old invalid format)
  if grep -q ">>> ${PROJECT} >>>" "$rc"; then
    # shellcheck disable=SC2016
    sed -i.bak -e "/# >>> ${PROJECT} >>>/,/# <<< ${PROJECT} <</d" -e "/>>> ${PROJECT} >>>/,/<<< ${PROJECT} <</d" "$rc"
    echo "Cleaned ${rc} (backup at ${rc}.bak)"
  fi
}

remove_block "$HOME/.zshrc"
remove_block "$HOME/.bashrc"
remove_block "$HOME/.config/fish/config.fish"

echo "Note: packages (codex, rg, fd, ast-grep, bat, git, git-delta, gh, etc.) are not removed."
echo "Uninstall complete."
