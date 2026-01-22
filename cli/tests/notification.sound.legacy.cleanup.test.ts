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
    installTools: 'skip',
    toolsSelected: undefined,
    notify: 'yes', globalAgents: 'skip',
    skills: 'skip', skillsSelected: undefined,
    webSearch: undefined,
    fileOpener: undefined,
    credentialsStore: undefined,
    enableTui2: false,
    tuiAlternateScreen: undefined,
    experimentalFeatures: undefined,
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

describe('legacy rc blocks are left untouched', () => {
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
