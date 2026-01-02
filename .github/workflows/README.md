# GitHub Actions Workflows

This directory contains CI/CD workflows for the codex-1up project.

## CLI Workflows

### cli-test.yml
Main test workflow for the CLI package that runs on:
- Push to main/develop branches
- Pull requests to main/develop branches

**Features:**
- Matrix testing across OS (Ubuntu, macOS, Windows) and Node versions (18, 20, 22)
- Type checking with TypeScript
- Unit tests with coverage reporting
- Build validation
- Coverage upload to Codecov

### cli-pr.yml
Lightweight PR checks that run on all CLI-related pull requests.

**Features:**
- Quick validation (type check, test, build)
- Runs only on Ubuntu with Node 20
- Comments PR with test results summary
- Faster feedback for contributors

### pkg-pr-new.yml
Publishes preview packages for pull requests using `pkg-pr-new`.

**Features:**
- Builds the CLI package
- Publishes preview version for testing

## Workflow Configuration

All CLI workflows are triggered only when changes are made to:
- `cli/**` - CLI source and test files
- `.github/workflows/cli-*.yml` - Workflow files themselves
- `pnpm-lock.yaml` - Dependencies

This ensures CI runs only when relevant changes are made.

## Release Workflows

### npm-release.yml
Publishes the CLI to npm using Trusted Publishing (OIDC) when a GitHub Release is published.

**Features:**
- Builds and publishes `codex-1up` without storing npm tokens
- Handles prerelease tags with `next`

### homebrew-release.yml
Updates the Homebrew tap when a GitHub Release is published.
