import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-skills`)

describe('actions/skills (extra coverage)', () => {
  beforeAll(async () => {
    // Cross-platform: os.homedir() uses HOME on unix and USERPROFILE on Windows.
    process.env.HOME = td
    process.env.USERPROFILE = td
    await fs.mkdir(resolve(td, '.codex', 'skills'), { recursive: true })
  })

  afterAll(async () => {
    try { await fs.rm(td, { recursive: true, force: true }) } catch {}
  })

  it('listInstalled returns sorted skills and handles missing dir', async () => {
    const { listInstalled } = await import('../src/actions/skills.js')

    // Missing dir should return [] (no throw)
    await fs.rm(resolve(td, '.codex', 'skills'), { recursive: true, force: true })
    await expect(listInstalled()).resolves.toEqual([])

    // Create a couple directories; ensure sort order.
    await fs.mkdir(resolve(td, '.codex', 'skills', 'zeta'), { recursive: true })
    await fs.mkdir(resolve(td, '.codex', 'skills', 'alpha'), { recursive: true })
    const out = await listInstalled()
    expect(out.map(s => s.id)).toEqual(['alpha', 'zeta'])
  })

  it('installSkills wires mode/selected through to maybeInstallSkills', async () => {
    const called: any[] = []
    vi.resetModules()
    vi.doMock('../src/actions/context.js', () => ({
      createActionContext: vi.fn(async (opts: any) => opts)
    }))
    vi.doMock('../src/installers/maybeInstallSkills.js', () => ({
      maybeInstallSkills: vi.fn(async (ctx: any) => { called.push(ctx) })
    }))

    const { installSkills } = await import('../src/actions/skills.js')
    await installSkills('select', ['debug-lldb'], { dryRun: true })
    expect(called[0]).toMatchObject({ skills: 'select', skillsSelected: ['debug-lldb'], dryRun: true })
  })
})

