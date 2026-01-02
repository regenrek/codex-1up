#!/usr/bin/env bash
set -euo pipefail

need() { command -v "$1" >/dev/null 2>&1; }
check() { if need "$1"; then echo "✔ $1"; else echo "✖ $1 (missing)"; fi }

echo "codex-1up doctor"
echo "--- binaries ---"
for c in node npm codex ast-grep rg fd fdfind fzf jq yq bat batcat git delta gh code; do
  check "$c"
done

echo "--- codex paths ---"
if command -v codex >/dev/null 2>&1; then
  # Show all codex candidates on PATH (guarded to avoid exiting with -e)
  type -a codex 2>/dev/null || which -a codex 2>/dev/null || command -v codex 2>/dev/null
else
  echo "codex not found on PATH"
fi

echo "--- git ---"
echo "diff.external = $(git config --global --get diff.external || echo "(none)")"
echo "core.pager = $(git config --global --get core.pager || echo "(none)")"

echo "--- codex config ---"
CFG="$HOME/.codex/config.toml"
if [ -f "$CFG" ]; then
  echo "found: $CFG"
  if grep -Eiq '^\s*\[tools\]' "$CFG" && grep -Eiq '^\s*web_search\s*=\s*true' "$CFG"; then
    echo "✔ tools.web_search = true"
  else
    echo "✖ tools.web_search not enabled"
  fi
else
  echo "✖ ~/.codex/config.toml not found"
fi

echo "--- shell rc hints ---"
echo "SHELL=$SHELL"
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.config/fish/config.fish"; do
  if [ -f "$rc" ]; then
    if grep -q "# >>> codex-1up >>>" "$rc"; then
      echo "Found codex-1up block in $rc"
    elif grep -q ">>> codex-1up >>>" "$rc"; then
      echo "Found codex-1up block in $rc (legacy format - remove manually)"
    fi
  fi
done

echo "Done."
