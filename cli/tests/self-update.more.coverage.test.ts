import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/package.js', () => ({
  PACKAGE_NAME: 'codex-1up',
  PACKAGE_VERSION: '1.0.0'
}))

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => true),
  isCancel: (v: any) => v === null
}))

vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    runCommand: vi.fn(async () => {})
  }
})

vi.mock('../src/installers/nodeGlobal.js', () => ({
  resolveNodeGlobalPm: vi.fn(async () => 'npm')
}))

import { runSelfUpdate } from '../src/actions/selfUpdate.js'
import { runCommand } from '../src/installers/utils.js'
import { resolveNodeGlobalPm } from '../src/installers/nodeGlobal.js'

describe('self update (extra coverage)', () => {
  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    ok: vi.fn(),
    warn: vi.fn(),
    err: vi.fn()
  }

  beforeEach(() => {
    vi.mocked(runCommand).mockClear()
    vi.mocked(resolveNodeGlobalPm).mockClear()
    logger.log.mockClear()
    logger.info.mockClear()
    logger.ok.mockClear()
    logger.warn.mockClear()
    logger.err.mockClear()
  })

  it('returns error when registry check fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as any)
    const res = await runSelfUpdate({ interactive: false, assumeYes: true, logger })
    expect(res).toBe('error')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('supports interactive cancel via prompt', async () => {
    const prompts = await import('@clack/prompts')
    const confirm = prompts.confirm as unknown as ReturnType<typeof vi.fn>
    confirm.mockResolvedValueOnce(null)

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.2.0' })
    })) as any)

    const res = await runSelfUpdate({ interactive: true, assumeYes: false, skipConfirmation: false, logger })
    expect(res).toBe('skipped')
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('supports interactive decline via prompt (skip update)', async () => {
    const prompts = await import('@clack/prompts')
    const confirm = prompts.confirm as unknown as ReturnType<typeof vi.fn>
    confirm.mockResolvedValueOnce(false)

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.2.0' })
    })) as any)

    const res = await runSelfUpdate({ interactive: true, assumeYes: false, skipConfirmation: false, logger })
    expect(res).toBe('skipped')
    expect(runCommand).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith('Skipping codex-1up update.')
  })

  it('handles registry fetch exceptions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }) as any)
    const res = await runSelfUpdate({ interactive: false, assumeYes: true, logger })
    expect(res).toBe('error')
  })

  it('returns error when no supported package manager is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.2.0' })
    })) as any)
    vi.mocked(resolveNodeGlobalPm).mockResolvedValueOnce('none' as any)

    const res = await runSelfUpdate({ interactive: false, assumeYes: true, logger })
    expect(res).toBe('error')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('updates via pnpm when selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.2.0' })
    })) as any)
    vi.mocked(resolveNodeGlobalPm).mockResolvedValueOnce('pnpm' as any)

    const res = await runSelfUpdate({ interactive: false, assumeYes: true, logger })
    expect(res).toBe('updated')
    expect(runCommand).toHaveBeenCalledWith('pnpm', ['add', '-g', 'codex-1up@1.2.0'], expect.any(Object))
  })

  it('treats non-semver latest as different (still updates)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: 'canary' })
    })) as any)

    const res = await runSelfUpdate({ interactive: false, assumeYes: true, logger })
    expect(res).toBe('updated')
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', 'codex-1up@canary'], expect.any(Object))
  })
})

