import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { installCommand } from '../src/commands/install'
import { buildRawArgsFromFlags } from './test-utils'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-install-validate`)

const calls: any[] = []
vi.mock('../src/actions/install.js', () => ({
  runInstall: vi.fn(async (opts: any) => { calls.push(opts) }),
  printPostInstallSummary: vi.fn(async () => undefined)
}))

vi.mock('../src/flows/installWizard.js', () => ({
  runInstallWizard: vi.fn(async () => null)
}))

beforeAll(async () => {
  process.env.HOME = td
  await fs.mkdir(resolve(td, '.codex'), { recursive: true })
})

afterAll(async () => {
  try { await fs.rm(td, { recursive: true, force: true }) } catch {}
})

describe('install args validation (extra coverage)', () => {
  it('rejects empty-string args early', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ sound: '' }) }))
      .rejects.toThrow(/Invalid --sound value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ tools: '' }) }))
      .rejects.toThrow(/Invalid --tools value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ skills: '' }) }))
      .rejects.toThrow(/Invalid --skills value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'web-search': '' }) }))
      .rejects.toThrow(/Invalid --web-search value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'file-opener': '' }) }))
      .rejects.toThrow(/Invalid --file-opener value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'credentials-store': '' }) }))
      .rejects.toThrow(/Invalid --credentials-store value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'alt-screen': '' }) }))
      .rejects.toThrow(/Invalid --alt-screen value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ experimental: '' }) }))
      .rejects.toThrow(/Invalid --experimental value/)
  })

  it('rejects invalid enum values', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ profile: 'nope' }) }))
      .rejects.toThrow(/Invalid --profile value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'profiles-scope': 'selected' }) }))
      .rejects.toThrow(/Invalid --profiles-scope value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'profile-mode': 'merge' }) }))
      .rejects.toThrow(/Invalid --profile-mode value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'codex-cli': 'maybe' }) }))
      .rejects.toThrow(/Expected yes\|no/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'web-search': 'online' }) }))
      .rejects.toThrow(/Invalid --web-search value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'file-opener': 'sublime' }) }))
      .rejects.toThrow(/Invalid --file-opener value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'credentials-store': 'vault' }) }))
      .rejects.toThrow(/Invalid --credentials-store value/)
    await expect(runCommand(installCommand, { rawArgs: buildRawArgsFromFlags({ 'alt-screen': 'sometimes' }) }))
      .rejects.toThrow(/Invalid --alt-screen value/)
  })

  it('dedupes --experimental entries', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(installCommand, {
      rawArgs: buildRawArgsFromFlags({
        yes: true,
        'skip-confirmation': true,
        'dry-run': true,
        experimental: 'steering,steering,background-terminal'
      })
    })
    const opts = calls.pop()
    expect(opts.experimentalFeatures).toEqual(['steering', 'background-terminal'])
  })

  it('applies --sound=skip and --sound=none', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })

    await runCommand(installCommand, {
      rawArgs: buildRawArgsFromFlags({
        yes: true,
        'skip-confirmation': true,
        'dry-run': true,
        sound: 'skip'
      })
    })
    const skip = calls.pop()
    expect(skip.notify).toBe('no')
    expect(skip.notificationSound).toBeUndefined()

    await runCommand(installCommand, {
      rawArgs: buildRawArgsFromFlags({
        yes: true,
        'skip-confirmation': true,
        'dry-run': true,
        sound: 'none'
      })
    })
    const none = calls.pop()
    expect(none.notify).toBe('yes')
    expect(none.notificationSound).toBe('none')
  })

  it('wizard mode returning null exits early without running install', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const wiz = runInstallWizard as unknown as ReturnType<typeof vi.fn>
    wiz.mockResolvedValueOnce(null)

    const before = calls.length
    await runCommand(installCommand, { rawArgs: [] })
    expect(calls.length).toBe(before)
  })
})

