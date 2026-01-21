import { describe, it, expect, vi } from 'vitest'
import { getToolStatuses, isToolInstalled, installTools } from '../src/actions/tools'
import { needCmd } from '../src/installers/utils.js'

const ensureToolsMock = vi.hoisted(() => vi.fn(async () => {}))
const createActionContextMock = vi.hoisted(() => vi.fn(async () => ({ logger: { log: () => {}, info: () => {}, ok: () => {}, warn: () => {}, err: () => {} }, options: {} })))

vi.mock('../src/installers/tooling.js', () => ({
  listTools: () => ([
    { id: 'rg', label: 'rg', bins: ['rg'], packages: {} },
    { id: 'fd', label: 'fd', bins: ['fd'], packages: {} }
  ])
}))

vi.mock('../src/installers/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../src/installers/utils.js')>('../src/installers/utils.js')
  return {
    ...actual,
    needCmd: vi.fn(async (cmd: string) => cmd === 'rg')
  }
})

vi.mock('../src/installers/ensureTools.js', () => ({
  ensureTools: ensureToolsMock
}))

vi.mock('../src/actions/context.js', () => ({
  createActionContext: createActionContextMock
}))

describe('tools actions', () => {
  it('returns tool statuses based on availability', async () => {
    const statuses = await getToolStatuses()
    const rg = statuses.find(s => s.id === 'rg')
    const fd = statuses.find(s => s.id === 'fd')
    expect(rg?.installed).toBe(true)
    expect(fd?.installed).toBe(false)
  })

  it('checks tool bins', async () => {
    const ok = await isToolInstalled(['rg'])
    expect(ok).toBe(true)
    expect(needCmd).toHaveBeenCalled()
  })

  it('installTools delegates to ensureTools with a constructed action context', async () => {
    await installTools(['rg'], { dryRun: true })
    expect(createActionContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ installTools: 'select', toolsSelected: ['rg'], dryRun: true })
    )
    expect(ensureToolsMock).toHaveBeenCalled()
  })

  it('installTools supports installing all tools', async () => {
    await installTools('all', { dryRun: false })
    expect(createActionContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ installTools: 'all', toolsSelected: undefined, dryRun: false })
    )
    expect(ensureToolsMock).toHaveBeenCalled()
  })
})
