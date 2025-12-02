import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'
import { ensureNotifyHook } from '../src/installers/ensureNotifyHook'
import { setupNotificationSound } from '../src/installers/setupNotificationSound'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-legacy`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')
const NOTIFY = resolve(CH, 'notify.sh')
const BASHRC = resolve(td, '.bashrc')

const logger: Logger = { log:()=>{}, info:()=>{}, ok:()=>{}, warn:()=>{}, err:()=>{} }

function makeCtx(sound: string): InstallerContext {
  const options: InstallerOptions = {
    profile: 'balanced', profileScope: 'single', profileMode: 'add', setDefaultProfile: false,
    installCodexCli: 'yes',
    installTools: 'no',
    notify: 'yes', globalAgents: 'skip',
    mode: 'manual', installNode: 'skip', shell: 'auto', vscodeId: undefined,
    noVscode: true, agentsMd: undefined, dryRun: false, assumeYes: true, skipConfirmation: true,
    notificationSound: sound
  }
  return { cwd: td, homeDir: td, rootDir: resolve(__dirname, '../../'), logDir: CH, logFile: resolve(CH,'log.txt'), options, logger }
}

beforeAll(async () => {
  await fs.mkdir(CH, { recursive: true })
  await fs.writeFile(CFG, '', 'utf8')
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('legacy rc block cleanup', () => {
  it('removes legacy bare markers from rc files without adding new blocks', async () => {
    // Pre-populate .bashrc with legacy (invalid) bare markers
    const legacyContent = `# Some existing config
export PATH="/usr/local/bin:$PATH"

>>> codex-1up >>>
# Notification sound
export CODEX_DISABLE_SOUND=0
export CODEX_CUSTOM_SOUND="/old/path/to/sound.wav"
<<< codex-1up <<<

# More user config
alias ll="ls -la"
`
    await fs.writeFile(BASHRC, legacyContent, 'utf8')

    const ctx = makeCtx('noti_1.wav')
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)

    const rc = await fs.readFile(BASHRC, 'utf8')

    // Legacy bare markers should be removed
    expect(rc).not.toMatch(/^>>> codex-1up >>>/m)
    expect(rc).not.toMatch(/^<<< codex-1up <<</m)

    // No new blocks should be written (sound config now lives in notify.sh only)
    expect(rc).not.toContain('# >>> codex-1up >>>')
    expect(rc).not.toContain('# <<< codex-1up <<<')
    expect(rc).not.toContain('CODEX_CUSTOM_SOUND')
    expect(rc).not.toContain('CODEX_DISABLE_SOUND')

    // User config before and after should be preserved
    expect(rc).toContain('export PATH="/usr/local/bin:$PATH"')
    expect(rc).toContain('alias ll="ls -la"')

    // Sound config should be in notify.sh instead
    const notifyTxt = await fs.readFile(NOTIFY, 'utf8')
    expect(notifyTxt).toContain('DEFAULT_CODEX_SOUND=')
  })

  it('removes commented markers from rc files (from intermediate fix version)', async () => {
    // Pre-populate .bashrc with commented markers (from the intermediate fix)
    const commentedContent = `# Some existing config
export PATH="/usr/local/bin:$PATH"

# >>> codex-1up >>>
# Notification sound
export CODEX_DISABLE_SOUND=0
export CODEX_CUSTOM_SOUND="/old/path/to/sound.wav"
# <<< codex-1up <<<

# More user config
alias ll="ls -la"
`
    await fs.writeFile(BASHRC, commentedContent, 'utf8')

    const ctx = makeCtx('noti_2.wav')
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)

    const rc = await fs.readFile(BASHRC, 'utf8')

    // Commented markers should also be removed
    expect(rc).not.toContain('# >>> codex-1up >>>')
    expect(rc).not.toContain('# <<< codex-1up <<<')
    expect(rc).not.toContain('CODEX_CUSTOM_SOUND')

    // User config preserved
    expect(rc).toContain('export PATH="/usr/local/bin:$PATH"')
    expect(rc).toContain('alias ll="ls -la"')
  })

  it('leaves clean rc files unchanged', async () => {
    const cleanContent = `# Clean bashrc
export PATH="/usr/local/bin:$PATH"
`
    await fs.writeFile(BASHRC, cleanContent, 'utf8')

    const ctx = makeCtx('noti_3.wav')
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)

    const rc = await fs.readFile(BASHRC, 'utf8')

    // Original content preserved exactly
    expect(rc).toBe(cleanContent)

    // No markers added
    expect(rc).not.toContain('codex-1up')
  })
})
