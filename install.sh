#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.1"
PROJECT="codex-1up"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# If ROOT_DIR is not the expected project directory, try to find it
if [ ! -d "${ROOT_DIR}/templates" ]; then
  # This might be running from within the project directory
  if [ -d "./templates" ]; then
    ROOT_DIR="$(pwd)"
  fi
fi

DRY_RUN=false
ASSUME_YES=false
SKIP_CONFIRMATION=false
SHELL_TARGET="auto"
VSCE_ID=""
NO_VSCODE=false
GIT_EXTERNAL_DIFF=false
INSTALL_NODE="nvm"
AGENTS_TARGET=""
AGENTS_TEMPLATE="default"

LOG_DIR="${HOME}/.${PROJECT}"
mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/install-$(date +%Y%m%d-%H%M%S).log"

# --- colors ---
if [ -t 1 ]; then
  BOLD="\\033[1m"; GREEN="\\033[32m"; YELLOW="\\033[33m"; RED="\\033[31m"; RESET="\\033[0m"
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

log()   { echo -e "$1" | tee -a "$LOG_FILE"; }
info()  { log "${BOLD}${1}${RESET}"; }
ok()    { log "${GREEN}✔${RESET} ${1}"; }
warn()  { log "${YELLOW}⚠${RESET} ${1}"; }
err()   { log "${RED}✖${RESET} ${1}"; }
# Safe runner that does not eval the command string, preventing unintended expansion
# Use: run cmd arg1 arg2 ... (space-separated args)
run()   {
  if $DRY_RUN; then
    printf "[dry-run]"; for a in "$@"; do printf " %q" "$a"; done; printf "\n"; return 0
  fi
  "$@" >>"$LOG_FILE" 2>&1
}

usage() {
  cat <<USAGE
${PROJECT} installer v${VERSION}

Usage: ./install.sh [options]

  --yes                     non-interactive; accept safe defaults
  --dry-run                 print actions without making changes
  --skip-confirmation       skip user prompts for system changes
  --shell auto|zsh|bash|fish
  --vscode EXT_ID           install VS Code extension id (e.g. openai.codex)
  --no-vscode               skip VS Code extension checks
  --git-external-diff       set difftastic as git's external diff (opt-in)
  --install-node nvm|brew|skip   how to install Node if missing (default: nvm)
  --agents-md [PATH]        write starter AGENTS.md to PATH (default: \$PWD/AGENTS.md)
  --agents-template default|typescript|python|shell  template variant for AGENTS.md (default: default)
  -h, --help                show help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    --skip-confirmation) SKIP_CONFIRMATION=true ;;
    --shell) SHELL_TARGET="${2:-auto}"; shift ;;
    --vscode) VSCE_ID="${2:-}"; shift ;;
    --no-vscode) NO_VSCODE=true ;;
    --git-external-diff) GIT_EXTERNAL_DIFF=true ;;
    --install-node) INSTALL_NODE="${2:-nvm}"; shift ;;
    --agents-md)
      if [ "${2:-}" ] && [[ ! "${2}" =~ ^-- ]]; then AGENTS_TARGET="${2}"; shift; else AGENTS_TARGET="$PWD/AGENTS.md"; fi
      ;;
    --agents-template)
      AGENTS_TEMPLATE="${2:-default}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) warn "Unknown arg: $1"; usage; exit 1 ;;
  esac
  shift
done

confirm() {
  $ASSUME_YES && return 0
  $SKIP_CONFIRMATION && return 0
  read -r -p "$1 [y/N] " ans || true
  [[ "${ans}" =~ ^[Yy]$ ]]
}

need_cmd() { command -v "$1" >/dev/null 2>&1; }

detect_pm() {
  if need_cmd brew; then echo brew
  elif need_cmd apt-get; then echo apt
  elif need_cmd dnf; then echo dnf
  elif need_cmd pacman; then echo pacman
  elif need_cmd zypper; then echo zypper
  else echo none
  fi
}

install_pkg() {
  local pm="$1"; shift
  local pkgs=("$@")
  case "$pm" in
    brew) run brew update; run brew install "${pkgs[@]}" ;;
    apt)  run sudo apt-get update -y; run sudo apt-get install -y "${pkgs[@]}" ;;
    dnf)  run sudo dnf install -y "${pkgs[@]}" ;;
    pacman) run sudo pacman -Sy --noconfirm "${pkgs[@]}" ;;
    zypper) run sudo zypper refresh; run sudo zypper install -y "${pkgs[@]}" ;;
    *) err "No supported package manager found"; return 1 ;;
  esac
}

ensure_brew() {
  if need_cmd brew; then return 0; fi
  if [[ "$(uname -s)" != "Darwin" ]]; then return 0; fi
  info "Homebrew not found; installing Homebrew"
  if $DRY_RUN; then echo "[dry-run] install Homebrew"; return 0; fi
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" >>"$LOG_FILE" 2>&1
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "${HOME}/.zprofile"
  eval "$(/opt/homebrew/bin/brew shellenv)"
}

ensure_node() {
  if need_cmd node && need_cmd npm; then ok "Node.js present ($(node -v))"; return 0; fi
  case "$INSTALL_NODE" in
    nvm)
      info "Installing Node.js via nvm"
      if $DRY_RUN; then echo "[dry-run] install nvm + Node LTS"; return 0; fi
      export NVM_DIR="$HOME/.nvm"
      if [ ! -d "$NVM_DIR" ]; then
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >>"$LOG_FILE" 2>&1
      fi
      # shellcheck disable=SC1090
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
      nvm install --lts >>"$LOG_FILE" 2>&1
      ;;
    brew)
      ensure_brew
      install_pkg brew node
      ;;
    skip)
      warn "Skipping Node installation; please install Node 18+ manually"
      ;;
  esac
  if need_cmd node; then ok "Node.js installed ($(node -v))"; else err "Node installation failed"; exit 1; fi
}

install_npm_globals() {
  info "Checking global npm packages (@openai/codex, @ast-grep/cli)"

  local pkgs=("@openai/codex" "@ast-grep/cli")
  local updates=()

  for pkg in "${pkgs[@]}"; do
    # Fetch latest version from registry
    local latest
    latest=$(npm view "$pkg" version 2>/dev/null || true)
    if [ -z "$latest" ]; then
      warn "Could not fetch latest version for $pkg; skipping upgrade check"
      continue
    fi

    # Detect installed version using npm ls --json and parse with node
    local installed
    installed=$(npm ls -g "$pkg" --depth=0 --json 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  try{const j=JSON.parse(s); const name=process.argv[1]; const dep=j.dependencies&&j.dependencies[name]; console.log(dep?dep.version:"");}
  catch{console.log("")}
});' "$pkg")

    if [ -z "$installed" ]; then
      info "$pkg not installed; will install @$latest"
      updates+=("$pkg@$latest")
    elif [ "$installed" != "$latest" ]; then
      info "$pkg $installed -> $latest"
      updates+=("$pkg@$latest")
    else
      ok "$pkg up-to-date ($installed)"
    fi
  done

  if [ ${#updates[@]} -gt 0 ]; then
    info "Installing/updating global npm packages"
    run npm install -g "${updates[@]}"
  else
    ok "Global npm packages are up-to-date"
  fi

  if need_cmd codex; then ok "Codex CLI installed"; else err "Codex CLI not found after install"; fi
  if need_cmd ast-grep; then ok "ast-grep installed"; else warn "ast-grep not found; check npm global path"; fi
}

ensure_tools() {
  local pm="$(detect_pm)"
  info "Detected package manager: ${pm}"
  case "$pm" in
    brew)
      install_pkg brew fd ripgrep fzf jq yq difftastic
      ;;
    apt)
      install_pkg apt ripgrep fzf jq yq git-delta || true
      if ! need_cmd fd; then install_pkg apt fd-find || true; fi
      ;;
    dnf)
      install_pkg dnf ripgrep fd-find fzf jq yq git-delta || true
      ;;
    pacman)
      install_pkg pacman ripgrep fd fzf jq yq git-delta || true
      ;;
    zypper)
      install_pkg zypper ripgrep fd fzf jq yq git-delta || true
      ;;
    *)
      warn "Could not detect a supported package manager; please install tools manually"
      ;;
  esac

  # Try to install difftastic via cargo if not present
  if ! need_cmd difft && ! need_cmd difftastic; then
    if need_cmd cargo; then
      info "Installing difftastic via cargo"
      run cargo install difftastic
    else
      warn "difftastic not found and Rust/cargo missing; falling back to git-delta"
    fi
  fi

  # Symlink fd on Debian/Ubuntu (fd-find)
  if need_cmd fdfind && ! need_cmd fd; then
    mkdir -p "${HOME}/.local/bin"
    if [ ! -e "${HOME}/.local/bin/fd" ]; then
      run ln -s "$(command -v fdfind)" "${HOME}/.local/bin/fd"
    fi
    ok "fd alias created at ~/.local/bin/fd"
  fi

  # Show summary
  for c in fd fdfind rg fzf jq yq difft difftastic delta ast-grep; do
    if need_cmd "$c"; then ok "$c ✓"; fi
  done
}

configure_git() {
  # Skip entirely if git is not present
  if ! need_cmd git; then
    info "git not found; skipping git configuration"
    return 0
  fi

  if ! confirm "Configure git diff tools for better syntax-aware code diffs (recommended for developers)?"; then
    info "Skipping git configuration"
    return 0
  fi

  info "Configuring git difftool aliases"
  if need_cmd difft || need_cmd difftastic; then
    run git config --global difftool.difftastic.cmd 'difft "$LOCAL" "$REMOTE"' || warn "Failed to configure difftastic difftool"
    run git config --global difftool.prompt false || warn "Failed to disable difftool prompt"
    ok "Configured git difftool 'difftastic'"
    if $GIT_EXTERNAL_DIFF; then
      run git config --global diff.external difft || warn "Failed to set git external diff"
      ok "Set git diff.external = difft"
    fi
  elif need_cmd delta; then
    run git config --global core.pager delta || warn "Failed to configure delta pager"
    ok "Configured git pager to delta (fallback)"
  else
    warn "No difftastic or delta found; git diff will remain default"
  fi
}

target_shell_rc() {
  local st="${SHELL_TARGET}"
  if [ "$st" = "auto" ]; then
    case "${SHELL:-}" in
      */zsh) echo "${HOME}/.zshrc" ;;
      */bash) echo "${HOME}/.bashrc" ;;
      */fish) echo "${HOME}/.config/fish/config.fish" ;;
      *) echo "${HOME}/.bashrc" ;;
    esac
  else
    case "$st" in
      zsh) echo "${HOME}/.zshrc" ;;
      bash) echo "${HOME}/.bashrc" ;;
      fish) echo "${HOME}/.config/fish/config.fish" ;;
      *) echo "${HOME}/.bashrc" ;;
    esac
  fi
}

configure_shell() {
  local rc_file
  rc_file="$(target_shell_rc)"

  info "The following aliases will be added to ${rc_file}:"
  echo "  cx='codex exec'          # Run codex commands"
  echo "  cxdiff='git difftool -y' # Launch git difftool"
  echo "  fd='fdfind'              # fd-find alias (if applicable)"

  if ! confirm "Add these aliases to your shell config?"; then
    info "Skipping shell alias configuration"
    return 0
  fi

  info "Updating shell rc: ${rc_file}"
  mkdir -p "$(dirname "$rc_file")"

  local begin="# >>> ${PROJECT} >>>"
  local end="# <<< ${PROJECT} <<<"
  local block
  block=$(cat <<'EOF'
# >>> codex-1up >>>
# Aliases
alias cx='codex exec'
alias cxdiff='git difftool -y'
# fd alias on Debian/Ubuntu
if command -v fdfind >/dev/null 2>&1 && ! command -v fd >/dev/null 2>&1; then
  alias fd='fdfind'
fi
# <<< codex-1up <<<
EOF
  )

  # Remove existing block
  if [ -f "$rc_file" ] && grep -q ">>> ${PROJECT} >>>" "$rc_file"; then
    run sed -i.bak -e "/>>> ${PROJECT} >>>/,/<<< ${PROJECT} <</d" "$rc_file"
  fi

  if [[ "$rc_file" == *fish* ]]; then
    block=$(cat <<'EOF'
# >>> codex-1up >>>
alias cx 'codex exec'
alias cxdiff 'git difftool -y'
if type -q fdfind; and not type -q fd
  alias fd 'fdfind'
end
# <<< codex-1up <<<
EOF
    )
  fi

  if $DRY_RUN; then
    echo "[dry-run] append block to ${rc_file}"
  else
    {
      echo ""
      echo "$begin"
      echo "$block"
      echo "$end"
      echo ""
    } >> "$rc_file"
    ok "Appended aliases to ${rc_file}"
  fi
}

write_codex_config() {
  local cfg="${HOME}/.codex/config.toml"
  local template_dir="${ROOT_DIR}/templates/configs"

  # Prompt user to choose config profile
  info "Choose your codex-1up configuration profile:"
  echo ""
  echo "  1) SAFE     - Most restrictive, asks for approval when commands fail"
  echo "                (Recommended for high-security environments)"
  echo ""
  echo "  2) DEFAULT  - Balanced approach, asks for approval when needed"
  echo "                (Recommended for most users - good security/usability balance)"
  echo ""
  echo "  3) YOLO     - Full access, never asks for approval"
  echo "                ⚠️  WARNING: Allows codex full disk + network access!"
  echo "                ⚠️  WARNING: Inherits ALL environment variables (including secrets)!"
  echo "                ⚠️  Only use in trusted, sandboxed environments!"
  echo ""
  echo "  4) NO CHANGES - Do not create or modify ~/.codex/config.toml"
  echo "                (You can manage it yourself later)"

  local selected_profile="default"
  if ! $SKIP_CONFIRMATION; then
    echo -n "Choose profile [1-4] (default: 2/DEFAULT): "
    read -r choice || choice="2"

    case "$choice" in
      1|"safe"|"SAFE") selected_profile="safe" ;;
      2|"default"|"DEFAULT"|""|"2") selected_profile="default" ;;
      3|"yolo"|"YOLO")
        warn "⚠️  You selected YOLO mode!"
        warn "⚠️  This gives codex FULL access to your system and ALL environment variables!"
        if ! confirm "Are you sure you want to proceed with YOLO mode?"; then
          info "Falling back to DEFAULT profile"
          selected_profile="default"
        else
          selected_profile="yolo"
        fi
        ;;
      4|"none"|"no"|"skip")
        info "User chose to make no changes to ~/.codex/config.toml"
        return 0
        ;;
      *) 
        warn "Invalid choice, using DEFAULT profile"
        selected_profile="default"
        ;;
    esac
  fi

  # Use selected template
  local template_file="${template_dir}/codex-${selected_profile}.toml"
  if [ ! -f "$template_file" ]; then
    err "Template file not found: ${template_file}"
    return 1
  fi

  # If an existing config is present, confirm overwrite now (with profile context)
  if [ -f "$cfg" ]; then
    warn "~/.codex/config.toml already exists"
    if confirm "Overwrite with the '${selected_profile}' template? (existing will be backed up)"; then
      local backup="${cfg}.backup.$(date +%Y%m%d_%H%M%S)"
      run cp "$cfg" "$backup"
      info "Backed up existing config to: ${backup}"
    else
      info "Keeping existing config unchanged"
      return 0
    fi
  fi

  info "Creating config using ${selected_profile} profile"
  mkdir -p "${HOME}/.codex"
  run cp "$template_file" "$cfg"

  ok "Created ~/.codex/config.toml with ${selected_profile} profile"
  info "See config options: https://github.com/openai/codex/blob/main/docs/config.md"
}

# Prompt to create a global AGENTS.md in ~/.codex
maybe_prompt_global_agents() {
  # Interactive selection similar to config profile flow
  local target_path="${HOME}/.codex/AGENTS.md"

  # In fully non-interactive mode, skip creating global AGENTS.md
  if $SKIP_CONFIRMATION; then
    info "Skipping global AGENTS.md creation (non-interactive mode)"
    return 0
  fi

  info "Do you want to create a global AGENTS.md for personal guidance at ~/.codex/AGENTS.md?"
  echo ""
  echo "  1) default     - Generic rubric (works for most repos)"
  echo "  2) typescript  - TS/TSX-focused rubric with ast-grep examples"
  echo "  3) python      - Python-focused rubric and tooling notes (ruff, mypy, pytest)"
  echo "  4) shell       - Shell/Bash-focused rubric with shellcheck/shfmt/bats tips"
  echo "  5) NONE        - Do not create ~/.codex/AGENTS.md"

  local choice="5"
  echo -n "Choose template [1-5] (default: 5/NONE): "
  read -r choice || choice="5"

  local selected_template=""
  case "$choice" in
    1|"default"|"DEFAULT") selected_template="default" ;;
    2|"typescript"|"TYPESCRIPT") selected_template="typescript" ;;
    3|"python"|"PYTHON") selected_template="python" ;;
    4|"shell"|"SHELL") selected_template="shell" ;;
    5|"none"|"NONE"|"") selected_template="" ;;
    *)
      warn "Invalid choice; skipping global AGENTS.md creation"
      selected_template=""
      ;;
  esac

  # User chose not to create
  if [ -z "$selected_template" ]; then
    info "Not creating ~/.codex/AGENTS.md"
    return 0
  fi

  mkdir -p "${HOME}/.codex"

  # If exists, ask to overwrite with backup
  if [ -f "$target_path" ]; then
    warn "${target_path} already exists"
    read -r -p "Overwrite existing file? (backup will be created) [y/N] " ans || ans="n"
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
      info "Keeping existing AGENTS.md unchanged"
      return 0
    fi
    local backup="${target_path}.backup.$(date +%Y%m%d_%H%M%S)"
    run cp "$target_path" "$backup"
    info "Backed up existing AGENTS.md to: ${backup}"
  fi

  local src="${ROOT_DIR}/templates/agent-templates/AGENTS-${selected_template}.md"
  if [ ! -f "$src" ]; then
    warn "Unknown agents template '${selected_template}', falling back to 'default'"
    src="${ROOT_DIR}/templates/agent-templates/AGENTS-default.md"
  fi
  info "Writing global AGENTS.md to: ${target_path} (template: ${selected_template})"
  run cp "$src" "$target_path"
  ok "Wrote ${target_path}"
}

install_prompt_templates() {
  local src_dir="${ROOT_DIR}/templates/prompts"
  local dest_dir="${HOME}/.codex/prompts"

  if [ ! -d "$src_dir" ]; then
    warn "Prompt templates directory not found (${src_dir})"
    return 0
  fi

  mkdir -p "$dest_dir"

  local installed_any=false
  local skipped_any=false

  for src in "$src_dir"/*.md; do
    [ -e "$src" ] || continue
    local filename
    filename="$(basename "$src")"
    local dest="${dest_dir}/${filename}"
    if [ -f "$dest" ]; then
      info "Keeping existing prompt: ${dest}"
      skipped_any=true
      continue
    fi
    installed_any=true
    if $DRY_RUN; then
      echo "[dry-run] copy ${src} -> ${dest}"
    else
      run cp "$src" "$dest"
    fi
    ok "Installed prompt template: ${dest}"
  done

  if [ "$installed_any" = false ] && [ "$skipped_any" = false ]; then
    info "No prompt templates found to install"
  fi
}

maybe_install_prompt_templates() {
  if $SKIP_CONFIRMATION; then
    info "Skipping prompt template installation (non-interactive mode)"
    return 0
  fi

  local dest_dir="${HOME}/.codex/prompts"
  if confirm "Install prompt templates to ${dest_dir}? Existing files will be kept."; then
    install_prompt_templates
  else
    info "Skipping prompt template installation"
  fi
}

maybe_install_vscode_ext() {
  $NO_VSCODE && return 0
  if [ -z "$VSCE_ID" ]; then
    info "VS Code extension id not provided. Use: --vscode <publisher.extension>"
    return 0
  fi
  if ! need_cmd code; then
    warn "'code' (VS Code) not in PATH; skipping extension install"
    return 0
  fi

  if ! confirm "Install VS Code extension: ${VSCE_ID}?"; then
    info "Skipping VS Code extension installation"
    return 0
  fi

  info "Installing VS Code extension: ${VSCE_ID}"
  run code --install-extension "${VSCE_ID}" --force
  ok "VS Code extension '${VSCE_ID}' installed (or already present)"
}

maybe_write_agents() {
  if [ -z "${AGENTS_TARGET}" ]; then return 0; fi
  local path="${AGENTS_TARGET}"
  if [ -d "$path" ]; then path="${path%/}/AGENTS.md"; fi

  if ! confirm "Write starter AGENTS.md file to: ${path}?"; then
    info "Skipping AGENTS.md creation"
    return 0
  fi

  # If targeting global location, handle overwrite with backup like config
  if [ -f "$path" ]; then
    warn "${path} already exists"
    if confirm "Replace existing AGENTS.md with template? (existing will be backed up)"; then
      local backup="${path}.backup.$(date +%Y%m%d_%H%M%S)"
      run cp "$path" "$backup"
      info "Backed up existing AGENTS.md to: ${backup}"
    else
      info "Keeping existing AGENTS.md unchanged"
      return 0
    fi
  fi

  info "Writing starter AGENTS.md to: ${path}"
  if $DRY_RUN; then echo "[dry-run] write AGENTS.md to ${path}"; else
    local src="${ROOT_DIR}/templates/agent-templates/AGENTS-${AGENTS_TEMPLATE}.md"
    if [ ! -f "$src" ]; then
      warn "Unknown agents template '${AGENTS_TEMPLATE}', falling back to 'default'"
      src="${ROOT_DIR}/templates/agent-templates/AGENTS-default.md"
    fi
    run cp "$src" "$path"
    ok "Wrote AGENTS.md (template: ${AGENTS_TEMPLATE})"
  fi
}

main() {
  info "==> ${PROJECT} installer"
  info "Log: ${LOG_FILE}"

  ensure_node
  install_npm_globals
  ensure_tools
  configure_git
  configure_shell
  write_codex_config
  maybe_prompt_global_agents
  maybe_install_prompt_templates
  maybe_install_vscode_ext
  maybe_write_agents

  ok "All done. Open a new shell or 'source' your rc file to load aliases."
  info "Next steps:"
  info "  1) codex    # sign in; then ask it to plan a refactor"
  info "  2) ./bin/codex-1up agents --path $PWD   # write a starter AGENTS.md to your repo"
  info "  3) Review ~/.codex/config.toml (see: https://github.com/openai/codex/blob/main/docs/config.md)"
}

main "$@"
