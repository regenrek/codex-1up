import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn()
  }
})

vi.mock('zx', () => {
  return {
    which: vi.fn(),
    $: vi.fn()
  }
})

describe('installers/utils', () => {
  const logger = { log: vi.fn(), info: vi.fn(), ok: vi.fn(), warn: vi.fn(), err: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('needCmd returns true when which succeeds, false when it throws', async () => {
    const zx = await import('zx')
    const { needCmd } = await import('../src/installers/utils.js')

    ;(zx.which as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce('/bin/ok')
    await expect(needCmd('git')).resolves.toBe(true)

    ;(zx.which as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('nope'))
    await expect(needCmd('nope')).resolves.toBe(false)
  })

  it('detectPackageManager returns first matching manager', async () => {
    const zx = await import('zx')
    const { detectPackageManager } = await import('../src/installers/utils.js')

    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'apt-get') return '/usr/bin/apt-get'
      throw new Error('not found')
    })

    await expect(detectPackageManager()).resolves.toBe('apt')
  })

  it('createPrivilegedPmCmd uses sudo when non-root', async () => {
    const { createPrivilegedPmCmd } = await import('../src/installers/utils.js')

    // On Windows we never use sudo.
    if (process.platform === 'win32' || typeof process.getuid !== 'function') {
      expect(createPrivilegedPmCmd('apt-get')).toEqual({ cmd: 'apt-get', argsPrefix: [] })
      return
    }

    const getuid = vi.spyOn(process, 'getuid').mockReturnValue(501)
    expect(createPrivilegedPmCmd('apt-get')).toEqual({ cmd: 'sudo', argsPrefix: ['apt-get'] })
    getuid.mockRestore()
  })

  it('createPrivilegedPmCmd does not use sudo when root', async () => {
    const { createPrivilegedPmCmd } = await import('../src/installers/utils.js')

    // On Windows (or other platforms without getuid) we never use sudo.
    if (process.platform === 'win32' || typeof process.getuid !== 'function') {
      expect(createPrivilegedPmCmd('apt-get')).toEqual({ cmd: 'apt-get', argsPrefix: [] })
      return
    }

    const getuid = vi.spyOn(process, 'getuid').mockReturnValue(0)
    expect(createPrivilegedPmCmd('apt-get')).toEqual({ cmd: 'apt-get', argsPrefix: [] })
    getuid.mockRestore()
  })

  it('chooseNodePmForGlobal prefers pnpm when bin dir is configured', async () => {
    const zx = await import('zx')
    const { chooseNodePmForGlobal } = await import('../src/installers/utils.js')

    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pnpm') return '/usr/bin/pnpm'
      throw new Error('not found')
    })

    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollarMock.mockReturnValueOnce({
      quiet() {
        return Promise.resolve({ stdout: '/Users/me/.local/share/pnpm\n' })
      }
    })

    await expect(chooseNodePmForGlobal(logger)).resolves.toEqual({
      pm: 'pnpm',
      binDir: '/Users/me/.local/share/pnpm'
    })
  })

  it('chooseNodePmForGlobal falls back to npm when pnpm missing', async () => {
    const zx = await import('zx')
    const { chooseNodePmForGlobal } = await import('../src/installers/utils.js')

    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'npm') return '/usr/bin/npm'
      throw new Error('not found')
    })

    await expect(chooseNodePmForGlobal(logger)).resolves.toEqual({ pm: 'npm', reason: 'npm-default' })
  })

  it('chooseNodePmForGlobal returns none when pnpm errors', async () => {
    const zx = await import('zx')
    const { chooseNodePmForGlobal } = await import('../src/installers/utils.js')

    const whichMock = zx.which as unknown as ReturnType<typeof vi.fn>
    whichMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pnpm') return '/usr/bin/pnpm'
      throw new Error('not found')
    })

    const dollarMock = zx.$ as unknown as ReturnType<typeof vi.fn>
    dollarMock.mockReturnValueOnce({
      quiet() {
        return Promise.reject(new Error('pnpm failed'))
      }
    })

    await expect(chooseNodePmForGlobal(logger)).resolves.toEqual({ pm: 'none', reason: 'pnpm-error' })
    expect(logger.warn).toHaveBeenCalled()
  })

  it('runCommand logs in dryRun mode', async () => {
    const { runCommand } = await import('../src/installers/utils.js')
    await expect(runCommand('echo', ['hello world'], { dryRun: true, logger })).resolves.toBeUndefined()
    expect(logger.log).toHaveBeenCalledWith('[dry-run] echo "hello world"')
  })

  it('runCommand resolves on exit 0 and rejects on non-zero', async () => {
    const cp = await import('node:child_process')
    const { runCommand } = await import('../src/installers/utils.js')

    const spawnMock = cp.spawn as unknown as ReturnType<typeof vi.fn>

    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as unknown as { on: (ev: string, cb: (...args: any[]) => void) => void }
      process.nextTick(() => (proc as unknown as EventEmitter).emit('exit', 0))
      return proc
    })

    await expect(runCommand('true', [], { dryRun: false })).resolves.toBeUndefined()

    spawnMock.mockImplementationOnce(() => {
      const proc = new EventEmitter() as unknown as { on: (ev: string, cb: (...args: any[]) => void) => void }
      process.nextTick(() => (proc as unknown as EventEmitter).emit('exit', 1))
      return proc
    })

    await expect(runCommand('false', [], { dryRun: false })).rejects.toThrow(/Command failed \(1\)/)
  })

  it('createBackupPath uses timestamped suffix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-21T00:00:00.000Z'))
    const { createBackupPath } = await import('../src/installers/utils.js')
    const out = createBackupPath('/tmp/config.toml')
    expect(out).toMatch(/^\/tmp\/config\.toml\.backup\.2026-01-21T00-00-00$/)
  })
})

