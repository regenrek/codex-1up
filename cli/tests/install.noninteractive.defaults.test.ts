import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { installCommand } from '../src/commands/install'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-nonint`)
const CH = resolve(td, '.codex')

// Capture installer options
const captured: any[] = []
vi.mock('../src/installers/main.js', () => ({
  runInstaller: vi.fn(async (opts: any) => { captured.push(opts) })
}))

beforeAll(async () => {
  process.env.HOME = td
  await fs.mkdir(CH, { recursive: true })
  // Ensure no existing config to test defaults
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('install non-interactive defaults', () => {
  it('uses safe defaults with --yes --skip-confirmation', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await installCommand.run!({ args: { yes: true, 'skip-confirmation': true } as any })
    expect(captured.length).toBeGreaterThan(0)
    const opts = captured.pop()
    expect(opts.profile).toBe('balanced')
    expect(opts.profileMode).toBe('add')
    expect(opts.setDefaultProfile).toBe(true)
    expect(opts.installCodexCli).toBe('yes')
    expect(opts.installTools).toBe('yes')
    expect(opts.mode).toBe('manual')
    // Global agents skipped by default
    expect(opts.globalAgents).toBe('skip')
  })
})
