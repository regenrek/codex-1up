import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveNodeGlobalPm } from '../src/installers/nodeGlobal.js'
import { chooseNodePmForGlobal } from '../src/installers/utils.js'
import * as prompts from '@clack/prompts'

vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    chooseNodePmForGlobal: vi.fn()
  }
})

vi.mock('@clack/prompts', () => ({
  select: vi.fn(async () => 'npm'),
  isCancel: (v: unknown) => v === Symbol.for('cancel')
}))

describe('resolveNodeGlobalPm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns pnpm when configured', async () => {
    vi.mocked(chooseNodePmForGlobal).mockResolvedValueOnce({ pm: 'pnpm', binDir: '/tmp' })
    const pm = await resolveNodeGlobalPm({ interactive: true })
    expect(pm).toBe('pnpm')
  })

  it('falls back to npm interactively when pnpm is misconfigured', async () => {
    vi.mocked(chooseNodePmForGlobal).mockResolvedValueOnce({ pm: 'none', reason: 'pnpm-misconfigured' })
    vi.mocked(prompts.select).mockResolvedValueOnce('npm')
    const pm = await resolveNodeGlobalPm({ interactive: true })
    expect(pm).toBe('npm')
  })

  it('skips when user cancels fallback', async () => {
    vi.mocked(chooseNodePmForGlobal).mockResolvedValueOnce({ pm: 'none', reason: 'pnpm-misconfigured' })
    vi.mocked(prompts.select).mockResolvedValueOnce(Symbol.for('cancel') as any)
    const pm = await resolveNodeGlobalPm({ interactive: true })
    expect(pm).toBe('none')
  })

  it('falls back to npm without prompting in non-interactive mode', async () => {
    vi.mocked(chooseNodePmForGlobal).mockResolvedValueOnce({ pm: 'none', reason: 'pnpm-misconfigured' })
    const pm = await resolveNodeGlobalPm({ interactive: false })
    expect(pm).toBe('npm')
  })
})
