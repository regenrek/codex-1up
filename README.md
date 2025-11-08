# Codex CLI 1UP

![codex-1up banner](./public/banner.png)


**Codex 1UP** equips your Codex CLI coding agent with powerful tools.

- ✅ Installs **Codex CLI** (`@openai/codex`)
- ✅ Adds **AST‑aware refactor tools**: `ast-grep`
- ✅ Adds fast shell power tools: `fd`, `ripgrep`, `rg`, `fzf`, `jq`, `yq`
- ✅ 4x **AGENTS.md** Templates: `generic` / `typescript` / `python` / `shell`
- ✅ Unified **Codex config** with multiple profiles: `balanced` / `safe` / `minimal` / `yolo`
- ✅ **semantic diffs** with `difftastic`


> Note: codex-1up does not modify your shell configuration. It installs the Codex CLI and supporting tools, and only writes to `~/.codex/` (with backups on overwrite). Tested on macOS (Homebrew) and Linux; other environments may vary.

> &nbsp;
> **Why use this?**  
> - **AST‑grep** for precise, structure‑aware refactors (no brittle grep)  
> - **difftastic** for human‑readable diffs of AI changes  
> - **web search ON** by default so the agent can look things up when needed  
> - A **clear AGENTS.md rubric** so the agent consistently chooses `fd/rg/ast-grep/fzf/jq/yq` correctly
> &nbsp;

## Quick start

```bash
# Install globally (recommended)
npm install -g codex-1up
codex-1up install
```

### Common flags

- `--shell auto|zsh|bash|fish`
- `--vscode EXT_ID`        : install a VS Code extension (e.g. `openai.codex`)
- `--agents-md [PATH]`     : write a starter `AGENTS.md` to PATH (default: `$PWD/AGENTS.md`)
- `--agents-template T`    : choose `AGENTS.md` template: `default|typescript|python|shell` (default: `default`)
- `--no-vscode`            : skip VS Code extension checks
- `--install-node nvm|brew|skip` : how to install Node.js if missing (default: `nvm`)

### Advanced / CI flags

- `--dry-run`              : print what would happen, change nothing
- `--skip-confirmation`    : suppress interactive prompts
- `--yes`                  : non-interactive, accept safe defaults (CI). Most users don’t need this.

### What gets installed

| Component                 | Why it matters                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------- |
| **@openai/codex**         | The coding agent that can read, edit, and run your project locally.                     |
| **ast-grep**              | Syntax‑aware search/replace for safe, large‑scale refactors in TS/TSX.                  |
| **fd**                    | Fast file finder (gitignore‑aware).                                                     |
| **ripgrep (rg)**          | Fast text search across code.                                                           |
| **fzf**                   | Fuzzy‑finder to select among many matches.                                              |
| **jq** / **yq**           | Reliable JSON/YAML processing on the command line.                                      |
| —                         | —                                                                                       |
| **\~/.codex/config.toml** | Single template with multiple profiles. Active profile is chosen during install (default: `balanced`). See [Codex config reference](https://github.com/openai/codex/blob/main/docs/config.md). |
| **AGENTS.md**             | Minimal per‑repo rubric; installer can also create global `~/.codex/AGENTS.md`.         |


# Templates available:

| Template   | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| default    | Generic rubric (works for most repos)                         |
| typescript | TS/TSX‑focused rubric with ast-grep examples                  |
| python     | Python‑focused rubric and tooling notes (ruff, mypy, pytest)  |
| shell      | Shell/Bash‑focused rubric with shellcheck/shfmt/bats tips     |


### Profiles

The installer writes one unified `~/.codex/config.toml` and asks which profile to activate (default: `balanced`). You can switch later.

- balanced (default): approvals on-request; sandbox workspace-write; modern defaults.
- safe: approvals on-failure; sandbox workspace-write; conservative.
- minimal: reduced reasoning verbosity; focused.
- yolo: no approvals; danger-full-access; for trusted/dev containers only.

Switching profiles
- Temporary for a session: `codex --profile <name>`
- Persist default: `codex-1up config set-profile <name>`
- List available profiles: `codex-1up config profiles`

For advanced options, see the [Codex config reference](https://github.com/openai/codex/blob/main/docs/config.md).

### After installing


- Open a new terminal session (or source your shell rc)
- Run `codex` to sign in and start using the agent
- In any repo, run `codex` and try: *"Plan a refactor for X; then apply and run tests."*

Recommended next step:

```bash
./bin/codex-1up agents --path /path/to/your/repo --template default
# writes AGENTS.md using the selected template (default|typescript|python|shell)
```

## `AGENTS.md` in your repo

You can generate a starter file:

```bash
./bin/codex-1up agents --path /path/to/your/repo --template default
# or during install
./install.sh --agents-md --agents-template default  # writes to $PWD/AGENTS.md using selected template
```

## Global guidance with AGENTS.md (optional)

You can keep a global guidance file at `~/.codex/AGENTS.md` that Codex will use across projects. During install, you’ll be prompted to create this; if you skip, you can create it later:

```bash
# Create the directory if needed and write the template there
mkdir -p ~/.codex
./bin/codex-1up agents --path ~/.codex
# This writes ~/.codex/AGENTS.md
```

See memory behavior with AGENTS.md in the official docs: [Memory with AGENTS.md](https://github.com/openai/codex/blob/main/docs/getting-started.md#memory-with-agentsmd).

### Notes
- Global npm packages (`@openai/codex`, `@ast-grep/cli`) are checked and only missing/outdated versions are installed.

## Upgrade

To upgrade codex-1up to the latest version:

```bash
cd /path/to/codex-1up
git pull --ff-only
./bin/codex-1up install --yes  # add --skip-confirmation to suppress prompts
```

Then open a new shell to ensure any PATH changes from your package manager are applied.

## Doctor & Uninstall

```bash
./bin/codex-1up doctor
./bin/codex-1up uninstall
```

> **Note:** This project is **idempotent**—running it again will skip what’s already installed. It won’t remove packages on uninstall; it cleans up shell aliases and git config it created.

## Supported platforms

- macOS (Intel/Apple Silicon) via **Homebrew**
- Linux via **apt**, **dnf**, **pacman**, or **zypper**
- Windows users: use **WSL** (Ubuntu) and run the Linux path

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