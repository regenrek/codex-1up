import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types.js'

// Cover the non-dry-run Homebrew install path without executing network calls.
vi.mock('os', async () => {
  const actual = await vi.importActual<any>('os')
  return {
    ...actual,
    platform: () => 'darwin',
    arch: () => 'arm64'
  }
})

vi.mock('fs-extra', () => {
  return {
    default: {
      pathExists: vi.fn(async (p: string) => p === '/opt/homebrew/bin/brew')
    }
  }
})

vi.mock('zx', () => {
  return {
    $: vi.fn()
  }
})

vi.mock('../src/installers/utils.js', () => {
  return {
    needCmd: vi.fn(),
    runCommand: vi.fn(async () => undefined)
  }
})

describe('installers/ensureNode (extra coverage)', () => {
  const logger: Logger = { log: vi.fn(), info: vi.fn(), ok: vi.fn(), warn: vi.fn(), err: vi.fn() }

  function baseOptions(overrides: Partial<InstallerOptions> = {}): InstallerOptions {
    return {
      profile: 'skip',
      profileScope: 'single',
      profileMode: 'add',
      setDefaultProfile: false,
      profilesSelected: undefined,
      installTools: 'skip',
      toolsSelected: undefined,
      installCodexCli: 'no',
      notify: 'no',
      globalAgents: 'skip',
      notificationSound: undefined,
      skills: 'skip',
      skillsSelected: undefined,
      installNode: 'brew',
      shell: 'auto',
      vscodeId: undefined,
      noVscode: true,
      agentsMd: undefined,
      dryRun: false,
      assumeYes: true,
      skipConfirmation: true,
      mode: 'manual',
      ...overrides
    }
  }

  function makeCtx(overrides: Partial<InstallerOptions> = {}): InstallerContext {
    return {
      cwd: '/tmp',
      homeDir: '/tmp/home',
      rootDir: '/tmp/root',
      logDir: '/tmp/log',
      logFile: '/tmp/log/install.log',
      logger,
      options: baseOptions(overrides)
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('runs Homebrew install flow and adjusts PATH via shellenv', async () => {
    const zx = await import('zx')
    const dollar = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollar
      // Homebrew installer
      .mockResolvedValueOnce({ stdout: '' })
      // brew shellenv
      .mockResolvedValueOnce({ stdout: 'export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:${PATH}";\n' })
      // node -v after install
      .mockResolvedValueOnce({ stdout: 'v20.0.0\n' })

    const utils = await import('../src/installers/utils.js')
    const needCmd = utils.needCmd as unknown as ReturnType<typeof vi.fn>
    const runCommand = utils.runCommand as unknown as ReturnType<typeof vi.fn>

    // node/npm missing initially; brew missing; node present after install.
    let nodeChecks = 0
    needCmd.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') return (++nodeChecks) > 1
      if (cmd === 'npm') return false
      if (cmd === 'brew') return false
      return false
    })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    const ctx = makeCtx({ installNode: 'brew', dryRun: false })
    await ensureNode(ctx)

    expect(runCommand).toHaveBeenCalledWith('brew', ['install', 'node'], expect.anything())
    expect(process.env.PATH || '').toContain('/opt/homebrew/bin')
    expect(logger.ok).toHaveBeenCalledWith('Node.js installed (v20.0.0)')
  })

  it('throws if node is still missing after attempted install', async () => {
    const zx = await import('zx')
    const dollar = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollar.mockResolvedValue({ stdout: '' })

    const utils = await import('../src/installers/utils.js')
    const needCmd = utils.needCmd as unknown as ReturnType<typeof vi.fn>
    needCmd.mockResolvedValue(false)

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    await expect(ensureNode(makeCtx({ installNode: 'nvm', dryRun: true }))).rejects.toThrow(/Node\.js installation failed/)
  })

  it('ignores brew shellenv failures while still updating PATH', async () => {
    const zx = await import('zx')
    const dollar = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollar
      // Homebrew installer
      .mockResolvedValueOnce({ stdout: '' })
      // brew shellenv throws (we ignore)
      .mockRejectedValueOnce(new Error('shellenv failed'))
      // node -v after install
      .mockResolvedValueOnce({ stdout: 'v20.0.1\n' })

    const utils = await import('../src/installers/utils.js')
    const needCmd = utils.needCmd as unknown as ReturnType<typeof vi.fn>
    const runCommand = utils.runCommand as unknown as ReturnType<typeof vi.fn>

    let nodeChecks = 0
    needCmd.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') return (++nodeChecks) > 1
      if (cmd === 'npm') return false
      if (cmd === 'brew') return false
      return false
    })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    const ctx = makeCtx({ installNode: 'brew', dryRun: false })
    await ensureNode(ctx)

    expect(runCommand).toHaveBeenCalledWith('brew', ['install', 'node'], expect.anything())
    expect(process.env.PATH || '').toContain('/opt/homebrew/bin')
    expect(logger.ok).toHaveBeenCalledWith('Node.js installed (v20.0.1)')
  })
})

