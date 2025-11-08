#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.1"
PROJECT="codex-1up"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Try common locations to resolve repo root containing templates/
if [ -d "${SCRIPT_DIR}/templates" ]; then
  ROOT_DIR="${SCRIPT_DIR}"
elif [ -d "${SCRIPT_DIR}/../templates" ]; then
  ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
elif [ -d "./templates" ]; then
  ROOT_DIR="$(pwd)"
else
  ROOT_DIR="${SCRIPT_DIR}"
fi

DRY_RUN=false
ASSUME_YES=false
SKIP_CONFIRMATION=false
SHELL_TARGET="auto"
VSCE_ID=""
NO_VSCODE=false
INSTALL_NODE="nvm"
AGENTS_TARGET=""
AGENTS_TEMPLATE="default"
INSTALL_MODE="manual" # recommended|manual

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

  (Interactive by default — no flags needed for typical use)

  --yes                     non-interactive; accept safe defaults
  --dry-run                 print actions without making changes
  --skip-confirmation       skip user prompts for system changes
  --shell auto|zsh|bash|fish
  --vscode EXT_ID           install VS Code extension id (e.g. openai.codex)
  --no-vscode               skip VS Code extension checks
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
    local npm_output
    npm_output=$(npm ls -g "$pkg" --depth=0 --json 2>/dev/null || echo '{}')
    installed=$(echo "$npm_output" | node -e '
let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{
  try{const j=JSON.parse(s); const name=process.argv[1]; const dep=j.dependencies&&j.dependencies[name]; console.log(dep?dep.version:"");}
  catch{console.log("")}
});' "$pkg" 2>/dev/null || echo "")

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

_detect_rc() {
  local target="${SHELL_TARGET}"
  if [ "$target" = "auto" ]; then
    case "${SHELL:-}" in
      *zsh*) target="zsh" ;;
      *fish*) target="fish" ;;
      *) target="bash" ;;
    esac
  fi
  case "$target" in
    zsh)  echo "${HOME}/.zshrc" ;;
    fish) echo "${HOME}/.config/fish/config.fish" ;;
    *)    echo "${HOME}/.bashrc" ;;
  esac
}

_upsert_rc_block() {
  local rc_file="$1"; shift
  local content="$1"; shift || true
  mkdir -p "$(dirname "$rc_file")"
  if [ -f "$rc_file" ]; then
    # Remove existing block (if any)
    # shellcheck disable=SC2016
    sed -i.bak -e "/>>> ${PROJECT} >>>/,/<<< ${PROJECT} <</d" "$rc_file" || true
  fi
  {
    echo ">>> ${PROJECT} >>>"
    echo "$content"
    echo "<<< ${PROJECT} <<<"
  } >> "$rc_file"
}

_pick_player_quick() {
  if command -v afplay >/dev/null 2>&1; then echo "afplay"; return 0; fi
  if command -v paplay >/dev/null 2>&1; then echo "paplay"; return 0; fi
  if command -v aplay  >/dev/null 2>&1; then echo "aplay";  return 0; fi
  if command -v mpg123 >/dev/null 2>&1; then echo "mpg123"; return 0; fi
  if command -v ffplay >/dev/null 2>&1; then echo "ffplay -nodisp -autoexit"; return 0; fi
  echo ""
}

_preview_sound() {
  local path="$1"
  [ -f "$path" ] || { warn "File not found: $path"; return 1; }
  local player
  player=$(_pick_player_quick)
  if [ -z "$player" ]; then
    warn "No audio player found (afplay/paplay/aplay/mpg123/ffplay). Skipping preview."
    return 1
  fi
  info "Playing preview: ${path}"
  # shellcheck disable=SC2086
  $player "$path" >/dev/null 2>&1 < /dev/null &
}

maybe_setup_notification_sound() {
  local src_dir="${ROOT_DIR}/sounds"
  local target_dir="${HOME}/.codex/sounds"
  mkdir -p "$target_dir"

  # Recommended: set a sensible default (noti_1.wav) without prompting.
  if [ "${INSTALL_MODE}" = "recommended" ]; then
    local default_src="${src_dir}/noti_1.wav"
    if [ -f "$default_src" ]; then
      local dest="${target_dir}/noti_1.wav"
      if $DRY_RUN; then echo "[dry-run] cp $default_src $dest"; else run cp "$default_src" "$dest"; fi
      local rc="$(_detect_rc)"
      local block
      block=$(cat <<RC
# Notification sound (recommended default)
export CODEX_DISABLE_SOUND=0
export CODEX_CUSTOM_SOUND="${dest}"
RC
)
      info "Configuring default notification sound: noti_1.wav"
      if $DRY_RUN; then echo "[dry-run] update $rc"; else _upsert_rc_block "$rc" "$block"; fi
      ok "Default sound set. Open a new shell or source your rc to apply."
    else
      warn "Default sound not found at ${default_src}"
    fi
    # For recommended installs, we stop here.
    if $ASSUME_YES || $SKIP_CONFIRMATION; then return 0; fi
  fi

  # Non-interactive manual installs: skip prompts
  if $ASSUME_YES || $SKIP_CONFIRMATION; then
    return 0
  fi

  local -a files=()
  if [ -d "$src_dir" ]; then
    while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$src_dir" -type f \( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.aiff' -o -iname '*.m4a' \) -print0 | sort -z)
  fi

  echo ""
  info "Notification sound setup (optional)"
  echo "Choose a default sound, provide a custom path, or disable sounds."
  echo ""
  if [ ${#files[@]} -gt 0 ]; then
    echo "Bundled sounds:"
    local i=1
    for f in "${files[@]}"; do
      printf "  %d) %s\n" "$i" "$(basename "$f")"
      i=$((i+1))
    done
  else
    echo "No bundled sounds found in ${src_dir}"
  fi
  echo "  c) custom path"
  echo "  n) none (disable)"
  echo ""

  local sel_index=""
  local sel_path=""

  while :; do
    printf "Select [1-%d|c|n] (p=preview, ENTER=skip): " ${#files[@]}
    local choice=""
    read -r choice || choice=""

    case "$choice" in
      "") info "Skipping sound setup"; return 0 ;;
      p|P)
        if [ -n "$sel_path" ]; then _preview_sound "$sel_path"; else warn "Pick a sound first, then press 'p' to preview."; fi
        ;;
      n|N)
        local rc="$(_detect_rc)"
        local block
        block=$(cat <<'RC'
# Notification sound disabled
export CODEX_DISABLE_SOUND=1
unset CODEX_CUSTOM_SOUND
RC
)
        info "Disabling notification sounds (write to $(basename "$rc"))"
        if $DRY_RUN; then echo "[dry-run] update $rc"; else _upsert_rc_block "$rc" "$block"; fi
        ok "Sounds disabled. Open a new shell or source your rc to apply."
        return 0
        ;;
      c|C)
        printf "Enter absolute path to audio file: "
        local p=""
        read -r p || p=""
        if [ -z "$p" ]; then warn "Empty path"; continue; fi
        # Resolve to absolute path
        if [ "${p#/}" = "$p" ]; then p="$(pwd)/$p"; fi
        if [ ! -f "$p" ]; then warn "File not found: $p"; continue; fi
        sel_path="$p"
        echo "Selected custom: $sel_path"
        # Confirm
        while :; do
          printf "(p)review, (y) use this, (r)eselect: "
          local a=""
          read -r a || a=""
          case "$a" in
            p|P) _preview_sound "$sel_path" ;;
            r|R) break ;;
            y|Y)
              local rc="$(_detect_rc)"
              local block
              block=$(cat <<RC
# Notification sound
export CODEX_DISABLE_SOUND=0
export CODEX_CUSTOM_SOUND="${sel_path}"
RC
)
              info "Saving sound setting to $(basename "$rc")"
              if $DRY_RUN; then echo "[dry-run] update $rc"; else _upsert_rc_block "$rc" "$block"; fi
              ok "Set custom sound. Open a new shell or source your rc to apply."
              return 0
              ;;
            *) : ;;
          esac
        done
        ;;
      * )
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#files[@]} ]; then
          sel_index="$choice"
          sel_path="${files[$((sel_index-1))]}"
          echo "Selected: $(basename "$sel_path")"
          # Offer preview and confirm copy/install
          while :; do
            printf "(p)review, (y) use this, (r)eselect: "
            local a=""
            read -r a || a=""
            case "$a" in
              p|P) _preview_sound "$sel_path" ;;
              r|R) break ;;
              y|Y)
                local base
                base="$(basename "$sel_path")"
                local dest="${target_dir}/${base}"
                if $DRY_RUN; then echo "[dry-run] cp $sel_path $dest"; else run cp "$sel_path" "$dest"; fi
                local rc="$(_detect_rc)"
                local block
                block=$(cat <<RC
# Notification sound
export CODEX_DISABLE_SOUND=0
export CODEX_CUSTOM_SOUND="${dest}"
RC
)
                info "Saving sound setting to $(basename "$rc")"
                if $DRY_RUN; then echo "[dry-run] update $rc"; else _upsert_rc_block "$rc" "$block"; fi
                ok "Set sound to ${base}. Open a new shell or source your rc to apply."
                return 0
                ;;
              *) : ;;
            esac
          done
        else
          warn "Invalid choice"
        fi
        ;;
    esac
  done
}


_select_active_profile() {
  local cfg_path="$1"
  if $ASSUME_YES || $SKIP_CONFIRMATION; then
    info "Using default active profile: balanced"
    return 0
  fi
  echo ""
  info "Select active Codex profile (default: balanced):"
  echo "  1) balanced  - on-request approvals, workspace-write, web search on"
  echo "  2) safe      - on-failure approvals, workspace-write, web search off"
  echo "  3) minimal   - minimal reasoning, concise summaries, web search off"
  echo "  4) yolo      - never approve, danger-full-access (high risk)"
  printf "Choose [1-4] (default: 1): "
  local choice="1"
  read -r choice || choice="1"
  local name="balanced"
  case "$choice" in
    1|"balanced"|"BALANCED"|"") name="balanced" ;;
    2|"safe"|"SAFE") name="safe" ;;
    3|"minimal"|"MINIMAL") name="minimal" ;;
    4|"yolo"|"YOLO") name="yolo" ;;
    *) warn "Invalid choice; using balanced"; name="balanced" ;;
  esac
  info "Setting active profile to: ${name}"
  if $DRY_RUN; then
    echo "[dry-run] set profile = "${name}" in ${cfg_path}"
  else
    if grep -qE '^profile[[:space:]]*=' "$cfg_path"; then
      run sed -i.bak -E "s/^profile[[:space:]]*=[[:space:]]*".*"/profile = "${name}"/" "$cfg_path"
    else
      run sed -i.bak -e "1s;^;profile = "${name}"\n;" "$cfg_path"
    fi
  fi
}

write_codex_config() {
  local cfg="${HOME}/.codex/config.toml"
  local template_file="${ROOT_DIR}/templates/codex-config.toml"

  mkdir -p "${HOME}/.codex"

  if [ ! -f "$template_file" ]; then
    err "Unified config template missing at ${template_file}"
    return 1
  fi

  if [ ! -f "$cfg" ]; then
    info "Creating unified Codex config with multiple profiles at ${cfg}"
    if $DRY_RUN; then echo "[dry-run] cp $template_file $cfg"; else run cp "$template_file" "$cfg"; fi
    ok "Created ~/.codex/config.toml"
    _select_active_profile "$cfg"
    info "Tip: use 'codex --profile <name>' to switch at runtime or 'codex-1up config set-profile <name>' to persist."
    return 0
  fi

  warn "~/.codex/config.toml already exists"
  local auto_choice="${CODEX_1UP_OVERWRITE_CONFIG:-}"
  local parsed_auto=""
  if [ -n "$auto_choice" ]; then
    case "$auto_choice" in
      [Yy]*) parsed_auto="yes" ;;
      [Nn]*) parsed_auto="no" ;;
    esac
  fi

  if [ "$parsed_auto" = "no" ]; then
    info "Keeping existing config unchanged"
    return 0
  fi

  local confirmed="false"
  if [ "$parsed_auto" = "yes" ]; then
    confirmed="true"
  else
    if confirm "Backup and overwrite with the latest unified template?"; then
      confirmed="true"
    else
      info "Keeping existing config; you can manage profiles via the new CLI later."
      return 0
    fi
  fi

  if [ "$confirmed" = "true" ]; then
    local backup="${cfg}.backup.$(date +%Y%m%d_%H%M%S)"
    run cp "$cfg" "$backup"
    info "Backed up to ${backup}"
    if $DRY_RUN; then echo "[dry-run] cp $template_file $cfg"; else run cp "$template_file" "$cfg"; fi
    ok "Overwrote ~/.codex/config.toml with unified template"
    _select_active_profile "$cfg"
  fi
}

# Ensure ~/.codex/notify.sh exists (from template) and config enables it
ensure_notify_hook() {
  local notify_target="${HOME}/.codex/notify.sh"
  local template_src="${ROOT_DIR}/templates/notification.sh"
  mkdir -p "${HOME}/.codex"

  if [ ! -f "$template_src" ]; then
    warn "Notification template missing at ${template_src}; skipping notify hook install"
  else
    if [ -f "$notify_target" ]; then
      if ! $ASSUME_YES && ! $SKIP_CONFIRMATION; then
        read -r -p "Update ~/.codex/notify.sh from template? (backup will be created) [y/N] " ans || ans="n"
        if [[ "$ans" =~ ^[Yy]$ ]]; then
          cp "$notify_target" "${notify_target}.backup.$(date +%Y%m%d_%H%M%S)"
          run cp "$template_src" "$notify_target"
          run chmod +x "$notify_target"
          ok "Updated notify hook (backup created)"
        else
          info "Keeping existing notify hook"
        fi
      fi
    else
      run cp "$template_src" "$notify_target"
      run chmod +x "$notify_target"
      ok "Installed notify hook to ~/.codex/notify.sh"
    fi
  fi

  # Enable in config: notify = ["<path>"] and tui.notifications = true
  local cfg="${HOME}/.codex/config.toml"
  if [ -f "$cfg" ]; then
    # Ensure notify array contains our hook
    if grep -Eq '^\s*notify\s*=\s*\[' "$cfg"; then
      if ! grep -Fq "$notify_target" "$cfg"; then
        # Append into existing array (naive but safe for simple arrays)
        # shellcheck disable=SC2016
        perl -0777 -pe 's/^(\s*notify\s*=\s*\[)([^\]]*)\]/$1$2, "'"$notify_target"'"\]/ms if $1 && index($2, "'"$notify_target"'") == -1' -i "$cfg" || true
        ok "Added notify hook to config"
      fi
    else
      printf '\nnotify = ["%s"]\n' "$notify_target" >>"$cfg"
      ok "Enabled notify hook in config"
    fi

    # Ensure dotted key tui.notifications = true (preferred)
    if grep -Eq '^\s*tui\.notifications\s*=' "$cfg"; then
      sed -i.bak -E 's/^(\s*tui\.notifications\s*=\s*).*/\1true/' "$cfg" || true
    else
      printf 'tui.notifications = true\n' >>"$cfg"
    fi
    ok "Enabled tui.notifications in config"
  else
    warn "Config not found at ${cfg}; run again after config is created"
  fi
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

  if [ "${INSTALL_MODE}" = "recommended" ]; then
    if [ ! -f "$target_path" ]; then
      info "Writing global AGENTS.md to: ${target_path} (template: default)"
      run mkdir -p "${HOME}/.codex"
      run cp "${ROOT_DIR}/templates/agent-templates/AGENTS-default.md" "$target_path"
      ok "Wrote ${target_path}"
      return 0
    fi
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

  # Choose install mode on first install
  local first_cfg="${HOME}/.codex/config.toml"
  local first_agents="${HOME}/.codex/AGENTS.md"
  if ! $ASSUME_YES && ! $SKIP_CONFIRMATION; then
    if [ ! -f "$first_cfg" ] && [ ! -f "$first_agents" ]; then
      while :; do
        echo ""
        info "Choose install mode:"
        echo "  1) Recommended (most users) — sensible defaults; only asks on overwrite"
        echo "  2) Manual (advanced) — confirm each optional step"
        printf "Choose [1-2] (default: 1): "
        local mode_choice="1"
        read -r mode_choice || mode_choice="1"
        case "$mode_choice" in
          2|"manual"|"MANUAL") INSTALL_MODE="manual"; break ;;
          1|""|"recommended"|"RECOMMENDED"|*)
            INSTALL_MODE="recommended"
            echo ""
            info "Recommended will install and configure:"
            echo "  • Node.js (via nvm) if missing"
            echo "  • Global npm: @openai/codex, @ast-grep/cli (install/upgrade)"
            echo "  • Dev tools: fd/rg/fzf/jq/yq (+ difftastic if available)"
            echo "  • ~/.codex/config.toml from template"
            echo "  • ~/.codex/notify.sh and enable tui.notifications"
            echo "  • Default sound: noti_1.wav (copied to ~/.codex/sounds)"
            echo "  • Global AGENTS.md (default template) if not present"
            [ -n "$VSCE_ID" ] && echo "  • VS Code extension: $VSCE_ID"
            printf "Type 'yes' to continue with Recommended, anything else to reselect: "
            local confirm_reco=""
            read -r confirm_reco || confirm_reco=""
            if [ "$confirm_reco" = "yes" ]; then
              break
            else
              info "Okay, let's choose again."
              continue
            fi
            ;;
        esac
      done
    fi
  fi

  ensure_node
  install_npm_globals
  ensure_tools
  write_codex_config
  ensure_notify_hook
  maybe_setup_notification_sound
  maybe_prompt_global_agents
  maybe_install_vscode_ext
  maybe_write_agents

  ok "All done. Open a new shell or 'source' your rc file to load aliases."
  info "Next steps:"
  info "  1) codex    # sign in; then ask it to plan a refactor"
  info "  2) ./bin/codex-1up agents --path $PWD   # write a starter AGENTS.md to your repo"
  info "  3) Review ~/.codex/config.toml (see: https://github.com/openai/codex/blob/main/docs/config.md)"
}

main "$@"
