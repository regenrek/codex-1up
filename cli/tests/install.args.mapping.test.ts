import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { installCommand } from '../src/commands/install'
import { buildRawArgsFromFlags } from './test-utils'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-args`)
const CH = resolve(td, '.codex')

const captured: any[] = []
vi.mock('../src/installers/main.js', () => ({
  runInstaller: vi.fn(async (opts: any) => { captured.push(opts) })
}))

beforeAll(async () => { process.env.HOME = td; await fs.mkdir(CH, { recursive: true }) })
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('install args mapping', () => {
  it('maps common flags to installer options', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      'dry-run': true,
      'install-node': 'brew',
      shell: 'zsh',
      vscode: 'openai.codex',
      'agents-md': '/tmp/AGENTS.md'
    }) })
    const opts = captured.pop()
    expect(opts.installNode).toBe('brew')
    expect(opts.shell).toBe('zsh')
    expect(opts.vscodeId).toBe('openai.codex')
    expect(opts.noVscode).toBe(false)
    expect(opts.agentsMd).toBe('/tmp/AGENTS.md')
    expect(opts.dryRun).toBe(true)
    expect(opts.assumeYes).toBe(true)
    expect(opts.skipConfirmation).toBe(true)
  })

  it('honors --no-vscode over --vscode id', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      'no-vscode': true,
      vscode: 'openai.codex'
    }) })
    const opts = captured.pop()
    expect(opts.noVscode).toBe(true)
    // vscodeId may be present in args but should not be used when noVscode true; we only assert flag
  })

  it('maps --skills=all', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      skills: 'all'
    }) })
    const opts = captured.pop()
    expect(opts.skills).toBe('all')
    expect(opts.skillsSelected).toBeUndefined()
  })

  it('maps --skills=none to skip', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      skills: 'none'
    }) })
    const opts = captured.pop()
    expect(opts.skills).toBe('skip')
    expect(opts.skillsSelected).toBeUndefined()
  })

  it('maps --skills=<name> to selection', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      skills: 'debug-lldb'
    }) })
    const opts = captured.pop()
    expect(opts.skills).toBe('select')
    expect(opts.skillsSelected).toEqual(['debug-lldb'])
  })

  it('rejects unknown --skills names', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await expect(
      runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
        yes: true,
        'skip-confirmation': true,
        skills: 'does-not-exist'
      }) })
    ).rejects.toThrow(/Unknown skill/)
  })

  it('maps --tools list to selection', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      tools: 'rg,fd'
    }) })
    const opts = captured.pop()
    expect(opts.installTools).toBe('select')
    expect(opts.toolsSelected).toEqual(['rg', 'fd'])
  })

  it('maps v0.88 config flags (web search, opener, credential store, tui)', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      'dry-run': true,
      profile: 'yolo',
      'profiles-scope': 'single',
      'profile-mode': 'add',
      'web-search': 'live',
      'file-opener': 'cursor',
      'credentials-store': 'auto',
      tui2: true,
      'alt-screen': 'never'
    }) })
    const opts = captured.pop()
    expect(opts.webSearch).toBe('live')
    expect(opts.fileOpener).toBe('cursor')
    expect(opts.credentialsStore).toBe('auto')
    expect(opts.enableTui2).toBe(true)
    expect(opts.tuiAlternateScreen).toBe('never')
  })

  it('maps experimental feature list', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
      yes: true,
      'skip-confirmation': true,
      'dry-run': true,
      experimental: 'background-terminal,shell-snapshot,multi-agents,steering,collaboration-modes,child-agent-project-docs'
    }) })
    const opts = captured.pop()
    expect(opts.experimentalFeatures).toEqual([
      'background-terminal',
      'shell-snapshot',
      'multi-agents',
      'steering',
      'collaboration-modes',
      'child-agent-project-docs'
    ])
  })

  it('rejects unknown experimental feature', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await expect(
      runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({
        yes: true,
        'skip-confirmation': true,
        'dry-run': true,
        experimental: 'nope'
      }) })
    ).rejects.toThrow(/Unknown --experimental feature/i)
  })
})
