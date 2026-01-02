import { describe, it, expect, vi } from 'vitest'
import { getToolStatuses, isToolInstalled } from '../src/actions/tools'
import { needCmd } from '../src/installers/utils.js'

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
})
