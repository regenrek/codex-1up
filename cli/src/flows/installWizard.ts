import { promises as fs } from 'fs'
import { resolve } from 'path'
import * as p from '@clack/prompts'
import { $, which } from 'zx'
import { runSelfUpdate } from '../actions/selfUpdate.js'
import { getCodexStatus } from '../actions/codex.js'
import { getToolStatuses, isToolId, type ToolDefinition } from '../actions/tools.js'
import type {
  GlobalAgentsAction,
  CredentialsStoreChoice,
  ExperimentalFeature,
  FileOpenerChoice,
  InstallCodexCliChoice,
  InstallToolsChoice,
  NotifyAction,
  Profile,
  ProfileMode,
  ProfileScope,
  ProfileSelection,
  SkillsInstallMode,
  TuiAltScreenChoice,
  ToolId
} from '../installers/types.js'
import type { BundledSkill } from '../actions/skills.js'

export interface InstallSelections {
  profileChoice: ProfileSelection
  profileMode: ProfileMode
  profileScope: ProfileScope
  setDefaultProfile: boolean
  profilesSelected?: Profile[] | undefined
  installTools: InstallToolsChoice
  toolsSelected?: ToolId[] | undefined
  installCodexCli: InstallCodexCliChoice
  notifyAction: NotifyAction | undefined
  globalAgentsAction: GlobalAgentsAction | undefined
  notificationSound?: string | undefined
  skillsMode: SkillsInstallMode
  skillsSelected?: string[] | undefined
  webSearch?: 'disabled' | 'cached' | 'live' | 'skip' | undefined
  fileOpener?: FileOpenerChoice | undefined
  credentialsStore?: CredentialsStoreChoice | undefined
  enableTui2: boolean
  tuiAlternateScreen?: TuiAltScreenChoice | undefined
  experimentalFeatures?: ExperimentalFeature[] | undefined
}

export interface InstallWizardInput {
  repoRoot: string
  isUnixLike: boolean
  globalAgentsExists: boolean
  currentProfile?: string
  seededProfile: Profile
  bundledSkills: BundledSkill[]
  availableTools: ToolDefinition[]
  cliArgs: {
    profileChoice?: ProfileSelection
    profileMode?: ProfileMode
    profileScope?: ProfileScope
    soundArg?: string
    toolsArg?: string
    skillsArg?: string
    webSearchArg?: string
    fileOpenerArg?: string
    credentialsStoreArg?: string
    tui2Arg?: boolean
    altScreenArg?: string
    experimentalArg?: string
  }
  selections: InstallSelections
}

export interface InstallWizardResult {
  selections: InstallSelections
}

const ALL_PROFILES = ['balanced', 'safe', 'yolo'] as const

export async function runInstallWizard(input: InstallWizardInput): Promise<InstallWizardResult | null> {
  const {
    repoRoot,
    isUnixLike,
    globalAgentsExists,
    currentProfile,
    seededProfile,
    bundledSkills,
    availableTools,
    cliArgs
  } = input

  let {
    profileChoice,
    profileMode,
    profileScope,
    setDefaultProfile,
    profilesSelected,
    installTools,
    toolsSelected,
    installCodexCli,
    notifyAction,
    globalAgentsAction,
    notificationSound,
    skillsMode,
    skillsSelected,
    webSearch,
    fileOpener,
    credentialsStore,
    enableTui2,
    tuiAlternateScreen,
    experimentalFeatures
  } = input.selections

  const wizardLogger = {
    log: (msg: string) => p.log.info(msg),
    info: (msg: string) => p.log.info(msg),
    ok: (msg: string) => p.log.success(msg),
    warn: (msg: string) => p.log.warn(msg),
    err: (msg: string) => p.log.warn(msg)
  }

  await runSelfUpdate({
    interactive: true,
    assumeYes: false,
    skipConfirmation: false,
    dryRun: false,
    logger: wizardLogger
  })

  const codexStatus = await getCodexStatus()
  if (codexStatus.found) {
    const versionLabel = codexStatus.version ? `v${codexStatus.version}` : 'unknown version'
    if (codexStatus.latest) {
      if (codexStatus.updateAvailable) {
        p.log.info(`Codex CLI detected (${versionLabel}). Newer version available: v${codexStatus.latest}.`)
      } else {
        p.log.info(`Codex CLI detected (${versionLabel}). Latest: v${codexStatus.latest}.`)
      }
    } else {
      p.log.info(`Codex CLI detected (${versionLabel}).`)
    }
  } else {
    p.log.info('Codex CLI not detected.')
  }

  if (installCodexCli === 'no') {
    if (!codexStatus.found) {
      p.log.info('Codex CLI install disabled by --codex-cli no.')
    } else if (codexStatus.updateAvailable) {
      p.log.info('Codex CLI update disabled by --codex-cli no.')
    }
  } else if (installCodexCli === 'auto') {
    if (!codexStatus.found) {
      const answer = await p.confirm({
        message: 'Codex CLI not found. Install now?',
        initialValue: true
      })
      if (p.isCancel(answer)) return cancelWizard()
      installCodexCli = answer ? 'yes' : 'no'
    } else if (codexStatus.updateAvailable) {
      const answer = await p.confirm({
        message: `Codex CLI ${codexStatus.version} found; latest is ${codexStatus.latest}. Update now?`,
        initialValue: true
      })
      if (p.isCancel(answer)) return cancelWizard()
      installCodexCli = answer ? 'yes' : 'no'
    }
  }

  if (isUnixLike && !cliArgs.toolsArg) {
    const toolStatuses = await getToolStatuses()
    const installed = toolStatuses.filter(t => t.installed).map(t => t.id)
    const missing = toolStatuses.filter(t => !t.installed).map(t => t.id)
    p.log.info(`Tools detected: ${installed.join(', ') || 'none'}`)
    if (missing.length) {
      p.log.info(`Missing tools: ${missing.join(', ')}`)
    }

    while (true) {
      const toolsMode = await p.select({
        message: 'Install/update developer tools',
        options: [
          { label: 'Install/Update all', value: 'all' },
          { label: 'Select', value: 'select' },
          { label: 'Skip', value: 'skip' }
        ],
        initialValue: 'all'
      }) as 'skip'|'all'|'select'
      if (p.isCancel(toolsMode)) return cancelWizard()
      installTools = toolsMode
      if (toolsMode !== 'select') {
        toolsSelected = undefined
        break
      }

      p.log.info('Tip: press Esc to go back.')
      const picked = await multiselectWithBack({
        message: 'Select tools to install',
        options: availableTools.map(tool => {
          const isInstalled = installed.includes(tool.id)
          return {
            label: tool.id,
            value: tool.id,
            hint: isInstalled ? 'installed' : 'missing'
          }
        })
      })
      if (picked === 'back') continue
      const chosen = Array.isArray(picked)
        ? picked.map(s => String(s).trim().toLowerCase()).filter(isToolId)
        : []
      if (chosen.length === 0) {
        installTools = 'skip'
        toolsSelected = undefined
      } else {
        toolsSelected = Array.from(new Set(chosen))
      }
      break
    }
  } else if (!isUnixLike && !cliArgs.toolsArg) {
    installTools = 'skip'
    toolsSelected = undefined
  }

  const profileOptions = [
    { label: 'Balanced (recommended)', value: 'balanced', hint: 'on-request approvals · workspace-write · web search on' },
    { label: 'Safe', value: 'safe', hint: 'on-failure approvals · read-only · web search off' },
    { label: 'YOLO', value: 'yolo', hint: 'never approvals · danger-full-access · gpt-5.2-codex' }
  ] as const

  if (!cliArgs.profileScope) {
    while (true) {
      const scopeResponse = await p.select({
        message: 'Install all profiles (balanced, safe, yolo)?',
        options: [
          { label: 'Yes — install/update all profiles', value: 'all' },
          { label: 'Choose profiles…', value: 'selected' },
          { label: 'No — don\'t install any profiles', value: 'skip' }
        ],
        initialValue: 'all'
      }) as 'single'|'all'|'selected'|'skip'
      if (p.isCancel(scopeResponse)) return cancelWizard()
      if (scopeResponse === 'skip') {
        profileScope = 'selected'
        profilesSelected = []
        profileChoice = 'skip'
        break
      }
      if (scopeResponse !== 'selected') {
        profileScope = scopeResponse
        break
      }

      p.log.info('Tip: press Esc to go back.')
      const picked = await multiselectWithBack({
        message: 'Select profiles to install',
        options: profileOptions.map(opt => ({ label: opt.label, value: opt.value, hint: opt.hint }))
      })
      if (picked === 'back') continue
      const chosen = Array.isArray(picked)
        ? picked.map(s => String(s).trim().toLowerCase()).filter(isProfile)
        : []
      const unique = Array.from(new Set(chosen))
      profileScope = 'selected'
      if (unique.length === 0) {
        profilesSelected = []
        profileChoice = 'skip'
      } else {
        profilesSelected = unique
      }
      break
    }
  }

  if (profileScope !== 'all' && !cliArgs.profileChoice) {
    p.log.info([
      'Profiles:',
      '  - Balanced: on-request approvals, workspace-write sandbox, web search on.',
      '  - Safe: on-failure approvals, read-only sandbox, web search off.',
      '  - YOLO: never approvals, danger-full-access, gpt-5.2-codex, high reasoning.'
    ].join('\n'))
  }

  if (profileScope === 'single') {
    if (!cliArgs.profileChoice) {
      const profileResponse = await p.select({
        message: 'Choose a Codex profile to install',
        options: [
          ...profileOptions,
          { label: 'Skip (no profile changes)', value: 'skip' as const }
        ],
        initialValue: initialProfileValue(currentProfile)
      }) as 'balanced'|'safe'|'yolo'|'skip'
      if (p.isCancel(profileResponse)) return cancelWizard()
      profileChoice = profileResponse
    }
  } else if (profileScope === 'selected') {
    if (profilesSelected === undefined) {
      p.log.info('Tip: press Esc to go back.')
      const picked = await multiselectWithBack({
        message: 'Select profiles to install',
        options: profileOptions.map(opt => ({ label: opt.label, value: opt.value, hint: opt.hint }))
      })
      if (picked === 'back') {
        profilesSelected = []
        profileChoice = 'skip'
      } else {
        const chosen = Array.isArray(picked)
          ? picked.map(s => String(s).trim().toLowerCase()).filter(isProfile)
          : []
        const unique = Array.from(new Set(chosen))
        if (unique.length === 0) {
          profilesSelected = []
          profileChoice = 'skip'
        } else {
          profilesSelected = unique
        }
      }
    }
    if ((profilesSelected || []).length > 0) {
      if (isProfile(profileChoice) && !profilesSelected!.includes(profileChoice)) {
        profileChoice = profilesSelected![0]
      }
    }
  } else if (profileScope === 'all' && profileChoice === 'skip') {
    profileChoice = seededProfile
  }

  const selectedProfiles = profileScope === 'all'
    ? [...ALL_PROFILES]
    : profileScope === 'selected'
      ? (profilesSelected || [])
      : (profileChoice === 'skip' ? [] : [profileChoice])

  const needMode = selectedProfiles.length > 0
  if (needMode && !cliArgs.profileMode) {
    const modeResponse = await p.select({
      message: profileScope === 'all'
        ? 'How should we write all profiles?'
        : selectedProfiles.length > 1
          ? 'How should we write selected profiles?'
          : `How should we write profiles.${selectedProfiles[0]}?`,
      options: [
        { label: 'Overwrite (use codex-1up defaults)', value: 'overwrite' },
        { label: 'Add Merge (add missing, keep your default settings)', value: 'add' }
      ],
      initialValue: profileMode
    }) as 'add'|'overwrite'
    if (p.isCancel(modeResponse)) return cancelWizard()
    profileMode = modeResponse
  }

  // --- Advanced config options (Codex v0.88 config keys) -------------------

  if (selectedProfiles.length > 0 && !cliArgs.webSearchArg) {
    const ws = await p.select({
      message: 'Web search mode (for selected profiles)',
      options: [
        { label: 'Skip (leave unchanged)', value: 'skip' },
        { label: 'Disabled', value: 'disabled', hint: 'no web search tool calls' },
        { label: 'Cached', value: 'cached', hint: 'no network; may use cached results' },
        { label: 'Live', value: 'live', hint: 'requires sandbox network access' }
      ],
      initialValue: (webSearch && webSearch !== 'skip') ? webSearch : 'live'
    }) as 'disabled' | 'cached' | 'live' | 'skip'
    if (p.isCancel(ws)) return cancelWizard()
    webSearch = ws
  }

  if (!cliArgs.fileOpenerArg) {
    const opener = await p.select({
      message: 'Citation file opener (optional)',
      options: [
        { label: 'Skip (leave unchanged)', value: 'skip' },
        { label: 'Cursor', value: 'cursor' },
        { label: 'VS Code', value: 'vscode' },
        { label: 'VS Code Insiders', value: 'vscode-insiders' },
        { label: 'Windsurf', value: 'windsurf' },
        { label: 'None (disable citation links)', value: 'none' }
      ],
      initialValue: fileOpener && fileOpener !== 'skip' ? fileOpener : 'skip'
    }) as FileOpenerChoice
    if (p.isCancel(opener)) return cancelWizard()
    fileOpener = opener
  }

  if (!cliArgs.credentialsStoreArg) {
    const store = await p.select({
      message: 'Credential storage (recommended: auto)',
      options: [
        { label: 'Skip (leave unchanged)', value: 'skip' },
        { label: 'Auto (prefer keyring, fallback to file)', value: 'auto' },
        { label: 'Keyring only', value: 'keyring' },
        { label: 'File only', value: 'file' }
      ],
      initialValue: credentialsStore && credentialsStore !== 'skip' ? credentialsStore : 'auto'
    }) as CredentialsStoreChoice
    if (p.isCancel(store)) return cancelWizard()
    credentialsStore = store
  }

  if (typeof cliArgs.tui2Arg === 'undefined') {
    const tui2 = await p.confirm({
      message: 'Enable TUI2 (experimental UI path in Codex)?',
      initialValue: enableTui2
    })
    if (p.isCancel(tui2)) return cancelWizard()
    enableTui2 = Boolean(tui2)
  }

  if (!cliArgs.altScreenArg) {
    const alt = await p.select({
      message: 'Alternate screen mode (scrollback-friendly terminals)',
      options: [
        { label: 'Skip (leave unchanged)', value: 'skip' },
        { label: 'Auto (recommended)', value: 'auto' },
        { label: 'Always', value: 'always' },
        { label: 'Never (best scrollback)', value: 'never' }
      ],
      initialValue: (tuiAlternateScreen && tuiAlternateScreen !== 'skip') ? tuiAlternateScreen : 'auto'
    }) as TuiAltScreenChoice
    if (p.isCancel(alt)) return cancelWizard()
    tuiAlternateScreen = alt
  }

  if (!cliArgs.experimentalArg) {
    p.log.info('Optional experimental feature toggles (Codex v0.88+)')
    p.log.info('Tip: press Esc to go back.')
    const picked = await multiselectWithBack({
      message: 'Enable experimental features (optional)',
      options: [
        { label: 'Background terminal', value: 'background-terminal' },
        { label: 'Shell snapshot', value: 'shell-snapshot' },
        { label: 'Multi-agents (spawn other agents)', value: 'multi-agents' },
        { label: 'Steer conversation', value: 'steering' },
        { label: 'Collaboration modes (/collab)', value: 'collaboration-modes' },
        { label: 'Child-agent project docs (extra AGENTS.md guidance)', value: 'child-agent-project-docs' }
      ]
    })
    if (picked === 'back') {
      experimentalFeatures = undefined
    } else {
      const chosen = Array.isArray(picked) ? picked.map(s => String(s).trim()).filter(Boolean) : []
      experimentalFeatures = chosen.filter(isExperimentalFeature)
    }
  }

  if (selectedProfiles.length === 0) {
    setDefaultProfile = false
  } else if (selectedProfiles.length === 1) {
    const onlyProfile = selectedProfiles[0]
    const defaultResponse = await p.confirm({
      message: `Wrote profiles.${onlyProfile} to ~/.codex/config.toml (mode: ${profileMode}). Set this as the default profile?`,
      initialValue: true
    })
    if (p.isCancel(defaultResponse)) return cancelWizard()
    setDefaultProfile = Boolean(defaultResponse)
    if (setDefaultProfile) {
      profileChoice = onlyProfile
    }
  } else {
    const defaultOptions = [
      { label: 'Keep current default (skip)', value: 'skip' },
      ...selectedProfiles.map(pf => ({
        label: pf === 'balanced' ? 'Balanced' : pf === 'safe' ? 'Safe' : 'YOLO',
        value: pf
      }))
    ]
    const initialDefault = isProfile(profileChoice) && selectedProfiles.includes(profileChoice)
      ? profileChoice
      : selectedProfiles[0]
    const defaultSelection = await p.select({
      message: 'Select a default profile (optional)',
      options: defaultOptions,
      initialValue: initialDefault
    }) as 'balanced'|'safe'|'yolo'|'skip'
    if (p.isCancel(defaultSelection)) return cancelWizard()
    if (defaultSelection === 'skip') {
      setDefaultProfile = false
    } else {
      setDefaultProfile = true
      profileChoice = defaultSelection
    }
  }

  if (!cliArgs.soundArg) {
    const soundsDir = resolve(repoRoot, 'sounds')
    let sounds: string[] = []
    try { sounds = (await fs.readdir(soundsDir)).filter(n => /\.(wav|mp3|ogg)$/i.test(n)).sort() } catch (error) { void error }
    notifyAction = 'yes'
    let current: string = sounds.includes('noti_1.wav') ? 'noti_1.wav' : (sounds[0] || 'none')

    function makeOptions() {
      return [
        { label: 'Skip (leave current setup)', value: 'skip' },
        { label: 'None (disable sounds)', value: 'none' },
        ...sounds.map(f => ({ label: f, value: f })),
        { label: 'Custom path…', value: 'custom' }
      ]
    }

    async function promptCustomPath(initial?: string): Promise<string | null> {
      const ans = await p.text({ message: 'Enter absolute path to a .wav file', placeholder: initial || '/absolute/path/to/sound.wav', validate(v){
        if (!v) return 'Path required'
        if (!v.startsWith('/')) return 'Use an absolute path'
        if (!/(\.wav|\.mp3|\.ogg)$/i.test(v)) return 'Supported: .wav, .mp3, .ogg'
        return undefined
      }})
      if (p.isCancel(ans)) return null
      try { await fs.access(String(ans)) } catch { p.log.warn('File not found. Try again.'); return await promptCustomPath(String(ans)) }
      return String(ans)
    }

    let pick = await p.select({ message: 'Notification sound', options: makeOptions(), initialValue: current }) as string
    if (p.isCancel(pick)) return cancelWizard()
    if (pick === 'skip') {
      notifyAction = 'no'
      notificationSound = undefined
    } else if (pick === 'custom') {
      const cp = await promptCustomPath()
      if (cp === null) return cancelWizard()
      current = cp
    } else {
      current = pick
    }
    if (pick !== 'skip') {
      while (true) {
        const action = await p.select({
          message: `Selected: ${current}. What next?`,
          options: [
            { label: 'Preview ▶ (press p then Enter)', value: 'preview' },
            { label: 'Use this', value: 'use' },
            { label: 'Choose another…', value: 'change' }
          ],
          initialValue: 'use'
        }) as 'preview'|'use'|'change'
        if (p.isCancel(action)) return cancelWizard()
        if (action === 'use') break
        if (action === 'change') {
              const next = await p.select({ message: 'Notification sound', options: makeOptions(), initialValue: current }) as string
          if (p.isCancel(next)) return cancelWizard()
          if (next === 'custom') {
            const cp = await promptCustomPath()
            if (cp === null) return cancelWizard()
            current = cp
          } else if (next === 'skip') {
            notifyAction = 'no'
            notificationSound = undefined
            break
          } else {
            current = next
          }
          continue
        }
        try {
          const abs = current === 'none' ? 'none' : (current.startsWith('/') ? current : resolve(repoRoot, 'sounds', current))
          await previewSound(abs)
        } catch (e) { p.log.warn(String(e)) }
      }
      if (notificationSound === undefined) notificationSound = current
    }
  }

  const globalAgentsInfo = [
    'Global AGENTS.md is shared instructions Codex can reference in any repo.',
    'We add a short starter guide (fd/ast-grep/jq/yq patterns, deterministic selects).',
    'Backups will be created.',
    'You can remove it later from ~/.codex/AGENTS.md.'
  ].join('\n')

  const agentsTemplatePath = resolve(repoRoot, 'templates', 'agent-templates', 'AGENTS-default.md')
  const promptGlobalAgents = async (
    exists: boolean
  ): Promise<'append-default'|'overwrite-default'|'create-default'|'skip'|null> => {
    while (true) {
      p.log.info(globalAgentsInfo)
      const agChoice = await p.select({
        message: 'Global ~/.codex/AGENTS.md (optional)',
        options: exists
          ? [
            { label: 'Add to your existing AGENTS.md (keeps your content, adds ours; backup created)', value: 'append-default' },
            { label: 'Overwrite existing (replace with starter; backup created)', value: 'overwrite-default' },
            { label: 'Preview starter AGENTS.md', value: 'preview' },
            { label: 'Skip — leave as-is (you can run codex-1up agents later)', value: 'skip' },
          ]
          : [
            { label: 'Create starter AGENTS.md (recommended; helps give Codex repo context everywhere)', value: 'create-default' },
            { label: 'Preview starter AGENTS.md', value: 'preview' },
            { label: 'Skip for now (you can add later with codex-1up agents --global)', value: 'skip' },
          ],
        initialValue: exists ? 'append-default' : 'create-default'
      }) as 'append-default'|'overwrite-default'|'create-default'|'skip'|'preview'
      if (p.isCancel(agChoice)) return null
      if (agChoice === 'preview') {
        await previewAgentsTemplate(agentsTemplatePath)
        continue
      }
      return agChoice
    }
  }

  const agChoice = await promptGlobalAgents(globalAgentsExists)
  if (!agChoice) return cancelWizard()
  globalAgentsAction = agChoice

  if (!cliArgs.skillsArg && bundledSkills.length) {
    p.log.info([
      'Agent Skills are optional, portable skill folders (SKILL.md + optional scripts/references).',
      'codex-1up can install bundled skills into ~/.codex/skills so your agent can reference them.',
      `Bundled skills: ${bundledSkills.map(s => s.id).join(', ')}`
    ].join('\n'))
    while (true) {
      const skillMode = await p.select({
        message: 'Install bundled Agent Skills (optional)',
        options: [
          { label: 'None (do not install skills)', value: 'skip' },
          { label: 'Select skills…', value: 'select' },
          { label: 'All (install every bundled skill)', value: 'all' }
        ],
        initialValue: 'skip'
      }) as 'skip'|'all'|'select'
      if (p.isCancel(skillMode)) return cancelWizard()
      skillsMode = skillMode
      if (skillMode !== 'select') break

      p.log.info('Tip: press Esc to go back.')
      const picked = await multiselectWithBack({
        message: 'Select skills to install',
        options: bundledSkills.map(s => ({
          label: s.id,
          value: s.id,
          hint: s.description.length > 120 ? `${s.description.slice(0, 117)}…` : s.description
        }))
      })
      if (picked === 'back') continue
      const chosen = Array.isArray(picked) ? picked.map(s => String(s).trim()).filter(Boolean) : []
      if (chosen.length === 0) {
        skillsMode = 'skip'
        skillsSelected = undefined
      } else {
        skillsSelected = chosen
      }
      break
    }
  }

  return {
    selections: {
      profileChoice,
      profileMode,
      profileScope,
      setDefaultProfile,
      profilesSelected,
      installTools,
      toolsSelected,
      installCodexCli,
      notifyAction,
      globalAgentsAction,
      notificationSound,
      skillsMode,
      skillsSelected,
      webSearch,
      fileOpener,
      credentialsStore,
      enableTui2,
      tuiAlternateScreen,
      experimentalFeatures
    }
  }
}

async function previewSound(absPath: string) {
  if (absPath.endsWith('/none') || absPath === 'none') return
  const players = [
    async (p: string) => { await which('afplay'); await $`afplay ${p}` },
    async (p: string) => { await which('paplay'); await $`paplay ${p}` },
    async (p: string) => { await which('aplay'); await $`aplay ${p}` },
    async (p: string) => { await which('mpg123'); await $`mpg123 -q ${p}` },
    async (p: string) => { await which('ffplay'); await $`ffplay -nodisp -autoexit -loglevel quiet ${p}` }
  ]
  for (const run of players) {
    try { await run(absPath); return } catch { /* try next */ }
  }
  throw new Error('No audio player found (afplay/paplay/aplay/mpg123/ffplay)')
}

type MultiSelectOption = { label: string; value: string; hint?: string }

async function multiselectWithBack(params: {
  message: string
  options: MultiSelectOption[]
}): Promise<'back' | string[]> {
  const multiselect = (p as unknown as {
    multiselect: (args: { message: string; options: MultiSelectOption[] }) => Promise<string[] | null>
  }).multiselect
  const picked = await multiselect({
    message: params.message,
    options: params.options
  })
  if (p.isCancel(picked)) return 'back'
  const values = Array.isArray(picked) ? picked.map(v => String(v)) : []
  return values
}

async function previewAgentsTemplate(templatePath: string): Promise<void> {
  const maxLines = 40
  let raw = ''
  try {
    raw = await fs.readFile(templatePath, 'utf8')
  } catch {
    p.log.warn(`Starter AGENTS template not found at ${templatePath}`)
    return
  }
  const lines = raw.split(/\r?\n/)
  if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
    p.log.warn('Starter AGENTS template is empty.')
    return
  }
  const headings = lines
    .filter(line => /^#{1,3}\s+/.test(line))
    .map(line => line.replace(/^#{1,3}\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 12)

  p.log.info(`Preview: ${templatePath}`)
  if (headings.length) {
    p.log.info(`Sections: ${headings.join(' | ')}`)
  }
  const previewLines = lines.slice(0, maxLines).join('\n')
  process.stdout.write(previewLines + '\n')
  if (lines.length > maxLines) {
    p.log.info(`... (${lines.length - maxLines} more lines)`)
  }
}

function initialProfileValue(currentProfile: string | undefined): 'balanced'|'safe'|'yolo'|'skip' {
  if (isProfile(currentProfile)) return currentProfile
  return 'balanced'
}

function isProfile(value: unknown): value is 'balanced'|'safe'|'yolo' {
  return value === 'balanced' || value === 'safe' || value === 'yolo'
}

function isExperimentalFeature(value: string): value is ExperimentalFeature {
  return value === 'background-terminal' ||
    value === 'shell-snapshot' ||
    value === 'multi-agents' ||
    value === 'steering' ||
    value === 'collaboration-modes' ||
    value === 'child-agent-project-docs'
}

function cancelWizard(): null {
  p.cancel('Install aborted')
  return null
}
