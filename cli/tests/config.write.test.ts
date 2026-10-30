import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import * as TOML from 'toml'
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

  it('writes MiniMax providers and regional model profiles', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const data = TOML.parse(await fs.readFile(CFG, 'utf8')) as any

    expect(data.model_providers.minimax_global).toEqual({
      name: 'MiniMax (Global)',
      base_url: 'https://api.minimax.io/v1',
      env_key: 'MINIMAX_API_KEY',
      wire_api: 'responses'
    })
    expect(data.model_providers.minimax_cn).toEqual({
      name: 'MiniMax (China)',
      base_url: 'https://api.minimaxi.com/v1',
      env_key: 'MINIMAX_API_KEY',
      wire_api: 'responses'
    })
    const names = Object.keys(data.profiles).filter(name => name.startsWith('minimax-'))
    expect(names).toEqual([
      'minimax-global-m3-flash', 'minimax-global-m3',
      'minimax-cn-m3-flash', 'minimax-cn-m3'
    ])
    for (const region of ['global', 'cn']) {
      for (const [suffix, model] of [['m3-flash', 'MiniMax-M3.1-Flash'], ['m3', 'MiniMax-M3']]) {
        expect(data.profiles[`minimax-${region}-${suffix}`]).toEqual({
          model,
          model_provider: `minimax_${region}`,
          model_context_window: 1000000,
          model_reasoning_summary: 'none',
          web_search: 'disabled'
        })
      }
    }
  })
})
