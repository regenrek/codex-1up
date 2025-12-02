#!/usr/bin/env bash
set -euo pipefail

PROJECT="codex-1up"
echo "Uninstall: removing shell alias blocks and git config entries"

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

# Git settings (safe to leave, but we can remove)
if [ "$(git config --global --get difftool.difftastic.cmd)" ]; then
  git config --global --unset difftool.difftastic.cmd || true
  git config --global --unset difftool.prompt || true
  echo "Removed git difftastic difftool config"
fi

if [ "$(git config --global --get diff.external)" = "difft" ]; then
  git config --global --unset diff.external || true
  echo "Removed git diff.external=difft"
fi

echo "Note: packages (codex, fd, rg, ast-grep, difftastic, etc.) are not removed."
echo "Uninstall complete."
