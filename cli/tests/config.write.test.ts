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
    expect(data.profiles['minimax-global-m3']).toMatchObject({
      model: 'MiniMax-M3',
      model_provider: 'minimax_global',
      model_context_window: 1000000
    })
    expect(data.profiles['minimax-global-m2-7']).toMatchObject({
      model: 'MiniMax-M2.7',
      model_provider: 'minimax_global',
      model_context_window: 204800
    })
    expect(data.profiles['minimax-cn-m3']).toMatchObject({
      model: 'MiniMax-M3',
      model_provider: 'minimax_cn',
      model_context_window: 1000000
    })
    expect(data.profiles['minimax-cn-m2-7']).toMatchObject({
      model: 'MiniMax-M2.7',
      model_provider: 'minimax_cn',
      model_context_window: 204800
    })
  })
})
