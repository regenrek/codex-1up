import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { root } from '../src/index'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')

beforeAll(async () => {
  process.env.HOME = td
  process.env.USERPROFILE = td // Windows compatibility
  await fs.mkdir(CH, { recursive: true })
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('config init/write', () => {
  it('writes unified config with profiles and web_search mode', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toMatch(/\[profiles\./)
    expect(data).toMatch(/^web_search\s*=\s*"live"/m)
  })

  it('enables raw reasoning output by default (root keys)', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toMatch(/^show_raw_agent_reasoning\s*=\s*true/m)
    expect(data).toMatch(/^hide_agent_reasoning\s*=\s*false/m)
  })
})
