import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import * as TOML from 'toml'
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
  it('adds MiniMax presets without replacing an existing provider URL', async () => {
    const initial = `[model_providers.minimax_global]\nbase_url = "https://custom.minimax.invalid/v1"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = TOML.parse(await fs.readFile(cfgPath, 'utf8')) as any

    expect(data.model_providers.minimax_global.base_url).toBe('https://custom.minimax.invalid/v1')
    expect(data.model_providers.minimax_global.env_key).toBe('MINIMAX_API_KEY')
    expect(data.model_providers.minimax_global.wire_api).toBe('responses')
    expect(data.model_providers.minimax_cn.base_url).toBe('https://api.minimaxi.com/v1')
    expect(data.profiles['minimax-global-m3'].model).toBe('MiniMax-M3')
    expect(data.profiles['minimax-cn-m2-7'].model_context_window).toBe(204800)
    await cleanup()
  })

  it('adds missing profile keys in add mode without removing custom values', async () => {
    const initial = `# existing config\n[profiles.balanced]\napproval_policy = "custom"\n\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'balanced'
    ctx.options.profileMode = 'add'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*approval_policy\s*=\s*"custom"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*sandbox_mode\s*=\s*"workspace-write"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model\s*=\s*"gpt-5.3-codex"/)
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_effort\s*=\s*"high"/)
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
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*approval_policy\s*=\s*"untrusted"/)
    expect(data).toMatch(/\[profiles\.safe\][\s\S]*model\s*=\s*"gpt-5.3-codex"/)
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

  it('migrates model_personality to personality at root', async () => {
    const initial = `model = "gpt-5.3-codex"\nmodel_personality = "friendly"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/personality\s*=\s*"friendly"/)
    expect(data).not.toMatch(/model_personality\s*=/)
    await cleanup()
  })

  it('does not migrate invalid model_personality values', async () => {
    const initial = `model = "gpt-5.3-codex"\nmodel_personality = "verbose"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).not.toMatch(/^\s*personality\s*=/m)
    expect(data).toMatch(/model_personality\s*=\s*"verbose"/)
    await cleanup()
  })

  it('disables reasoning summaries for *-codex-spark models', async () => {
    const initial = `[profiles.balanced]\nmodel = "gpt-5.3-codex-spark"\nmodel_reasoning_summary = "detailed"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_summary\s*=\s*"none"/)
    await cleanup()
  })

  it('disables reasoning summaries for *-codex-spark models with single-quoted strings', async () => {
    const initial = `[profiles.balanced]\nmodel = 'gpt-5.3-codex-spark'\nmodel_reasoning_summary = 'detailed'\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[profiles\.balanced\][\s\S]*model_reasoning_summary\s*=\s*"none"/)
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

  it('removes legacy windows sandbox flags from [features]', async () => {
    const initial = `[features]\nenable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\]/)
    expect(data).not.toMatch(/\bexperimental_windows_sandbox\s*=/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('removes both legacy and removed windows sandbox flags when both are present', async () => {
    const initial = `[features]\nexperimental_windows_sandbox = false\nenable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\]/)
    expect(data).not.toMatch(/\bexperimental_windows_sandbox\s*=/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('drops root-level legacy windows sandbox flag without rewriting it to [features]', async () => {
    const initial = `enable_experimental_windows_sandbox = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).not.toMatch(/\[features\][\s\S]*experimental_windows_sandbox\s*=/)
    expect(data).not.toMatch(/\[features\][\s\S]*enable_experimental_windows_sandbox\s*=/)
    expect(data).not.toMatch(/enable_experimental_windows_sandbox/)
    await cleanup()
  })

  it('migrates legacy collab feature key to multi_agent', async () => {
    const initial = `[features]\ncollab = true\n\n[profiles.safe.features]\ncollab = false\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*multi_agent\s*=\s*true/)
    expect(data).toMatch(/\[profiles\.safe\.features\][\s\S]*multi_agent\s*=\s*false/)
    expect(data).not.toMatch(/\bcollab\s*=/)
    await cleanup()
  })

  it('migrates root collab to [features].multi_agent', async () => {
    const initial = `collab = true\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*multi_agent\s*=\s*true/)
    expect(data).not.toMatch(/\bcollab\s*=/)
    await cleanup()
  })

  it('drops root collab when [features].multi_agent already exists', async () => {
    const initial = `collab = true\n\n[features]\nmulti_agent = false\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*multi_agent\s*=\s*false/)
    expect(data).not.toMatch(/\bcollab\s*=/)
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
    expect(data).not.toMatch(/experimental_use_unified_exec_tool/)
    expect(data).not.toMatch(/\binclude_apply_patch_tool\s*=/)
    expect(data).not.toMatch(/experimental_use_rmcp_client/)
    await cleanup()
  })

  it('prunes removed feature keys from root and feature tables', async () => {
    const initial = [
      'search_tool = true',
      'remote_models = true',
      '',
      '[features]',
      'search_tool = true',
      'request_rule = true',
      'experimental_windows_sandbox = true',
      'elevated_windows_sandbox = true',
      'remote_models = true',
      'unified_exec = false',
      '',
      '[profiles.safe.features]',
      'search_tool = true',
      'remote_models = true',
      'apps = true',
      ''
    ].join('\n')
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).not.toMatch(/\bsearch_tool\s*=/)
    expect(data).not.toMatch(/\brequest_rule\s*=/)
    expect(data).not.toMatch(/\bexperimental_windows_sandbox\s*=/)
    expect(data).not.toMatch(/\belevated_windows_sandbox\s*=/)
    expect(data).not.toMatch(/\bremote_models\s*=/)
    expect(data).toMatch(/\[features\][\s\S]*unified_exec\s*=\s*false/)
    expect(data).toMatch(/\[profiles\.safe\.features\][\s\S]*apps\s*=\s*true/)
    await cleanup()
  })

  it('prunes include_apply_patch_tool from profile feature tables', async () => {
    const initial = [
      '[profiles.safe.features]',
      'include_apply_patch_tool = true',
      'apps = true',
      ''
    ].join('\n')
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).not.toMatch(/\binclude_apply_patch_tool\s*=/)
    expect(data).toMatch(/\[profiles\.safe\.features\][\s\S]*apps\s*=\s*true/)
    await cleanup()
  })

  it('does not rewrite model_reasoning_summary for non-spark codex models', async () => {
    const initial = [
      '[profiles.safe]',
      'model = "gpt-5.3-codex"',
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

  it('writes experimental feature toggles to root [features] when no profiles are targeted', async () => {
    const initial = `# config\nprofile = "balanced"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    ctx.options.profileScope = 'selected'
    ctx.options.profilesSelected = []
    ctx.options.experimentalFeatures = ['apps']
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*apps\s*=\s*true/)
    await cleanup()
  })

  it('maps legacy sub-agents toggle to features.multi_agent', async () => {
    const initial = `# config\nprofile = "balanced"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    ctx.options.profileScope = 'selected'
    ctx.options.profilesSelected = []
    ctx.options.experimentalFeatures = ['sub-agents']
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/\[features\][\s\S]*multi_agent\s*=\s*true/)
    expect(data).not.toMatch(/\bcollab\s*=/)
    await cleanup()
  })

  it('writes suppress_unstable_features_warning when requested (Codex >= 0.92)', async () => {
    const initial = `# config\nprofile = "balanced"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    ctx.options.suppressUnstableWarning = true
    ctx.codexVersion = '0.92.0'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/suppress_unstable_features_warning\s*=\s*true/)
    await cleanup()
  })

  it('does not write suppress_unstable_features_warning on older Codex when key is absent', async () => {
    const initial = `# config\nprofile = "balanced"\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    ctx.options.suppressUnstableWarning = true
    ctx.codexVersion = '0.91.9'
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).not.toMatch(/suppress_unstable_features_warning\s*=/)
    await cleanup()
  })

  it('updates suppress_unstable_features_warning if the key already exists', async () => {
    const initial = `suppress_unstable_features_warning = false\n`
    const { ctx, cfgPath, cleanup } = await setupContext(initial)
    ctx.options.profile = 'skip'
    ctx.options.suppressUnstableWarning = true
    ctx.codexVersion = undefined
    await writeCodexConfig(ctx)
    const data = await fs.readFile(cfgPath, 'utf8')
    expect(data).toMatch(/suppress_unstable_features_warning\s*=\s*true/)
    await cleanup()
  })
})
