import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { root } from '../src/index'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')

beforeAll(async () => { await fs.mkdir(CH, { recursive: true }) })
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('config init/write', () => {
  it('writes unified config with profiles and features.web_search_request', async () => {
    process.env.HOME = td
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toMatch(/\[profiles\./)
    expect(data).toMatch(/\[features\]\s*\nweb_search_request\s*=\s*true/)
  })

  it('does not set unsupported reasoning summary in minimal profile', async () => {
    process.env.HOME = td
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = await fs.readFile(CFG, 'utf8')
    // Ensure minimal profile does not force an unsupported summary value
    expect(data).not.toMatch(/\[profiles\.minimal\][\s\S]*model_reasoning_summary\s*=/)
  })

  it('enables reasoning steps in TUI by default', async () => {
    process.env.HOME = td
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toMatch(/\[tui\][\s\S]*show_raw_agent_reasoning\s*=\s*true/)
    expect(data).toMatch(/\[tui\][\s\S]*hide_agent_reasoning\s*=\s*false/)
  })
})
