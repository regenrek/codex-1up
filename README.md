# Codex CLI 1UP

![codex-1up banner](./public/banner.png)


**Codex 1UP** equips your Codex CLI coding agent with powerful tools.

- ✅ Installs/updates **Codex CLI** (`@openai/codex`)
- ✅ Adds fast shell power tools: `ast-grep`, `fd`, `ripgrep`, `rg`, `fzf`, `jq`, `yq`
- ✅ **AGENTS.md** template with tool selection guide
- ✅ Unified **Codex config** with multiple profiles: `balanced` / `safe` / `minimal` / `yolo`
- ✅ 🔊 **Notification sounds** with customizable audio alerts for Codex events

![Screenshot of Codex 1UP terminal interface](./public/example.png)

## Quick start

```bash
# Quick install (no global install needed)
npx -y codex-1up install
```

```bash
# Or install globally (recommended for repeated use)
npm install -g codex-1up
codex-1up install
```

### After installing

- Open a new terminal session (or source your shell rc)
- Run `codex` to sign in and start using the agent! 🎉

### What gets installed

| Component                 | Why it matters                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------- |
| **@openai/codex**         | The coding agent that can read, edit, and run your project locally.                     |
| **ast-grep**              | Syntax‑aware search/replace for safe, large‑scale refactors in TS/TSX.                  |
| **fd**                    | Fast file finder (gitignore‑aware).                                                     |
| **ripgrep (rg)**          | Fast text search across code.                                                           |
| **fzf**                   | Fuzzy‑finder to select among many matches.                                              |
| **jq** / **yq**           | Reliable JSON/YAML processing on the command line.                                      |
| **difftastic**            | Fast syntax‑aware diff tool for git.                                                   |
| **\~/.codex/config.toml** | Single template with multiple profiles. Active profile is chosen during install (default: `balanced`). See [Codex config reference](https://github.com/openai/codex/blob/main/docs/config.md). |
| **AGENTS.md**             | Minimal per‑repo rubric; installer can also create global `~/.codex/AGENTS.md`.         |
| **\~/.codex/notify.sh**   | Notification hook script with customizable sounds for Codex events (default: `noti_1.wav`). |


### Profiles

| Profile | Description |
| --- | --- |
| balanced (default) | Approvals on-request; workspace-write sandbox with network access inside workspace. |
| safe | Approvals on-failure; workspace-write sandbox; conservative. |
| minimal | Medium reasoning effort; web search off. |
| yolo | Never ask for approvals; danger-full-access (only trusted environments). |

Switch profiles anytime: `codex --profile <name>` for a session, or `codex-1up config set-profile <name>` to persist.

## Global guidance with AGENTS.md (optional)

**AGENTS.md** is an optional guidance file that tells Codex which tools to use for different tasks (e.g., `fd` for file finding, `ast-grep` for syntax-aware search, `jq` for JSON). A global `~/.codex/AGENTS.md` applies across all your projects, while per-repo `AGENTS.md` files can override it.

**What gets installed:** A template file with tool selection guidelines covering file operations, code search, data processing, and best practices for deterministic, reproducible commands.

**During install:** You'll be prompted to create `~/.codex/AGENTS.md`; you can skip this step. To create it later:

```bash
# Create the directory if needed and write the template there
mkdir -p ~/.codex
codex-1up agents --path ~/.codex
# This writes ~/.codex/AGENTS.md
```

See memory behavior with AGENTS.md in the official docs: [Memory with AGENTS.md](https://github.com/openai/codex/blob/main/docs/getting-started.md#memory-with-agentsmd).

## Doctor & Uninstall

```bash
./bin/codex-1up doctor
./bin/codex-1up uninstall
```

> **Note:** This project is **idempotent**—running it again will skip what’s already installed. It won’t remove packages on uninstall; it cleans up files under ~/.codex (backups are retained).

## Supported platforms

- macOS (Intel/Apple Silicon) via **Homebrew**
- Linux via **apt**, **dnf**, **pacman**, or **zypper**
- Windows users: use **WSL** (Ubuntu) and run the Linux path

### Common flags

- `--shell auto|zsh|bash|fish` : shell to configure aliases for
- `--vscode EXT_ID`        : install a VS Code extension (e.g. `openai.codex`)
- `--agents-md [PATH]`     : write a starter `AGENTS.md` to PATH (default: `$PWD/AGENTS.md`)
- `--no-vscode`            : skip VS Code extension checks
- `--install-node nvm|brew|skip` : how to install Node.js if missing (default: `nvm`)
- `--codex-cli yes|no`     : install/upgrade Codex CLI (default: `yes` on macOS/Linux)
- `--tools yes|no`        : install/upgrade tools: rg, fd, fzf, jq, yq, difftastic, ast-grep (default: `yes` on macOS/Linux)
- `--profile balanced|safe|minimal|yolo|skip` : profile to write (default: `balanced`)
- `--profile-mode add|overwrite` : profile merge strategy (default: `add`)

### Advanced / CI flags

- `--dry-run`              : print what would happen, change nothing
- `--skip-confirmation`    : suppress interactive prompts
- `--yes`                  : non-interactive, accept safe defaults (CI). Most users don't need this.

## Develop locally (from source)

For contributors and advanced users:

```bash
git clone https://github.com/regenrek/codex-1up
cd codex-1up

# Use the wrapper to run the same flow as the global CLI
./bin/codex-1up install

# Or run the CLI package directly in dev
cd cli && corepack enable && pnpm i && pnpm build
node ./bin/codex-1up.mjs install
```

## License

MIT — see [LICENSE](LICENSE).

## Links

- X/Twitter: [@kregenrek](https://x.com/kregenrek)
- Bluesky: [@kevinkern.dev](https://bsky.app/profile/kevinkern.dev)

## Courses
- Learn Cursor AI: [Ultimate Cursor Course](https://www.instructa.ai/en/cursor-ai)
- Learn to build software with AI: [AI Builder Hub](https://www.instructa.ai)

## See my other projects:

* [codefetch](https://github.com/regenrek/codefetch) - Turn code into Markdown for LLMs with one simple terminal command
* [instructa](https://github.com/orgs/instructa/repositories) - Instructa Projects
