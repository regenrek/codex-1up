# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2025-11-09

### Added
- Interactive installer improvements (wizard is default in TTY):
  - Overwrite config prompt first (default Yes), then profile selection.
  - Notification sound picker with preview and options:
    - Skip (leave current setup), None (disable sounds), noti_1–noti_5, Custom path…
    - Custom accepts .wav/.mp3/.ogg and validates the absolute path exists.
  - Preview uses the first available player (afplay/paplay/aplay/mpg123/ffplay).
- Reasoning steps visible by default in generated config:
  - `[tui].show_raw_agent_reasoning = true`
  - `[tui].hide_agent_reasoning = false`

### Changed
- Simplified wizard (removed “Recommended” vs “Manual” step); `mode` is now always `manual` internally.
- Template tweaks:
  - `[features]` now starts with `web_search_request = true` for better defaults.
  - Removed unsupported `model_reasoning_summary = "concise"` from the `minimal` profile.
  - AGENTS template (`templates/agent-templates/AGENTS-default.md`): clarified `fd` usage
    - Print absolute paths: `fd -p '<pattern>'`
    - Match against full path: `fd --full-path '<pattern>'`
    - Keep selections deterministic (prefer `--filter` + `head` over interactive TUIs)

### Fixed
- Config normalization for notifications:
  - Ensures a single root `notify = ["~/.codex/notify.sh"]` and `[tui].notifications = true`.
  - Removes stray root `notifications = …` and any misplaced keys under `profiles.*.features` that caused
    `invalid type: sequence, expected a boolean`.
- Sound application reliability:
  - Patches `~/.codex/notify.sh` `DEFAULT_CODEX_SOUND` to the chosen file (or clears it when `None`) so
    sounds work immediately before reloading the shell rc.

### Packaging
- Confirmed `templates/` and `sounds/` are included in the published package; installer now locates the
  runtime root by walking upward until it finds `templates/codex-config.toml` (works from `dist/` installs).

### Tests
- Expanded suite (18+ tests) covering wizard flow, non‑interactive defaults, CLI arg mapping, config
  normalization, bundled/custom sounds (including MP3/OGG), notify.sh patching, template write/switch, and
  reasoning flags.

## [0.1.2] - 2025-11-08

### Fixed
- Package now includes bundled notification sounds (`sounds/`).
  - Added `"sounds"` to `cli/package.json#files`.
  - Release script copies `sounds/` into the package during publish.
- Robust template root detection in CLI commands (`install`, `config`, `agents`, `doctor`, `uninstall`):
  - `findRoot` now walks upward from the command file directory until it finds `templates/codex-config.toml`, ensuring reliable paths from both dev (`src/`) and installed (`dist/`) layouts.

### Changed
- Release packaging now injects `README.md` and `LICENSE` into the package and cleans ephemeral copies after publish.

## [0.1]

### Added
- Interactive config profile selection when creating `~/.codex/config.toml`:
  - `SAFE` — most restrictive, prompts on failures
  - `DEFAULT` — balanced (recommended)
  - `YOLO` — full access, never asks (double‑confirmation with clear warnings)
  - `NO CHANGES` — do not create/modify config
- Consent prompts before any permanent system changes:
  - Git configuration (difftool/pager) — optional
  - Shell aliases — shows exact aliases before applying
  - Config creation — profile picked by user; backups on overwrite
- `--skip-confirmation` flag for fully non‑interactive installs.

### Changed
- Git difftool setup is now robust across environments:
  - Skip entirely if `git` is not installed
  - Safer command execution (no `eval`), correct quoting of `$LOCAL/$REMOTE`
- Aliases: removed `tsgate`; only `cx` and `cxdiff` are installed (optional).
- Config generation now uses template profiles under `templates/configs/`.

### Fixed
- Crash during git difftool setup caused by expansion of `$LOCAL`/`$REMOTE`.
- Project root detection when calling installer via wrapper.


## [0.2] - 2025-09-09

### Added
- Installer now prints a link to the Codex config reference after creating `~/.codex/config.toml`: `https://github.com/openai/codex/blob/main/docs/config.md`.
- Installer prompts to create a global `~/.codex/AGENTS.md` (with backup if it exists).
- AGENTS templates: four variants under `templates/agent-templates/`: `AGENTS-default.md`, `AGENTS-typescript.md`, `AGENTS-python.md`, `AGENTS-shell.md`.
- CLI `bin/codex-1up agents` now accepts `--template default|typescript|python|shell`.
- Installer supports `--agents-template` to choose which template to write for both local and global `AGENTS.md`.

### Docs
- README: Added Codex config reference link in the install table and in the Config profiles section, pointing to `https://github.com/openai/codex/blob/main/docs/config.md`.
 - README: Added "Global guidance with AGENTS.md" section with link to [Memory with AGENTS.md](https://github.com/openai/codex/blob/main/docs/getting-started.md#memory-with-agentsmd).
 - README: Added "Upgrade" section with steps to update and re-run installer.
 - README: Documented AGENTS template selection flags and listed available templates.

### Changed
- Config flow: choose profile first, then confirm overwrite (with backup).
- NPM globals install flow now checks installed vs latest and only installs when needed.


## [0.3] - 2025-09-09

### Added
- Interactive global `AGENTS.md` flow in installer:
  - Asks whether to create `~/.codex/AGENTS.md` and to choose a template: 1) default, 2) typescript, 3) python, 4) shell, 5) none.
  - If the file exists, prompts to overwrite and creates a timestamped backup.
- `bin/codex-1up agents` now prompts for a template if `--template` is not provided, and asks before overwriting an existing destination (with backup).

### Docs
- No README changes needed; templates and flags are already documented.


## [0.4] - 2025-11-08

### Breaking/Behavioral Changes
- Single unified Codex config template: `templates/codex-config.toml` now defines multiple profiles (`balanced`, `safe`, `minimal`, `yolo`). Legacy per-profile files under `templates/configs/` were removed.
- Web search config migrated to `features.web_search_request`; removed legacy `[tools].web_search` from templates.

### Added
- New citty-based Node CLI (published as `codex-1up`):
  - Subcommands: `install`, `agents`, `doctor`, `uninstall`, `config (init|profiles|set-profile)`.
  - Post-install summary of config path, active profile, available profiles, and detected tools.
- Installer now asks for the active profile after creating/overwriting `~/.codex/config.toml` (default: `balanced`). Non‑interactive modes keep `balanced` automatically.
- Vitest test suite for CLI commands, config write/switch, agents writer, and spawn paths.
- NPM package scaffolding for global install: `npm i -g codex-1up`.
- Release script adapted for single-package publish: `scripts/release.ts` bumps, builds, copies assets, publishes `cli/`.

### Changed
- `bin/codex-1up` now boots the Node CLI (loads `cli/dist/main.js`, falls back to tsx in dev).
- AGENTS templates updated to avoid interactive TUIs by default:
  - Replaced “pipe to fzf” with deterministic selections (e.g., `head -n 1`, `--filter`).
  - Clarified `fd` usage: `-p` prints absolute paths, `--full-path` matches on full path.
- README quick start includes global install instructions.

### Removed
- Legacy profile selection flow in the installer and unused per-profile config templates.

### Notes
- This release focuses on “do it right”: clean profiles, no shims, reproducible non‑interactive defaults.
