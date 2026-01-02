import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/package.js', () => ({
  PACKAGE_NAME: 'codex-1up',
  PACKAGE_VERSION: '1.0.0'
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

describe('self update flow', () => {
  beforeEach(() => {
    vi.mocked(runCommand).mockClear()
  })

  it('updates when a newer version is available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.2.0' })
    })) as any)

    const result = await runSelfUpdate({
      interactive: false,
      assumeYes: true,
      dryRun: false,
      logger: {
        log: vi.fn(),
        info: vi.fn(),
        ok: vi.fn(),
        warn: vi.fn(),
        err: vi.fn()
      }
    })

    expect(result).toBe('updated')
    expect(runCommand).toHaveBeenCalledWith('npm', ['install', '-g', 'codex-1up@1.2.0'], expect.any(Object))
  })

  it('skips when already up to date', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.0' })
    })) as any)

    const result = await runSelfUpdate({
      interactive: false,
      assumeYes: true,
      dryRun: false,
      logger: {
        log: vi.fn(),
        info: vi.fn(),
        ok: vi.fn(),
        warn: vi.fn(),
        err: vi.fn()
      }
    })

    expect(result).toBe('up-to-date')
    expect(runCommand).not.toHaveBeenCalled()
  })
})
