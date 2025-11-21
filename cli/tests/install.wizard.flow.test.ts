import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { installCommand } from '../src/commands/install'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-wizard`)
const CH = resolve(td, '.codex')

// Mock clack prompts with deterministic answers based on message
vi.mock('@clack/prompts', () => {
  return {
    intro: vi.fn(),
    isCancel: (v: any) => v === null,
    confirm: vi.fn(async () => true),
    select: vi.fn(async ({ message, options }: any) => {
      const msg = String(message)
      if (msg.includes('Choose a Codex profile')) return 'safe'
      if (msg.startsWith('How should we write profiles.safe')) return 'overwrite'
      if (msg === 'Notification sound') return 'noti_1.wav'
      if (msg.startsWith('Selected:')) return 'use'
      if (msg.includes('Global ~/.codex/AGENTS.md')) return 'append-default'
      // Fallback to first option value
      return (options && options[0] && options[0].value) || null
    }),
    text: vi.fn(async () => 'yes'),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    log: { info: vi.fn(), warn: vi.fn() },
    note: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn()
  }
})

// Capture installer options
const captured: any[] = []
vi.mock('../src/installers/main.js', () => ({
  runInstaller: vi.fn(async (opts: any) => { captured.push(opts) })
}))

beforeAll(async () => {
  process.env.HOME = td
  await fs.mkdir(CH, { recursive: true })
  // Seed existing config to trigger overwrite question
  await fs.writeFile(resolve(CH, 'config.toml'), 'model = "gpt-5"\n', 'utf8')
  // Seed existing global AGENTS.md to trigger AGENTS prompt
  await fs.writeFile(resolve(CH, 'AGENTS.md'), '# existing', 'utf8')
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('install wizard main flow', () => {
  it('prompts config options, sound, agents and passes correct options', async () => {
    // Force TTY
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await installCommand.run!({ args: {} as any })
    expect(captured.length).toBeGreaterThan(0)
    const opts = captured.pop()
    expect(opts.profile).toBe('safe')
    expect(opts.profileMode).toBe('overwrite')
    expect(opts.setDefaultProfile).toBe(true)
    expect(opts.installCodexCli).toBe('yes')
    expect(opts.installTools).toBe('yes')
    expect(opts.notify).toBe('yes')
    expect(typeof opts.notificationSound).toBe('string')
    expect(opts.globalAgents).toBe('append-default')
    expect(opts.mode).toBe('manual')
  })

  it('allows skipping sound changes (keeps existing)', async () => {
    captured.length = 0
    // Reconfigure the select mock to return 'skip' for sound
    const prompts = await import('@clack/prompts') as any
    const origSelect = prompts.select
    prompts.select = vi.fn(async ({ message, options }: any) => {
      const msg = String(message)
      if (msg.includes('Choose a Codex profile')) return 'balanced'
      if (msg.startsWith('How should we write profiles.balanced')) return 'add'
      if (msg === 'Notification sound') return 'skip'
      if (msg.startsWith('Selected:')) return 'use'
      if (msg.includes('Global ~/.codex/AGENTS.md')) return 'skip'
      return (options && options[0] && options[0].value) || null
    })
    await installCommand.run!({ args: {} as any })
    const opts = captured.pop()
    expect(opts.profile).toBe('balanced')
    expect(opts.profileMode).toBe('add')
    expect(opts.installCodexCli).toBe('yes')
    expect(opts.installTools).toBe('yes')
    expect(opts.notify).toBe('no')
    expect(opts.notificationSound).toBeUndefined()
    prompts.select = origSelect
  })
})
