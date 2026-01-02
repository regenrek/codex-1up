import { defineCommand } from 'citty'
import { resolve } from 'path'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as TOML from 'toml'
import * as p from '@clack/prompts'
import { runInstall, printPostInstallSummary } from '../actions/install.js'
import { listBundledSkills } from '../actions/skills.js'
import { isToolId, listToolDefinitions } from '../actions/tools.js'
import type { InstallerOptions, ToolId } from '../installers/types.js'
import { findRepoRoot } from '../lib/repoRoot.js'
import { PACKAGE_DESCRIPTION, PACKAGE_NAME, PACKAGE_VERSION } from '../lib/package.js'
import { runInstallWizard } from '../flows/installWizard.js'

const repoRoot = findRepoRoot()
const ALL_PROFILES = ['balanced', 'safe', 'yolo'] as const

export const installCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Run the codex-1up installer with validated flags'
  },
  args: {
    yes: { type: 'boolean', description: 'Non-interactive; accept safe defaults' },
    'dry-run': { type: 'boolean', description: 'Print actions without making changes' },
    'skip-confirmation': { type: 'boolean', description: 'Skip prompts' },
    shell: { type: 'string', description: 'auto|zsh|bash|fish' },
    vscode: { type: 'string', description: 'Install VS Code extension id' },
    'no-vscode': { type: 'boolean', description: 'Skip VS Code extension checks' },
    'install-node': { type: 'string', description: 'nvm|brew|skip' },
    tools: { type: 'string', description: 'all|skip|<comma-separated tool ids> (rg, fd, fzf, jq, yq, ast-grep, bat, git, git-delta, gh)' },
    'codex-cli': { type: 'string', description: 'yes|no install/upgrade Codex CLI + ast-grep globally' },
    'profiles-scope': { type: 'string', description: 'single|all (write one profile or all profiles)' },
    profile: { type: 'string', description: 'balanced|safe|yolo|skip (choose profile to write)' },
    'profile-mode': { type: 'string', description: 'add|overwrite (profile table merge strategy)' },
    sound: { type: 'string', description: 'Sound file, "none", or "skip" to leave unchanged' },
    'agents-md': { type: 'string', description: 'Write starter AGENTS.md to PATH (default PWD/AGENTS.md)', required: false },
    skills: { type: 'string', description: 'Install bundled Agent Skills to ~/.codex/skills: all|skip|<comma-separated names>' }
  },
  async run({ args, rawArgs }) {
    const cfgPath = resolve(os.homedir(), '.codex', 'config.toml')
    const cfgExists = await pathExists(cfgPath)
    const notifyPath = resolve(os.homedir(), '.codex', 'notify.sh')
    const notifyExists = await pathExists(notifyPath)
    const globalAgentsPath = resolve(os.homedir(), '.codex', 'AGENTS.md')
    const globalAgentsExists = await pathExists(globalAgentsPath)
    const currentProfile = cfgExists ? await readCurrentProfile(cfgPath) : undefined
    // Interactive by default when in a TTY and not explicitly suppressed.
    const runWizard = process.stdout.isTTY && !args['dry-run'] && !args['skip-confirmation'] && !args.yes

    const cliProfileChoice = normalizeProfileArg(args.profile)
    const cliProfileMode = normalizeProfileMode(args['profile-mode'])
    const cliProfileScope = normalizeProfileScope(args['profiles-scope'])
    const cliCodexCliChoice = normalizeYesNoArg(args['codex-cli'])
    const isUnixLike = process.platform === 'darwin' || process.platform === 'linux'
    const cliSoundArg = typeof args.sound === 'undefined'
      ? undefined
      : String(args.sound).trim()
    const cliToolsArg = typeof args.tools === 'undefined'
      ? undefined
      : String(args.tools).trim()
    const argsRecord = args as Record<string, unknown>
    const cliSkillsArg = typeof argsRecord.skills === 'undefined'
      ? undefined
      : String(argsRecord.skills).trim()

    if (cliSoundArg === '') throw new Error('Invalid --sound value (expected path, "none", or "skip")')
    if (cliToolsArg === '') throw new Error('Invalid --tools value (expected all|skip|<comma-separated tool ids>)')
    if (cliSkillsArg === '') throw new Error('Invalid --skills value (expected all|skip|<comma-separated skill names>)')

    const hasNoVscodeFlag = rawArgs.some(arg => arg === '--no-vscode' || arg.startsWith('--no-vscode='))

    const bundledSkills = await listBundledSkills(repoRoot)
    const availableTools = listToolDefinitions()

    const seededProfile = cliProfileChoice || (isProfile(currentProfile) ? currentProfile : undefined) || 'balanced'
    let profileChoice: 'balanced'|'safe'|'yolo'|'skip' = seededProfile
    let profileMode: 'add'|'overwrite' = cliProfileMode || 'add'
    let profileScope: 'single'|'all'|'selected' = cliProfileScope || 'single'
    let setDefaultProfile = true
    let profilesSelected: Array<'balanced'|'safe'|'yolo'> | undefined
    let installTools: 'all'|'skip'|'select' = isUnixLike ? 'all' : 'skip'
    let installCodexCli: 'yes'|'no'|'auto' = cliCodexCliChoice || 'auto'
    let notifyAction: 'yes'|'no' | undefined
    let globalAgentsAction: 'create-default'|'overwrite-default'|'append-default'|'skip' | undefined
    let notificationSound: string | undefined
    let skillsMode: 'skip'|'all'|'select' = 'skip'
    let skillsSelected: string[] | undefined
    let toolsSelected: ToolId[] | undefined

    const applySoundSelection = (choice: string) => {
      const normalized = choice.trim().toLowerCase()
      if (normalized === 'skip') {
        notifyAction = 'no'
        notificationSound = undefined
        return
      }
      notifyAction = 'yes'
      notificationSound = normalized === 'none' ? 'none' : choice
    }

    if (cliSoundArg) applySoundSelection(cliSoundArg)

    if (cliSkillsArg) {
      const normalized = cliSkillsArg.trim().toLowerCase()
      if (normalized === 'all') {
        skillsMode = 'all'
      } else if (normalized === 'skip' || normalized === 'none') {
        skillsMode = 'skip'
      } else {
        const parts = cliSkillsArg.split(',').map(s => s.trim()).filter(Boolean)
        if (parts.length === 0) throw new Error('Invalid --skills value (expected all|skip|<comma-separated skill names>)')
        const available = new Set(bundledSkills.map(s => s.id))
        const unknown = parts.filter(s => !available.has(s))
        if (unknown.length) {
          const availList = bundledSkills.map(s => s.id).join(', ') || '(none)'
          throw new Error(`Unknown skill(s): ${unknown.join(', ')}. Available: ${availList}`)
        }
        skillsMode = 'select'
        skillsSelected = parts
      }
    }

    if (cliToolsArg) {
      const normalized = cliToolsArg.trim().toLowerCase()
      if (normalized === 'all') {
        installTools = 'all'
      } else if (normalized === 'skip' || normalized === 'none') {
        installTools = 'skip'
      } else {
        const parts = cliToolsArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        if (parts.length === 0) throw new Error('Invalid --tools value (expected all|skip|<comma-separated tool ids>)')
        const available = new Set(availableTools.map(t => t.id))
        const unknown = parts.filter(s => !available.has(s))
        if (unknown.length) {
          const availList = availableTools.map(t => t.id).join(', ') || '(none)'
          throw new Error(`Unknown tool(s): ${unknown.join(', ')}. Available: ${availList}`)
        }
        installTools = 'select'
        toolsSelected = Array.from(new Set(parts)).filter(isToolId)
      }
    } else if (!isUnixLike) {
      installTools = 'skip'
    }

    if (runWizard) {
      p.log.info(`Codex 1up v${PACKAGE_VERSION} - equips your coding agent with powerful tools`)
      p.log.info('Install wizard')
      const wizardResult = await runInstallWizard({
        repoRoot,
        isUnixLike,
        globalAgentsExists,
        currentProfile,
        seededProfile,
        bundledSkills,
        availableTools,
        cliArgs: {
          profileChoice: cliProfileChoice,
          profileMode: cliProfileMode,
          profileScope: cliProfileScope,
          soundArg: cliSoundArg,
          toolsArg: cliToolsArg,
          skillsArg: cliSkillsArg
        },
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
          skillsSelected
        }
      })
      if (!wizardResult) return
      ({
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
        skillsSelected
      } = wizardResult.selections)
    }

    if (!runWizard) {
      if (profileScope === 'selected' && profilesSelected?.length) {
        if (isProfile(profileChoice) && !profilesSelected.includes(profileChoice)) {
          profileChoice = profilesSelected[0]
        }
      }
      const selectedProfiles = profileScope === 'all'
        ? [...ALL_PROFILES]
        : profileScope === 'selected'
          ? (profilesSelected || [])
          : (profileChoice === 'skip' ? [] : [profileChoice])
      if (selectedProfiles.length === 0) {
        setDefaultProfile = false
      }
      if (typeof notifyAction === 'undefined') {
        notifyAction = notifyExists ? 'no' : 'yes'
      }
      if (typeof globalAgentsAction === 'undefined') {
        globalAgentsAction = 'skip'
      }
    }

    const installerOptions: InstallerOptions = {
      profile: profileChoice,
      profileScope,
      profileMode,
      setDefaultProfile,
      profilesSelected,
      installCodexCli,
      installTools,
      toolsSelected,
      notify: notifyAction ?? (notifyExists ? 'no' : 'yes'),
      globalAgents: globalAgentsAction ?? 'skip',
      notificationSound,
      skills: skillsMode,
      skillsSelected,
      mode: 'manual',
      installNode: (args['install-node'] as 'nvm'|'brew'|'skip') || 'nvm',
      shell: String(args.shell || 'auto'),
      vscodeId: hasNoVscodeFlag ? undefined : (args.vscode ? String(args.vscode) : undefined),
      noVscode: hasNoVscodeFlag || args['no-vscode'] || false,
      agentsMd: typeof args['agents-md'] !== 'undefined' ? String(args['agents-md'] || process.cwd()) : undefined,
      dryRun: args['dry-run'] || false,
      assumeYes: args.yes || false,
      skipConfirmation: args['skip-confirmation'] || false
    }

    if (runWizard) {
      // NOTE: We intentionally don't use a spinner here because:
      // 1. Package manager commands (apt-get, dnf, etc.) may require sudo password input
      // 2. npm/pnpm may show confirmation prompts
      // 3. A spinner would overwrite/hide these prompts, causing the install to appear "stuck"
      // Instead, we show phase-based status messages and let subprocess output be visible.
      p.log.info('Installing prerequisites and writing config...')
      p.log.warn('Some steps may require sudo password or confirmation prompts.')
      try {
        await runInstall(installerOptions, repoRoot)
        p.log.success('Base install complete')
        p.log.success('Install finished')
      } catch (error) {
        p.cancel(`Installation failed: ${error}`)
        throw error
      }
      await printPostInstallSummary()
      return
    }

    try {
      await runInstall(installerOptions, repoRoot)
      await printPostInstallSummary()
    } catch (error) {
      p.cancel(`Installation failed: ${error}`)
      throw error
    }
  }
})

async function pathExists(path: string) {
  try { await fs.access(path); return true } catch { return false }
}

function normalizeProfileArg(value: unknown): ('balanced'|'safe'|'yolo'|'skip') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (isProfile(normalized)) return normalized
  if (normalized === 'skip') return 'skip'
  throw new Error('Invalid --profile value (use balanced|safe|yolo|skip).')
}

function normalizeProfileMode(value: unknown): ('add'|'overwrite') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'add' || normalized === 'overwrite') return normalized
  throw new Error('Invalid --profile-mode value (use add|overwrite).')
}

function normalizeProfileScope(value: unknown): ('single'|'all') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'single' || normalized === 'all') return normalized
  throw new Error('Invalid --profiles-scope value (use single|all).')
}

function normalizeYesNoArg(value: unknown): ('yes'|'no') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'yes' || normalized === 'no') return normalized
  throw new Error('Expected yes|no')
}

function isProfile(value: unknown): value is 'balanced'|'safe'|'yolo' {
  return value === 'balanced' || value === 'safe' || value === 'yolo'
}

async function readCurrentProfile(cfgPath: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(cfgPath, 'utf8')
    const data = TOML.parse(raw) as { profile?: string }
    const value = data.profile
    return typeof value === 'string' ? value : undefined
  } catch (error) {
    void error
    return undefined
  }
}
