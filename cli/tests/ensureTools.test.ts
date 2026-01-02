import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InstallerContext } from '../src/installers/types.js'
import { ensureTools } from '../src/installers/ensureTools.js'
import { runCommand, detectPackageManager, needCmd } from '../src/installers/utils.js'

vi.mock('../src/installers/tooling.js', () => ({
  listTools: () => ([
    {
      id: 'rg',
      label: 'rg',
      bins: ['rg'],
      packages: { brew: ['ripgrep'] }
    }
  ])
}))

vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    runCommand: vi.fn(async () => {}),
    detectPackageManager: vi.fn(async () => 'brew'),
    needCmd: vi.fn(async () => true)
  }
})

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
      installCodexCli: 'no',
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
      dryRun: true,
      assumeYes: false,
      skipConfirmation: false,
      ...overrides
    }
  }
}

describe('ensureTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs tools via brew in dry-run mode', async () => {
    const ctx = createCtx()
    await ensureTools(ctx)

    expect(detectPackageManager).toHaveBeenCalled()
    expect(runCommand).toHaveBeenCalledWith('brew', ['update'], expect.any(Object))
    expect(runCommand).toHaveBeenCalledWith('brew', ['install', 'ripgrep'], expect.any(Object))
    expect(needCmd).toHaveBeenCalled()
  })
})
