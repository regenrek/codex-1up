import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallWizardInput } from '../src/flows/installWizard.js'

// Mock clack prompts; individual tests override behavior via closures.
const promptState: {
  selects: Array<(msg: string) => any>
  multiselects: Array<(msg: string) => any>
  texts: Array<(msg: string) => any>
  confirms: Array<(msg: string) => any>
} = { selects: [], multiselects: [], texts: [], confirms: [] }

vi.mock('@clack/prompts', () => {
  return {
    intro: vi.fn(),
    note: vi.fn(),
    outro: vi.fn(),
    cancel: vi.fn(),
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    isCancel: (v: any) => v === null,
    log: { info: vi.fn(), warn: vi.fn(), success: vi.fn() },
    confirm: vi.fn(async ({ message }: any) => {
      const fn = promptState.confirms.shift()
      return fn ? fn(String(message)) : true
    }),
    select: vi.fn(async ({ message, options }: any) => {
      const fn = promptState.selects.shift()
      const out = fn ? fn(String(message)) : undefined
      if (out !== undefined) return out
      return (options && options[0] && options[0].value) || null
    }),
    multiselect: vi.fn(async ({ message }: any) => {
      const fn = promptState.multiselects.shift()
      return fn ? fn(String(message)) : []
    }),
    text: vi.fn(async ({ message }: any) => {
      const fn = promptState.texts.shift()
      return fn ? fn(String(message)) : ''
    })
  }
})

vi.mock('zx', () => {
  return {
    which: vi.fn(async () => '/usr/bin/afplay'),
    $: vi.fn(async () => ({ stdout: '' }))
  }
})

vi.mock('../src/actions/selfUpdate.js', () => ({
  runSelfUpdate: vi.fn(async () => 'up-to-date')
}))

vi.mock('../src/actions/codex.js', () => ({
  getCodexStatus: vi.fn(async () => ({ found: true, version: '0.1.0', latest: '0.1.0', updateAvailable: false }))
}))

vi.mock('../src/actions/tools.js', () => ({
  getToolStatuses: vi.fn(async () => [{ id: 'rg', installed: true }]),
  isToolId: (v: any) => typeof v === 'string',
  getToolStatusesForCommand: vi.fn(),
  getToolStatusesForRepo: vi.fn(),
  getToolStatusesForShell: vi.fn()
}))

describe('runInstallWizard (extra coverage)', () => {
  beforeEach(() => {
    promptState.selects = []
    promptState.multiselects = []
    promptState.texts = []
    promptState.confirms = []
  })

  async function makeInput() {
    const repoRoot = await fs.mkdtemp(join(tmpdir(), 'codex-1up-wiz-'))
    await fs.mkdir(resolve(repoRoot, 'sounds'), { recursive: true })
    await fs.writeFile(resolve(repoRoot, 'sounds', 'noti_1.wav'), 'fake', 'utf8')
    await fs.mkdir(resolve(repoRoot, 'templates', 'agent-templates'), { recursive: true })
    await fs.writeFile(
      resolve(repoRoot, 'templates', 'agent-templates', 'AGENTS-default.md'),
      '# AGENTS\n\n## Rules\n\n- Be deterministic\n',
      'utf8'
    )
    const cliArgs: InstallWizardInput['cliArgs'] = {}
    return {
      repoRoot,
      isUnixLike: true,
      globalAgentsExists: true,
      currentProfile: 'balanced',
      seededProfile: 'balanced' as const,
      bundledSkills: [{ id: 'debug-lldb', description: 'debug', path: '/tmp/skill' }],
      availableTools: [{ id: 'rg', bins: ['rg'], packages: { brew: ['ripgrep'], apt: ['ripgrep'], dnf: ['ripgrep'], pacman: ['ripgrep'], zypper: ['ripgrep'] } }],
      cliArgs,
      selections: {
        profileChoice: 'balanced' as const,
        profileMode: 'add' as const,
        profileScope: 'single' as const,
        setDefaultProfile: false,
        profilesSelected: undefined,
        installTools: 'all' as const,
        toolsSelected: undefined,
        installCodexCli: 'no' as const,
        notifyAction: undefined,
        globalAgentsAction: undefined,
        notificationSound: undefined,
        skillsMode: 'skip' as const,
        skillsSelected: undefined,
        webSearch: 'skip',
        fileOpener: 'skip',
        credentialsStore: 'auto',
        scaffoldMcpServers: false,
        enableTui2: false,
        tuiAlternateScreen: 'skip',
        experimentalFeatures: undefined
      }
    }
  }

  it('covers tool selection back path and sound preview path', async () => {
    // Tools: select -> back -> skip
    promptState.selects.push((msg) => (msg.includes('Install/update developer tools') ? 'select' : undefined))
    promptState.multiselects.push(() => null) // back
    promptState.selects.push((msg) => (msg.includes('Install/update developer tools') ? 'skip' : undefined))

    // Profiles scope: choose "all"
    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'all' : undefined))
    // Profile mode
    promptState.selects.push((msg) => (msg.startsWith('How should we write all profiles') ? 'add' : undefined))
    // Default profile selection (multi-profile path)
    promptState.selects.push((msg) => (msg.includes('Select a default profile') ? 'balanced' : undefined))

    // Sound: pick noti_1.wav, then choose preview, then use
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'noti_1.wav' : undefined))
    promptState.selects.push((msg) => (msg.startsWith('Selected:') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.startsWith('Selected:') ? 'use' : undefined))

    // Global agents: preview then skip (exists=true)
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    // Skills: select then back then skip
    promptState.selects.push((msg) => (msg.includes('Install bundled Agent Skills') ? 'select' : undefined))
    promptState.multiselects.push(() => null) // back
    promptState.selects.push((msg) => (msg.includes('Install bundled Agent Skills') ? 'skip' : undefined))

    const input = await makeInput()
    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers custom sound path recursion and cancel path', async () => {
    const input = await makeInput()
    const custom1 = resolve(input.repoRoot, 'sounds', 'missing.wav')
    const custom2 = resolve(input.repoRoot, 'sounds', 'custom.wav')
    await fs.writeFile(custom2, 'fake', 'utf8')

    // Skip tool prompt by providing cliArgs.toolsArg
    input.cliArgs.toolsArg = 'skip'
    // Skip new advanced prompts so this test can focus on sound + cancellation behavior.
    input.cliArgs.fileOpenerArg = 'skip'
    input.cliArgs.credentialsStoreArg = 'skip'
    input.cliArgs.tui2Arg = false
    input.cliArgs.altScreenArg = 'skip'
    input.cliArgs.experimentalArg = 'skip'

    // Profiles: skip installing any profiles
    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'skip' : undefined))

    // Sound: choose custom, then provide missing path, then valid path, then use
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'custom' : undefined))
    promptState.texts.push(() => custom1)
    promptState.texts.push(() => custom2)
    promptState.selects.push((msg) => (msg.startsWith('Selected:') ? 'use' : undefined))

    // Global agents: return cancel (null) -> cancels wizard
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? null : undefined))

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).toBeNull()
    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers previewAgentsTemplate long preview and initialProfileValue fallback', async () => {
    const input = await makeInput()

    // Make template long enough to trigger "... (N more lines)".
    const longTemplate = [
      '# AGENTS',
      '',
      '## Section A',
      ...Array.from({ length: 60 }, (_, i) => `- line ${i + 1}`)
    ].join('\n')
    await fs.writeFile(resolve(input.repoRoot, 'templates', 'agent-templates', 'AGENTS-default.md'), longTemplate, 'utf8')

    // Force profileScope single and an unknown current profile so initialProfileValue falls back.
    input.selections.profileScope = 'single'
    input.currentProfile = 'not-a-profile'

    // Choose a single profile (covers the single-profile select path).
    promptState.selects.push((msg) => (msg.includes('Choose a Codex profile to install') ? 'safe' : undefined))
    // Mode prompt for single profile
    promptState.selects.push((msg) => (msg.startsWith('How should we write profiles.safe') ? 'overwrite' : undefined))
    // Confirm default profile for single profile
    promptState.confirms.push(() => true)

    // Sound: choose none, preview, then use
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'none' : undefined))
    promptState.selects.push((msg) => (msg.startsWith('Selected:') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.startsWith('Selected:') ? 'use' : undefined))

    // Global agents: preview (triggers long preview), then skip
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers previewAgentsTemplate missing/empty warnings', async () => {
    const input = await makeInput()

    // Remove template to trigger "not found" warning.
    await fs.rm(resolve(input.repoRoot, 'templates', 'agent-templates', 'AGENTS-default.md'), { force: true })

    // Skip tools prompt by providing cliArgs.toolsArg
    input.cliArgs.toolsArg = 'skip'
    // Profiles: skip any profile changes
    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'skip' : undefined))
    // Sound: skip
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'skip' : undefined))
    // Global agents: preview then skip (preview should warn about missing template)
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res1 = await runInstallWizard(input as any)
    expect(res1).not.toBeNull()

    // Now create an empty template to trigger "empty" warning.
    await fs.mkdir(resolve(input.repoRoot, 'templates', 'agent-templates'), { recursive: true })
    await fs.writeFile(resolve(input.repoRoot, 'templates', 'agent-templates', 'AGENTS-default.md'), '\n', 'utf8')

    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'skip' : undefined))
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'skip' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'preview' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    const res2 = await runInstallWizard(input as any)
    expect(res2).not.toBeNull()

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers Codex CLI install/update decision branches', async () => {
    const input = await makeInput()

    // Force tools prompt to be skipped for deterministic prompt ordering.
    input.cliArgs.toolsArg = 'skip'

    const codex = await import('../src/actions/codex.js')
    const getCodexStatus = codex.getCodexStatus as unknown as ReturnType<typeof vi.fn>

    // First run: Codex not detected -> prompt install -> user says no.
    getCodexStatus.mockResolvedValueOnce({ found: false })
    promptState.confirms.push((msg) => (msg.includes('Codex CLI not found. Install now?') ? false : true))

    // Profiles: skip any profile changes
    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'skip' : undefined))
    // Sound: skip
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'skip' : undefined))
    // Global agents: skip
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res1 = await runInstallWizard(input as any)
    expect(res1).not.toBeNull()

    // Second run: Codex detected but update available -> prompt update -> user says no.
    getCodexStatus.mockResolvedValueOnce({ found: true, version: '0.1.0', latest: '0.2.0', updateAvailable: true })
    promptState.confirms.push((msg) => (msg.includes('Update now?') ? false : true))

    promptState.selects.push((msg) => (msg.includes('Install all profiles') ? 'skip' : undefined))
    promptState.selects.push((msg) => (msg === 'Notification sound' ? 'skip' : undefined))
    promptState.selects.push((msg) => (msg.includes('Global ~/.codex/AGENTS.md') ? 'skip' : undefined))

    const res2 = await runInstallWizard(input as any)
    expect(res2).not.toBeNull()

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers advanced prompts selections (web search, opener, creds, tui2, alt-screen, experimental)', async () => {
    const input = await makeInput()
    input.cliArgs.toolsArg = 'skip'

    // Profiles scope: choose "selected" and pick yolo only.
    promptState.selects.push(() => 'selected')
    promptState.multiselects.push(() => ['yolo'])

    // Profile write mode (single selected profile -> profiles.yolo message)
    promptState.selects.push(() => 'overwrite')

    // Advanced prompts (order matters)
    promptState.selects.push(() => 'live')    // web search
    promptState.selects.push(() => 'cursor')  // file opener
    promptState.selects.push(() => 'auto')    // credential store
    promptState.confirms.push(() => true)     // enable TUI2
    promptState.selects.push(() => 'never')   // alternate screen
    promptState.multiselects.push(() => ['collaboration-modes', 'multi-agents'])

    // Default profile confirm (single selected profile)
    promptState.confirms.push(() => true)

    // Sound: skip
    promptState.selects.push(() => 'skip')

    // Global agents: skip
    promptState.selects.push(() => 'skip')

    // Skills: skip
    promptState.selects.push(() => 'skip')

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    expect(res!.selections.webSearch).toBe('live')
    expect(res!.selections.fileOpener).toBe('cursor')
    expect(res!.selections.credentialsStore).toBe('auto')
    expect(res!.selections.enableTui2).toBe(true)
    expect(res!.selections.tuiAlternateScreen).toBe('never')
    expect(res!.selections.experimentalFeatures).toEqual(['collaboration-modes', 'multi-agents'])

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers multi-profile default selection (skip keeping current default)', async () => {
    const input = await makeInput()
    input.cliArgs.toolsArg = 'skip'

    // Skip advanced prompts to keep ordering simple.
    input.cliArgs.webSearchArg = 'skip'
    input.cliArgs.fileOpenerArg = 'skip'
    input.cliArgs.credentialsStoreArg = 'skip'
    input.cliArgs.tui2Arg = false
    input.cliArgs.altScreenArg = 'skip'
    input.cliArgs.experimentalArg = 'skip'

    // Profiles scope: choose selected and pick two profiles.
    promptState.selects.push(() => 'selected')
    promptState.multiselects.push(() => ['balanced', 'safe'])
    // Mode prompt for selected profiles (>1)
    promptState.selects.push(() => 'add')
    // Default profile selection prompt (multi-profile branch) -> skip
    promptState.selects.push(() => 'skip')

    // Sound: skip
    promptState.selects.push(() => 'skip')
    // Global agents: skip
    promptState.selects.push(() => 'skip')
    // Skills: skip
    promptState.selects.push(() => 'skip')

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    expect(res!.selections.setDefaultProfile).toBe(false)

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers non-unixlike tools path (forces installTools=skip)', async () => {
    const input = await makeInput()
    input.isUnixLike = false

    // Profiles: don't install any profiles to keep ordering small.
    promptState.selects.push(() => 'skip')
    // Sound: skip
    promptState.selects.push(() => 'skip')
    // Global agents: skip
    promptState.selects.push(() => 'skip')

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    expect(res!.selections.installTools).toBe('skip')

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers global AGENTS create path and skills=all', async () => {
    const input = await makeInput()
    input.cliArgs.toolsArg = 'skip'
    input.globalAgentsExists = false
    input.cliArgs.fileOpenerArg = 'skip'
    input.cliArgs.credentialsStoreArg = 'skip'
    input.cliArgs.tui2Arg = false
    input.cliArgs.altScreenArg = 'skip'
    input.cliArgs.experimentalArg = 'skip'

    // Profiles: skip all
    promptState.selects.push(() => 'skip')
    // Sound: skip
    promptState.selects.push(() => 'skip')
    // Global agents: create starter
    promptState.selects.push(() => 'create-default')
    // Skills: all
    promptState.selects.push(() => 'all')

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    expect(res!.selections.globalAgentsAction).toBe('create-default')
    expect(res!.selections.skillsMode).toBe('all')

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })

  it('covers global AGENTS append path and skills select empty => skip', async () => {
    const input = await makeInput()
    input.cliArgs.toolsArg = 'skip'
    input.globalAgentsExists = true

    // Profiles: skip all
    promptState.selects.push(() => 'skip')
    // Sound: skip
    promptState.selects.push(() => 'skip')
    // Global agents: append
    promptState.selects.push(() => 'append-default')
    // Skills: select, then choose nothing
    promptState.selects.push(() => 'select')
    promptState.multiselects.push(() => [])

    const { runInstallWizard } = await import('../src/flows/installWizard.js')
    const res = await runInstallWizard(input as any)
    expect(res).not.toBeNull()
    expect(res!.selections.globalAgentsAction).toBe('append-default')
    expect(res!.selections.skillsMode).toBe('skip')
    expect(res!.selections.skillsSelected).toBeUndefined()

    await fs.rm(input.repoRoot, { recursive: true, force: true })
  })
})

