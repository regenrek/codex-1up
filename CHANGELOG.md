# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.3.14] - 2026-01-22

### Added
- Installer: new flags and wizard prompts for Codex v0.88 config options:
  - `--web-search` (disabled|cached|live|skip)
  - `--file-opener` (cursor|vscode|vscode-insiders|windsurf|none|skip)
  - `--credentials-store` (auto|file|keyring|skip)
  - `--tui2` and `--alt-screen` (auto|always|never|skip)
  - `--experimental` (background-terminal, shell-snapshot, multi-agents, steering, collaboration-modes, child-agent-project-docs)
- Config: `codex-1up config trust --path <dir>` to mark a repo as trusted in `~/.codex/config.toml`.
- Config: `codex-1up config mcp set <name> ...` helper to add/update `[mcp_servers]` entries safely.
- Skills: when installing bundled skills, write `[[skills.config]]` entries to `~/.codex/config.toml` for discoverable enable/disable.
- Tests: validate `templates/codex-config.toml` keys against the upstream v0.88 schema whitelist to prevent drift.

### Changed
- Template defaults: set `web_search = "live"` by default and enable `sandbox_workspace_write.network_access = true` for web search compatibility.

### Fixed
- Template: fix `model_reasoning_summary` key typo and align reasoning visibility keys with upstream placement.

### Tests
- Increased overall test coverage to **>80%** to meet the release bar.

## [0.3.13] - 2026-01-21

### Fixed
- Homebrew: install `codex-1up` as a symlink to the package entrypoint so it can find `dist/` (avoids falling back to `tsx`).

## [0.3.12] - 2026-01-21

### Fixed
- Homebrew: ensure `codex-1up` is installed into Homebrew’s `bin` by explicitly installing the package’s bin entrypoint after `npm install`.
- CI: fix TypeScript typecheck failures in tests (CI runs `pnpm -C cli exec tsc --noEmit`).

## [0.3.11] - 2026-01-21

### Added
- Installer: on macOS, if Homebrew (`brew`) is missing, print clear install instructions (including `brew.sh`) and stop before tool installation fails later.

### Fixed
- Homebrew: fix generated formula to use `std_npm_args` (instead of `std_npm_install_args`) so `brew install regenrek/tap/codex-1up` works.

## [0.3.10] - 2026-01-21

### Changed
- Installer/template: default `model_reasoning_summary` is now `"detailed"` for `*-codex` models.
- Templates: refreshed `AGENTS-default.md` with concise operating rules (skills/prompts, security, git/PRs, coding style).
- Release docs: document test/coverage expectations before release.

### Fixed
- Installer: ensure GitHub CLI (`gh`) installs reliably on apt-based systems by setting up the official GitHub CLI apt repo when needed.
- Config patcher: normalize invalid `model_reasoning_summary` values for `*-codex` models (see [Codex changelog](https://developers.openai.com/codex/changelog)). Thanks to [@calinfaja](https://github.com/calinfaja) for the report ([#34](https://github.com/regenrek/codex-1up/issues/34)).

### Added
- Tests: additional coverage around config patching and installer behavior.

## [0.3.9] - 2026-01-21

### Fixed
- AGENTS template: correct `ast-grep` command for listing matching files.

## [0.3.8] - 2026-01-04

### Changed
- CI: improved Homebrew release workflow reliability (rerunnable, waits for npm tarball propagation, commits new formula files, uses GitHub App auth).
- Build/CI: moved pnpm-only config from `.npmrc` to `pnpm-workspace.yaml` to avoid npm warnings on unknown keys.

## [0.3.7] - 2026-01-03

### Changed
- Removed the `codex-1up skills remove` command to avoid destructive file deletion.
- Installer: default `--install-node` is now `skip`, and interactive runs confirm before downloading/running remote installer scripts.
- CI: tightened `pkg-pr-new` preview publishing (non-fork only, minimal permissions, pinned version) and fail PR checks when typecheck/tests/build fail.

### Fixed
- Avoid logging full Codex config contents during `--dry-run` and tighten installer log file/dir permissions.
- Updated `doctor` to report `web_search_request` from `[features]` / `[profiles.<name>.features]`.

## [0.3.6] - 2026-01-02

### Added
- New `codex-1up update` command to self-update the CLI.
- New `codex-1up tools` and `codex-1up skills` commands for managing tool installs and bundled Agent Skills.

### Changed
- Installer refactor: CLI commands call shared actions, and the interactive wizard now lives in its own flow module.
- Default Codex model is now `gpt-5.2-codex` in the unified config template and installer-written profiles.
- Migrate deprecated `enable_experimental_windows_sandbox` to `[features].experimental_windows_sandbox` when patching `~/.codex/config.toml`.
- Migrate deprecated root-level feature booleans (e.g. `experimental_use_unified_exec_tool`) into `[features]` when patching `~/.codex/config.toml`.

## [0.3.4] - 2025-12-11

### Changed
- Default Codex model is now `gpt-5.2` in the unified config template and installer-written profiles.
- Stop hardcoding `model_auto_compact_token_limit` by default (leave it optional) to avoid forcing premature compaction as Codex defaults evolve.
- Stop hardcoding `tool_output_token_limit` by default; let Codex use its model-appropriate default unless you explicitly need huge tool outputs in-context.
- Ensure `profiles.balanced.sandbox_workspace_write.network_access = true` is set by default so web search can work in workspace-write mode.
- Fix the release script README rewrite so images render correctly on npm.

## [0.3.3] - 2025-12-07

### Changed
- Notification sound configuration now lives entirely in `~/.codex/notify.sh`
  - Removed shell rc file manipulation (no more writes to `.bashrc`/`.zshrc`/`config.fish`)
  - Sound path is set directly via `DEFAULT_CODEX_SOUND` in `notify.sh`
  - Users can still override via `CODEX_CUSTOM_SOUND` env var if needed
  - Legacy `codex-1up` rc markers are left untouched; doctor surfaces them for manual cleanup

## [0.3.2] - 2025-11-25

### Fixed
- Fixed TypeScript type error in ensureTools.ts (redundant 'none' check after early return)

## [0.3.1] - 2025-11-25

### Fixed
- Fixed spinner blocking sudo password prompts and TTY input on Linux (#14)
  - Removed continuous spinner during installation that was overwriting terminal output
  - sudo password prompts, npm confirmations, and other TTY interactions now display correctly
  - Added clear status messages for each installation phase
  - Added warning about potential sudo password requirement before Linux package installations

## [0.3.0] - 2025-11-25

### Changed
- **Breaking:** Removed `minimal` profile - only `balanced`, `safe`, and `yolo` profiles remain
- Updated `yolo` profile:
  - Changed model to `gpt-5.1-codex-max` (was `gpt-5.1-codex`)
  - Added `model_auto_compact_token_limit = 233000` for optimized long sessions
  - Removed `model_verbosity` (not supported by gpt-5.1-codex models)
- Updated `safe` profile:
  - Changed `sandbox_mode` to `read-only` (was `workspace-write`) for maximum security
  - Added `model_reasoning_summary = "concise"`
- Updated `balanced` profile:
  - Added `model_reasoning_summary = "concise"`
- Streamlined profile selection UI (3 profiles instead of 4)

## [0.2.9] - 2025-01-27

### Changed
- Removed `model_reasoning_summary` and `model_verbosity` settings from the yolo profile configuration

## [0.2.8] - 2025-11-22

### Fixed
- Handled misconfigured pnpm so Codex CLI upgrades still run:
  - In `src/installers/installNpmGlobals.ts`, if `pnpm bin -g` is empty we now prompt (interactive) to fall back to npm or skip; in non-interactive/assume-yes modes we automatically fall back to npm and proceed with the upgrade. Keeps the Codex install path working instead of skipping.
  - `chooseNodePmForGlobal` (`src/installers/utils.ts`) now returns a structured choice with reasons, so callers can react to pnpm misconfig instead of silently giving up.
  - Applied the same safe fallback in `src/installers/ensureTools.ts` so other global installs (e.g., ast-grep) don't get stranded when pnpm is misconfigured.
  - Added coverage in `tests/install.pnpm.fallback.test.ts` for both interactive prompt and non-interactive fallback.

## [0.2.6] - 2025-11-21

### Added
- Added `--profiles-scope` option to install command for profile management (global vs local)
- Added GitHub Actions workflows for CI/CD (cli-test.yml, cli-pr.yml, pkg-pr-new.yml)
- Added `--no-vscode` flag to skip VS Code extension checks during installation

### Changed
- Enhanced package manager command handling: installer now transparently supports both root and non-root users on Linux
  - If running as root, package manager commands run directly (e.g., `apt-get`)
  - If not root, commands are prefixed with `sudo` (e.g., `sudo apt-get`)
  - If sudo fails, installer gracefully skips tool installations with a warning
- Improved error handling and user feedback for failed package installations
- Updated README to clarify Linux installation requirements and sudo behavior

### Fixed
- Package manager commands now handle privilege escalation correctly across all Linux package managers (apt, dnf, pacman, zypper)

## [0.2.5] - 2025-11-21

### Changed
- Enhanced AGENTS.md installation prompts with clear explanations of what it does and why it's useful
- Improved prompt messaging to clarify that AGENTS.md is optional and can be removed anytime
- Better option labels that explain what each choice does (append vs overwrite vs skip)

## [0.2.4] - 2025-11-21

### Changed
- Changed default model from `gpt-5.1-codex-max` to `gpt-5.1-codex` for all profiles and root default

## [0.2.3] - 2025-11-21

### Added
- Installer prompts for Codex CLI installation (`--codex-cli yes|no`) and a tools prompt for rg/fd/fzf/jq/yq/difftastic/ast-grep on macOS/Linux (`--tools yes|no`), with defaults that match the platform.
- Profile picker now shows brief per-profile summaries and hints to clarify approvals, sandbox, and web search behavior before selection.

### Changed
- Ast-grep installation is consolidated into the tools step (package manager first, npm fallback) and removed from the Codex CLI install path.
- Config/notify setup is skipped when Codex is absent and the user opted out of installing it, preventing writes that wouldn’t be usable.
- Codex install precedes config writes so new users get a working CLI before config patches apply.
- Simplified installer flags: `--profile` + `--profile-mode` replace the old profiles/reasoning flags; reasoning prompt removed since profiles carry defaults.
- Profile write prompt clarifies add/merge vs overwrite behavior for the selected profile table only.

### Fixed
- Tools prompt messaging no longer double-lists ast-grep when Codex CLI prompt is shown separately.

## [0.2.2] - 2025-11-21

### Changed
- Updated all profiles (balanced, safe, minimal, yolo) to use `gpt-5.1-codex-max` model with `medium` reasoning effort by default
- Enhanced `yolo` profile with high-performance settings:
  - `model_reasoning_summary = "detailed"`
  - `model_verbosity = "high"`
  - `tool_output_token_limit = 25000` (increased from default 2560)
- Updated root-level default model from `gpt-5` to `gpt-5.1-codex-max`

## [0.2.1] - 2025-11-18

### Fixed
- Version now correctly reads from `package.json` instead of hardcoded `0.1.0` in CLI help output.

## [0.2.0] - 2025-11-18

### Changed
- Installer respects PATH-first for Codex: skips installing `@openai/codex` when `codex` is already available on PATH.
- Global Node installs now honor the user's package manager without cross-installs:
  - Prefer pnpm (only when its global bin is configured).
  - Use npm when pnpm is not present.
  - Never use yarn global to avoid surprises.
- When pnpm is detected but its global bin is not configured, the installer skips global Node installs with a clear warning (suggests `pnpm setup`) instead of falling back and causing duplicates.

### Added
- `doctor` now prints all `codex` candidates found on PATH ("--- codex paths ---") to help diagnose duplicates.

## [0.1.5] - 2025-11-09

### Fixed
- Skip installing `@ast-grep/cli` via npm when `sg`/`ast-grep` binaries already exist on PATH (avoids npm EEXIST errors on Homebrew installs). (#8)

## [0.1.4] - 2025-11-09

### Added
- Key-level Codex config patcher replaces full-template overwrites. We now only touch `[tui]` reasoning/notification keys and the four codex profiles, with automatic backups and atomic writes.
- New installer flags: `--profiles add|overwrite|skip`, `--reasoning on|off`, and `--sound <path|none|skip>`, plus matching wizard prompts. These make it clear when codex-1up will edit a config and keep non-interactive flows predictable.
- Regression tests covering profile add/overwrite behavior, reasoning toggles, and notification enablement to ensure future changes stay non-destructive.
- Design doc `docs/03-new-config-changes.md` explaining the patching strategy for contributors.

### Changed
- Installer no longer asks about overwriting `config.toml` or switching active profiles; it always performs safe patches unless the user explicitly chooses “overwrite” for the codex profiles.
- Notification sounds now only force `tui.notifications = true` when it was previously false; custom notification lists remain untouched.

### Fixed
- Prevented `tui.notifications` from being clobbered when users already had array-based filters.
- Sound selection logic now honors CLI `--sound` inputs (including `skip`/`none`) even in non-interactive installs.

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
