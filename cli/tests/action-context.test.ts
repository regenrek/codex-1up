import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createActionContext, createBaseOptions } from '../src/actions/context'

let tempHome = ''

beforeAll(async () => {
  tempHome = await mkdtemp(join(tmpdir(), 'codex-1up-home-'))
  process.env.HOME = tempHome
  process.env.USERPROFILE = tempHome
})

afterAll(async () => {
  try { await rm(tempHome, { recursive: true, force: true }) } catch {}
})

describe('action context', () => {
  it('creates base options with safe defaults', () => {
    const opts = createBaseOptions()
    expect(opts.installTools).toBe('skip')
    expect(opts.installCodexCli).toBe('no')
    expect(opts.skills).toBe('skip')
  })

  it('creates an action context with overrides', async () => {
    const ctx = await createActionContext({ installTools: 'all', dryRun: true })
    expect(ctx.options.installTools).toBe('all')
    expect(ctx.options.dryRun).toBe(true)
    expect(ctx.logDir).toContain('.codex-1up')
  })
})
