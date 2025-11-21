import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'
import { writeCodexConfig } from '../src/installers/writeCodexConfig'

const logger: Logger = { log: () => {}, info: () => {}, ok: () => {}, warn: () => {}, err: () => {} }
const repoRoot = resolve(__dirname, '../../')

function makeOptions(overrides: Partial<InstallerOptions> = {}): InstallerOptions {
  return {
    profile: 'balanced',
    profileMode: 'add',
    setDefaultProfile: false,
    installCodexCli: 'yes',
    installTools: 'no',
    notify: 'yes',
    globalAgents: 'skip',
    notificationSound: undefined,
    mode: 'manual',
    installNode: 'skip',
    shell: 'auto',
    vscodeId: undefined,
    noVscode: true,
    agentsMd: undefined,
    dryRun: false,
    assumeYes: true,
    skipConfirmation: true,
    ...overrides
  }
}

async function setupContext(initial: string) {
  const homeDir = await fs.mkdtemp(join(tmpdir(), 'codex-1up-config-'))
  const codexDir = join(homeDir, '.codex')
  await fs.mkdir(codexDir, { recursive: true })
  const cfgPath = join(codexDir, 'config.toml')
  await fs.writeFile(cfgPath, initial, 'utf8')
  const ctx: InstallerContext = {
    cwd: homeDir,
    homeDir,
    rootDir: repoRoot,
    logDir: codexDir,
    logFile: join(codexDir, 'install.log'),
    options: makeOptions(),
    logger
  }
  return { ctx, cfgPath, cleanup: async () => fs.rm(homeDir, { recursive: true, force: true }) }
}

describe('writeCodexConfig targeted patches', () => {
  it('adds missing profile keys in add mode without removing custom values', async () => {
    const initial = `# existing config\n[profiles.balanced]\napproval_policy = "custom"\n\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'balanced'
    ctx.options.profileMode = 'add'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*approval_policy\s*=\s*"custom"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*sandbox_mode\s*=\s*"workspace-write"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model\s*=\s*"gpt-5.1-codex-max"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_effort\s*=\s*"medium"/)
    expect(data).toMatch(/\[profiles\.balanced\.features\][\s\S]*web_search_request\s*=\s*true/)
    await cleanup()
  })

  it('overwrites codex profiles when requested', async () => {
    const initial = `# config\n[profiles.safe]\napproval_policy = "custom"\nextra_key = 1\n\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'safe'
    ctx.options.profileMode = 'overwrite'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*approval_policy\s*=\s*"on-failure"/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model\s*=\s*"gpt-5.1-codex-max"/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_effort\s*=\s*"medium"/)
    expect(data).not.toMatch(/\[profiles\.safe\][\s\S]*extra_key/)
    expect(data).toMatch(/\[profiles\.safe\.features\][\s\S]*web_search_request\s*=\s*false/)
    await cleanup()
  })

  it('sets the root profile when requested', async () => {
    const initial = `model = "gpt"\nprofile = "minimal"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'yolo'
    ctx.options.profileMode = 'add'
    ctx.options.setDefaultProfile = true
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/profile\s*=\s*"yolo"/)
    await cleanup()
  })

  it('keeps custom notifications list when enabling sound', async () => {
    const initial = `[tui]\nnotifications = ["agent-turn-complete"]\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.notificationSound = 'noti.wav'
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toContain('notifications = ["agent-turn-complete"]')
    await cleanup()
  })

  it('enables tui.notifications when previously false', async () => {
    const initial = `[tui]\nnotifications = false\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.notificationSound = 'ding.wav'
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[tui\][\s\S]*notifications\s*=\s*true/)
    await cleanup()
  })
})
