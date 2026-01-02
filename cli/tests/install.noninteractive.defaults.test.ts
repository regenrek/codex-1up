import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { installCommand } from '../src/commands/install'
import { buildRawArgsFromFlags } from './test-utils'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-nonint`)
const CH = resolve(td, '.codex')
const isWindows = process.platform === 'win32'

// Capture installer options
const captured: any[] = []
vi.mock('../src/installers/main.js', () => ({
  runInstaller: vi.fn(async (opts: any) => { captured.push(opts) })
}))

beforeAll(async () => {
  process.env.HOME = td
  process.env.USERPROFILE = td // Windows compatibility
  await fs.mkdir(CH, { recursive: true })
  // Ensure no existing config to test defaults
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('install non-interactive defaults', () => {
  it('uses safe defaults with --yes --skip-confirmation', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, {
      rawArgs: buildRawArgsFromFlags({ yes: true, 'skip-confirmation': true })
    })
    expect(captured.length).toBeGreaterThan(0)
    const opts = captured.pop()
    expect(opts.profile).toBe('balanced')
    expect(opts.profileScope).toBe('single')
    expect(opts.profileMode).toBe('add')
    expect(opts.setDefaultProfile).toBe(true)
    expect(opts.installCodexCli).toBe('auto')
    // Tools default to 'all' on Unix, 'skip' on Windows (no package manager support)
    expect(opts.installTools).toBe(isWindows ? 'skip' : 'all')
    expect(opts.mode).toBe('manual')
    // Global agents skipped by default
    expect(opts.globalAgents).toBe('skip')
  })
})
