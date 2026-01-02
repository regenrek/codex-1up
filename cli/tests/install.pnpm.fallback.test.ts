import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InstallerContext } from '../src/installers/types.js'
import { installNpmGlobals } from '../src/installers/installNpmGlobals.js'
import { runCommand, needCmd } from '../src/installers/utils.js'
import { resolveNodeGlobalPm } from '../src/installers/nodeGlobal.js'
import * as prompts from '@clack/prompts'

// Mock zx calls used inside installNpmGlobals
vi.mock('zx', () => {
  const mock$ = vi.fn((strings: TemplateStringsArray, ...expr: unknown[]) => {
    const cmd = strings.reduce((acc, cur, idx) => acc + cur + (expr[idx] ?? ''), '')
    if (cmd.startsWith('npm view')) {
      return { stdout: '0.63.0\n', quiet() { return this }, nothrow() { return this } }
    }
    if (cmd.startsWith('npm ls -g')) {
      const payload = {
        dependencies: {
          '@openai/codex': { version: '0.61.0' }
        }
      }
      return { stdout: JSON.stringify(payload), quiet() { return this }, nothrow() { return this } }
    }
    return { stdout: '', quiet() { return this }, nothrow() { return this } }
  })
  return { $: mock$ }
})

// Mock utils to control package manager detection and command execution
vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    runCommand: vi.fn(async () => {}),
    needCmd: vi.fn(async () => true)
  }
})

vi.mock('../src/installers/nodeGlobal.js', () => ({
  resolveNodeGlobalPm: vi.fn(async () => 'npm')
}))

// Mock prompts to drive interactive choices
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => true),
  select: vi.fn(async () => 'npm'),
  isCancel: (v: unknown) => v === Symbol.for('cancel')
}))

function createCtx(overrides: Partial<InstallerContext['options']> = {}): InstallerContext {
  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    ok: vi.fn(),
    warn: vi.fn(),
    err: vi.fn()
  }

  return {
    cwd: '/tmp',
    homeDir: '/tmp',
    rootDir: '/tmp',
    logDir: '/tmp',
    logFile: '/tmp/log',
    logger,
    options: {
      profile: 'balanced',
      profileScope: 'single',
      profileMode: 'add',
      setDefaultProfile: true,
      installTools: 'all',
      toolsSelected: undefined,
      installCodexCli: 'yes',
      notify: undefined,
      globalAgents: undefined,
      notificationSound: undefined,
      skills: 'skip',
      skillsSelected: undefined,
      mode: 'manual',
      installNode: 'skip',
      shell: 'zsh',
      vscodeId: undefined,
      noVscode: false,
      agentsMd: undefined,
      dryRun: false,
      assumeYes: false,
      skipConfirmation: false,
      ...overrides
    }
  }
}

describe('installNpmGlobals pnpm fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prompts to update when Codex is installed and newer version is available', async () => {
    const ctx = createCtx({ installCodexCli: 'auto' as const })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await installNpmGlobals(ctx)

    expect(prompts.confirm).toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', '@openai/codex@0.63.0'], expect.any(Object))
  })

  it('prompts to install when Codex is not found', async () => {
    const ctx = createCtx({ installCodexCli: 'auto' as const })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const needCmdMock = vi.mocked(needCmd)
    needCmdMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    await installNpmGlobals(ctx)

    expect(prompts.confirm).toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', '@openai/codex@0.63.0'], expect.any(Object))
  })

  it('prompts and falls back to npm when pnpm is misconfigured', async () => {
    const ctx = createCtx()
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await installNpmGlobals(ctx)

    expect(resolveNodeGlobalPm).toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', '@openai/codex@0.63.0'], expect.any(Object))
  })

  it('auto-falls back to npm without prompting in non-interactive mode', async () => {
    const ctx = createCtx({ assumeYes: true, skipConfirmation: true })
    await installNpmGlobals(ctx)

    expect(prompts.select).not.toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', '@openai/codex@0.63.0'], expect.any(Object))
  })
})
