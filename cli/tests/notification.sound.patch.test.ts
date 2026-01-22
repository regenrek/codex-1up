import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'
import { ensureNotifyHook } from '../src/installers/ensureNotifyHook'
import { setupNotificationSound } from '../src/installers/setupNotificationSound'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-sound`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')
const NOTIFY = resolve(CH, 'notify.sh')

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

beforeAll(async () => { await fs.mkdir(CH, { recursive: true }); await fs.writeFile(CFG, '', 'utf8') })
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('notification sound patches notify.sh default', () => {
  it('sets DEFAULT_CODEX_SOUND to selected file', async () => {
    const ctx = makeCtx('noti_2.wav')
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)
    const data = await fs.readFile(NOTIFY, 'utf8')
    // Check that DEFAULT_CODEX_SOUND contains the expected sound file (path separators vary by OS)
    expect(data).toMatch(/^DEFAULT_CODEX_SOUND="/m)
    expect(data).toContain('.codex')
    expect(data).toContain('noti_2.wav')
  })
})
