# AGENTS.md — Tool Selection

When you need to call tools from the shell, use this rubric:

## File Operations 
- Include hidden and VCS-ignored files by default using fd `-H --no-ignore-vcs` flags
- Follow symlinks by default using fd `-L` flag
- Find files by file name: `fd -H --no-ignore-vcs -L`
- Find files with path name: `fd -H --no-ignore-vcs -L -p <file-path>`
- List files in a directory: `fd -H --no-ignore-vcs -L . <directory>`
- Find files with extension and pattern: `fd -H --no-ignore-vcs -L -e <extension> <pattern>`

## Structured Code Search

- Include hidden, dotfiles, and VCS-ignored files by default using ast-grep `--no-ignore hidden --no-ignore dot --no-ignore vcs` flags
- Follow symlinks by default using ast-grep `--follow` flag
- Find code structure: `ast-grep --no-ignore hidden --no-ignore dot --no-ignore vcs --follow --lang <language> -p '<pattern>'`
- List matching files: `ast-grep --no-ignore hidden --no-ignore dot --no-ignore vcs --follow -l --lang <language> -p '<pattern>' | head -n 10`
- Prefer `ast-grep` over `rg`/`grep` when you need syntax-aware matching

## Data Processing
- JSON: `jq`
- YAML/XML: `yq`

## Selection
- Select from multiple results deterministically (non-interactive filtering)
- Fuzzy finder: `fzf --filter 'term' | head -n 1`

## Guidelines
- Prefer deterministic, non-interactive commands (`head`, `--filter`, `--json` + `jq`) so runs are reproducible
