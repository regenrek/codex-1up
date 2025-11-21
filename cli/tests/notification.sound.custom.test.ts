import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'
import { ensureNotifyHook } from '../src/installers/ensureNotifyHook'
import { setupNotificationSound } from '../src/installers/setupNotificationSound'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-custom`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')
const NOTIFY = resolve(CH, 'notify.sh')
const CUSTOM_DIR = resolve(td, 'mysounds')
const CUSTOM_WAV = resolve(CUSTOM_DIR, 'my.wav')

const logger: Logger = { log:()=>{}, info:()=>{}, ok:()=>{}, warn:()=>{}, err:()=>{} }

function makeCtx(sound: string): InstallerContext {
  const options: InstallerOptions = {
    profile: 'balanced', profileMode: 'add', setDefaultProfile: false,
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
  await fs.mkdir(CUSTOM_DIR, { recursive: true })
  // write a tiny wav header (not played in test)
  await fs.writeFile(CUSTOM_WAV, Buffer.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x41,0x56,0x45]))
  await fs.writeFile(CFG, '', 'utf8')
})
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('custom sound absolute path', () => {
  it('writes rc and patches notify.sh default to custom file', async () => {
    const ctx = makeCtx(CUSTOM_WAV)
    await ensureNotifyHook(ctx)
    await setupNotificationSound(ctx)
    const rc = await fs.readFile(resolve(td, '.bashrc'), 'utf8').catch(()=>'')
    expect(rc).toMatch(new RegExp(CUSTOM_WAV.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')))
    const notifyTxt = await fs.readFile(NOTIFY, 'utf8')
    expect(notifyTxt).toMatch(new RegExp(`^DEFAULT_CODEX_SOUND=\"${CUSTOM_WAV.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}\"`, 'm'))
  })
})
