import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { root } from '../src/index'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-sp`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')

beforeAll(async () => {
  process.env.HOME = td
  process.env.USERPROFILE = td // Windows compatibility
  await fs.mkdir(CH, { recursive: true })
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('config set-profile', () => {
  it('sets profile at root', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    await runCommand(root, { rawArgs: ['config', 'set-profile', 'safe'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toMatch(/profile\s*=\s*"safe"/)
  })
})

