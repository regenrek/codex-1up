import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { ensureNotifyHook } from '../src/installers/ensureNotifyHook'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-notify`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')

const logger: Logger = {
  log: () => {}, info: () => {}, ok: () => {}, warn: () => {}, err: () => {}
}

function makeCtx(): InstallerContext {
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
    notificationSound: 'none'
  }
  return {
    cwd: td,
    homeDir: td,
    rootDir: resolve(__dirname, '../../'),
    logDir: CH,
    logFile: resolve(CH, 'log.txt'),
    options,
    logger
  }
}

beforeAll(async () => {
  await fs.mkdir(CH, { recursive: true })
  // Seed a problematic config with stray root notifications and a features table
  const seed = `# Seed config with bad notifications placement\nnotifications = false\n\n[tui]\nnotifications = false\n\n[features]\nweb_search_request = true\n\n[profiles.yolo]\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n[profiles.yolo.features]\nweb_search_request = true\n`
  await fs.writeFile(CFG, seed, 'utf8')
})

afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('config notify normalization', () => {
  it('moves notifications under [tui] and removes root duplicate', async () => {
    const ctx = makeCtx()
    await ensureNotifyHook(ctx)
    const data = await fs.readFile(CFG, 'utf8')
    // Scan tables and assert no bare notifications outside [tui]
    const lines = data.split(/\r?\n/)
    let current = ''
    let sawTuiNotifications = false
    for (const ln of lines) {
      const m = ln.match(/^\s*\[([^\]]+)\]\s*$/)
      if (m) { current = m[1]; continue }
      if (/^\s*notifications\s*=/.test(ln)) {
        expect(current).toBe('tui')
        sawTuiNotifications = true
      }
    }
    expect(sawTuiNotifications).toBe(true)
  })
})
