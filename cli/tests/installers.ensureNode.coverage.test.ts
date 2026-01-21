import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('zx', () => {
  return {
    which: vi.fn(),
    $: vi.fn()
  }
})

describe('installers/ensureNode', () => {
  const logger = { log: vi.fn(), info: vi.fn(), ok: vi.fn(), warn: vi.fn(), err: vi.fn() }

  function makeCtx(overrides: Partial<any> = {}) {
    return {
      cwd: '/tmp',
      homeDir: '/tmp/home',
      rootDir: '/tmp/root',
      logDir: '/tmp/log',
      logFile: '/tmp/log/install.log',
      logger,
      options: {
        installNode: 'skip',
        dryRun: true,
        assumeYes: true,
        skipConfirmation: true
      },
      ...overrides
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when node and npm are present', async () => {
    const zx = await import('zx')
    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') return '/usr/bin/node'
      if (cmd === 'npm') return '/usr/bin/npm'
      throw new Error('not found')
    })

    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollarMock.mockResolvedValueOnce({ stdout: 'v20.12.0\n' })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    await expect(ensureNode(makeCtx({ options: { installNode: 'skip', dryRun: false, assumeYes: true, skipConfirmation: true } }))).resolves.toBeUndefined()
    expect(logger.ok).toHaveBeenCalledWith('Node.js present (v20.12.0)')
  })

  it('warns and returns when installNode is skip and prerequisites missing', async () => {
    const zx = await import('zx')
    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockRejectedValue(new Error('not found'))

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    await expect(ensureNode(makeCtx({ options: { installNode: 'skip', dryRun: false, assumeYes: true, skipConfirmation: true } }))).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('attempts brew path and verifies node after install', async () => {
    const zx = await import('zx')
    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>

    // First check: node/npm missing. Later verification: node present.
    const nodeCalls: number[] = []
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') {
        nodeCalls.push(1)
        if (nodeCalls.length === 1) throw new Error('missing')
        return '/usr/bin/node'
      }
      if (cmd === 'npm') throw new Error('missing')
      if (cmd === 'brew') throw new Error('missing')
      throw new Error('missing')
    })

    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollarMock.mockResolvedValueOnce({ stdout: 'v20.12.0\n' })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    const ctx = makeCtx({
      options: { installNode: 'brew', dryRun: true, assumeYes: true, skipConfirmation: true }
    })
    await expect(ensureNode(ctx)).resolves.toBeUndefined()
    expect(logger.log).toHaveBeenCalledWith('[dry-run] install Homebrew')
    expect(logger.ok).toHaveBeenCalledWith('Node.js installed (v20.12.0)')
  })

  it('nvm dry-run path logs and then verifies node', async () => {
    const zx = await import('zx')
    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>

    // First check: node/npm missing. After "install": node present.
    let nodeChecks = 0
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') {
        nodeChecks++
        if (nodeChecks === 1) throw new Error('missing')
        return '/usr/bin/node'
      }
      if (cmd === 'npm') throw new Error('missing')
      return '/usr/bin/ok'
    })

    dollarMock.mockResolvedValueOnce({ stdout: 'v18.19.0\n' })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    const ctx = makeCtx({ options: { installNode: 'nvm', dryRun: true, assumeYes: true, skipConfirmation: true } })
    await expect(ensureNode(ctx)).resolves.toBeUndefined()
    expect(logger.log).toHaveBeenCalledWith('[dry-run] install nvm + Node LTS')
    expect(logger.ok).toHaveBeenCalledWith('Node.js installed (v18.19.0)')
  })

  it('brew path calls brew install node in dry-run', async () => {
    const zx = await import('zx')
    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>

    let nodeChecks = 0
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'node') {
        nodeChecks++
        if (nodeChecks === 1) throw new Error('missing')
        return '/usr/bin/node'
      }
      if (cmd === 'npm') throw new Error('missing')
      if (cmd === 'brew') return '/usr/local/bin/brew'
      return '/usr/bin/ok'
    })
    dollarMock.mockResolvedValueOnce({ stdout: 'v20.12.0\n' })

    const { ensureNode } = await import('../src/installers/ensureNode.js')
    const ctx = makeCtx({ options: { installNode: 'brew', dryRun: true, assumeYes: true, skipConfirmation: true } })
    await expect(ensureNode(ctx)).resolves.toBeUndefined()
    expect(logger.log).toHaveBeenCalledWith('[dry-run] brew install node')
    expect(logger.ok).toHaveBeenCalledWith('Node.js installed (v20.12.0)')
  })
})

