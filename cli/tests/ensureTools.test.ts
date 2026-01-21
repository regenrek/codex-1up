import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { InstallerContext } from '../src/installers/types.js'
import { ensureTools } from '../src/installers/ensureTools.js'
import { runCommand, detectPackageManager, needCmd, isMacOS } from '../src/installers/utils.js'

vi.mock('../src/installers/tooling.js', () => ({
  listTools: () => ([
    {
      id: 'rg',
      label: 'rg',
      bins: ['rg'],
      packages: { brew: ['ripgrep'], apt: ['ripgrep'], dnf: ['ripgrep'], pacman: ['ripgrep'], zypper: ['ripgrep'] }
    },
    {
      id: 'gh',
      label: 'gh',
      bins: ['gh'],
      packages: { brew: ['gh'], apt: ['gh'], dnf: ['gh'], pacman: ['github-cli'], zypper: ['gh'] }
    },
    {
      id: 'fd',
      label: 'fd',
      bins: ['fd'],
      packages: { brew: ['fd'], apt: ['fd-find'], dnf: ['fd-find'], pacman: ['fd'], zypper: ['fd'] }
    },
    {
      id: 'bat',
      label: 'bat',
      bins: ['bat'],
      packages: { brew: ['bat'], apt: ['bat'], dnf: ['bat'], pacman: ['bat'], zypper: ['bat'] }
    }
  ])
}))

vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    runCommand: vi.fn(async () => {}),
    detectPackageManager: vi.fn(async () => 'brew'),
    needCmd: vi.fn(async () => true),
    isMacOS: vi.fn(() => false)
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
    expect(runCommand).toHaveBeenCalledWith('brew', ['install', 'ripgrep', 'gh', 'fd', 'bat'], expect.any(Object))
    expect(needCmd).toHaveBeenCalled()
  })

  it('prompts to install Homebrew on macOS when brew is missing', async () => {
    ;(isMacOS as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(true)
    ;(needCmd as unknown as { mockImplementation: (fn: (cmd: string) => Promise<boolean>) => void }).mockImplementation(
      async (cmd: string) => cmd !== 'brew'
    )

    const ctx = createCtx()
    await ensureTools(ctx)

    expect(ctx.logger.err).toHaveBeenCalledWith(expect.stringContaining('brew.sh'))
    expect(ctx.logger.err).toHaveBeenCalledWith(expect.stringContaining('Homebrew is required on macOS'))
    expect(detectPackageManager).not.toHaveBeenCalled()
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('sets up GitHub CLI apt repo when installing gh (dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('apt')
    ;(needCmd as unknown as { mockImplementation: (fn: (cmd: string) => Promise<boolean>) => void }).mockImplementation(
      async (cmd: string) => cmd !== 'gh'
    )
    const ctx = createCtx()
    await ensureTools(ctx)

    // Repo setup runs before apt-get update when gh is selected and missing.
    expect(runCommand).toHaveBeenCalledWith(
      'bash',
      ['-lc', expect.stringContaining('github-cli.list')],
      expect.any(Object)
    )
  })

  it('warns if GitHub CLI apt repo setup fails but continues', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('apt')
    ;(needCmd as unknown as { mockImplementation: (fn: (cmd: string) => Promise<boolean>) => void }).mockImplementation(
      async (cmd: string) => cmd !== 'gh'
    )
    ;(runCommand as unknown as { mockImplementation: (fn: (cmd: string, args: string[]) => Promise<void>) => void }).mockImplementation(
      async (cmd: string, args: string[]) => {
        if (cmd === 'bash' && args[0] === '-lc') throw new Error('repo setup failed')
      }
    )

    const ctx = createCtx()
    await ensureTools(ctx)
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'Failed to set up GitHub CLI apt repo; will still try apt-get install gh (may fail).'
    )
  })

  it('warns and aborts apt installs when apt-get update fails', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('apt')
    ;(runCommand as unknown as { mockImplementation: (fn: (cmd: string, args: string[]) => Promise<void>) => void }).mockImplementation(
      async (cmd: string, args: string[]) => {
        // On Windows we don't use sudo; on POSIX we do.
        if (process.platform === 'win32') {
          if (cmd === 'apt-get' && args[0] === 'update') throw new Error('update failed')
        } else {
          if (cmd === 'sudo' && args[0] === 'apt-get' && args[1] === 'update') throw new Error('update failed')
        }
      }
    )
    const ctx = createCtx()
    await ensureTools(ctx)
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('apt-get update failed; install tools manually'))
  })

  it('warns when apt-get install fails for a package', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('apt')
    ;(runCommand as unknown as { mockImplementation: (fn: (cmd: string, args: string[]) => Promise<void>) => void }).mockImplementation(
      async (cmd: string, args: string[]) => {
        // allow update
        if (process.platform === 'win32') {
          if (cmd === 'apt-get' && args[0] === 'install' && args.includes('gh')) throw new Error('install gh failed')
        } else {
          if (cmd === 'sudo' && args[0] === 'apt-get' && args[1] === 'install' && args.includes('gh')) throw new Error('install gh failed')
        }
      }
    )
    const ctx = createCtx()
    await ensureTools(ctx)
    expect(ctx.logger.warn).toHaveBeenCalledWith('apt-get install failed for gh; install manually if needed.')
  })

  it('runs dnf branch install command (dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('dnf')
    const ctx = createCtx()
    await ensureTools(ctx)
    if (process.platform === 'win32') {
      expect(runCommand).toHaveBeenCalledWith('dnf', ['install', '-y', 'ripgrep', 'gh', 'fd-find', 'bat'], expect.any(Object))
    } else {
      expect(runCommand).toHaveBeenCalledWith('sudo', ['dnf', 'install', '-y', 'ripgrep', 'gh', 'fd-find', 'bat'], expect.any(Object))
    }
  })

  it('runs pacman branch install command (dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('pacman')
    const ctx = createCtx()
    await ensureTools(ctx)
    if (process.platform === 'win32') {
      expect(runCommand).toHaveBeenCalledWith('pacman', ['-Sy', '--noconfirm', 'ripgrep', 'github-cli', 'fd', 'bat'], expect.any(Object))
    } else {
      expect(runCommand).toHaveBeenCalledWith('sudo', ['pacman', '-Sy', '--noconfirm', 'ripgrep', 'github-cli', 'fd', 'bat'], expect.any(Object))
    }
  })

  it('runs zypper branch refresh + install (dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('zypper')
    const ctx = createCtx()
    await ensureTools(ctx)
    if (process.platform === 'win32') {
      expect(runCommand).toHaveBeenCalledWith('zypper', ['refresh'], expect.any(Object))
      expect(runCommand).toHaveBeenCalledWith('zypper', ['install', '-y', 'ripgrep', 'gh', 'fd', 'bat'], expect.any(Object))
    } else {
      expect(runCommand).toHaveBeenCalledWith('sudo', ['zypper', 'refresh'], expect.any(Object))
      expect(runCommand).toHaveBeenCalledWith('sudo', ['zypper', 'install', '-y', 'ripgrep', 'gh', 'fd', 'bat'], expect.any(Object))
    }
  })

  it('creates fd/bat aliases when alt binaries exist (dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('brew')
    ;(needCmd as unknown as { mockImplementation: (fn: (cmd: string) => Promise<boolean>) => void }).mockImplementation(
      async (cmd: string) => {
        if (cmd === 'fdfind') return true
        if (cmd === 'batcat') return true
        if (cmd === 'fd') return false
        if (cmd === 'bat') return false
        return true
      }
    )
    const ctx = createCtx()
    await ensureTools(ctx)
    expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining('ln -s'))
  })

  it('prints gh first-time setup hints when gh was missing (non-dry-run)', async () => {
    ;(detectPackageManager as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('brew')
    ;(needCmd as unknown as { mockImplementation: (fn: (cmd: string) => Promise<boolean>) => void }).mockImplementation(
      async (cmd: string) => cmd !== 'gh'
    )
    const ctx = createCtx({ dryRun: false })
    await ensureTools(ctx)
    expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('gh auth login'))
  })
})
