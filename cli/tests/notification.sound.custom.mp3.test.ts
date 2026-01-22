import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'
import { ensureNotifyHook } from '../src/installers/ensureNotifyHook'
import { setupNotificationSound } from '../src/installers/setupNotificationSound'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-mp3`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')
const NOTIFY = resolve(CH, 'notify.sh')
const CUSTOM_DIR = resolve(td, 'mysounds')
const CUSTOM_MP3 = resolve(CUSTOM_DIR, 'tone.mp3')

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
  await fs.mkdir(CUSTOM_DIR, { recursive: true })
  // write a tiny dummy header (not a real mp3, we won't play it in test)
  await fs.writeFile(CUSTOM_MP3, Buffer.from([0x49,0x44,0x33]))
  await fs.writeFile(CFG, '', 'utf8')
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('custom sound absolute mp3 path', () => {
  it('patches notify.sh default to custom mp3', async () => {
    const ctx = makeCtx(CUSTOM_MP3)
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)
    const notifyTxt = await fs.readFile(NOTIFY, 'utf8')
    expect(notifyTxt).toContain(`DEFAULT_CODEX_SOUND="${CUSTOM_MP3}`)
  })
})
