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
    profileScope: 'single',
    profileMode: 'add',
    setDefaultProfile: false,
    installCodexCli: 'yes',
    installTools: 'skip',
    toolsSelected: undefined,
    notify: 'yes',
    globalAgents: 'skip',
    notificationSound: undefined,
    skills: 'skip',
    skillsSelected: undefined,
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
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model\s*=\s*"gpt-5.2-codex"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_effort\s*=\s*"medium"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_summary\s*=\s*"detailed"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*web_search\s*=\s*"cached"/)
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
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model\s*=\s*"gpt-5.2-codex"/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_effort\s*=\s*"medium"/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_summary\s*=\s*"detailed"/)
    expect(data).not.toMatch(/\[profiles\.safe\][\s\S]*extra_key/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*web_search\s*=\s*"disabled"/)
    await cleanup()
  })

  it('sets the root profile when requested', async () => {
    const initial = `model = "gpt"\nprofile = "balanced"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'yolo'
    ctx.options.profileScope = 'single'
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

  it('migrates enable_experimental_windows_sandbox to experimental_windows_sandbox in [features]', async () => {
    const initial = `[features]\nenable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*experimental_windows_sandbox\s*=\s*true/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('drops enable_experimental_windows_sandbox if experimental_windows_sandbox is already present', async () => {
    const initial = `[features]\nexperimental_windows_sandbox = false\nenable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*experimental_windows_sandbox\s*=\s*false/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('migrates a legacy root enable_experimental_windows_sandbox into [features]', async () => {
    const initial = `enable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*experimental_windows_sandbox\s*=\s*true/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('migrates experimental_use_exec_command_tool to [features].shell_tool', async () => {
    const initial = `experimental_use_exec_command_tool = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*shell_tool\s*=\s*true/)
    expect(data).not.toMatch(/experimental_use_exec_command_tool/)
    await cleanup()
  })

  it('drops experimental_use_exec_command_tool if shell_tool is already set', async () => {
    const initial = `experimental_use_exec_command_tool = true\n[features]\nshell_tool = false\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*shell_tool\s*=\s*false/)
    expect(data).not.toMatch(/experimental_use_exec_command_tool/)
    await cleanup()
  })

  it('migrates multiple legacy root feature flags into [features]', async () => {
    const initial = [
      'experimental_use_unified_exec_tool = true',
      'include_apply_patch_tool = true',
      'experimental_use_freeform_apply_patch = true',
      'experimental_use_rmcp_client = false',
      '',
      '[features]',
      'web_search_request = true',
      ''
    ].join('\n')
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*web_search_request\s*=\s*true/)
    expect(data).toMatch(/\[features\][\s\S]*unified_exec\s*=\s*true/)
    expect(data).toMatch(/\[features\][\s\S]*apply_patch_freeform\s*=\s*true/)
    expect(data).toMatch(/\[features\][\s\S]*include_apply_patch_tool\s*=\s*true/)
    expect(data).not.toMatch(/experimental_use_unified_exec_tool/)
    // Root-level deprecated key removed; feature key remains.
    const prefix = data.split('[features]')[0] || ''
    expect(prefix).not.toMatch(/^include_apply_patch_tool\s*=/m)
    expect(data).not.toMatch(/experimental_use_rmcp_client/)
    await cleanup()
  })

  it('normalizes invalid model_reasoning_summary for *-codex models', async () => {
    const initial = [
      '[profiles.safe]',
      'model = "gpt-5.2-codex"',
      'model_reasoning_summary = "concise"',
      ''
    ].join('\n')
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_summary\s*=\s*"detailed"/)
    expect(data).not.toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_summary\s*=\s*"concise"/)
    await cleanup()
  })

  it('does not rewrite model_reasoning_summary for non-codex models', async () => {
    const initial = [
      '[profiles.safe]',
      'model = "gpt-5.2"',
      'model_reasoning_summary = "concise"',
      ''
    ].join('\n')
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model_reasoning_summary\s*=\s*"concise"/)
    await cleanup()
  })
})
