import { defineCommand } from 'citty'
// execa was used only for which-like checks; prefer zx utils
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { promises as fs } from 'fs'
import * as os from 'os'
import { accessSync } from 'fs'
import * as TOML from 'toml'
import * as p from '@clack/prompts'
import { which, $ } from 'zx'
import { runInstaller } from '../installers/main.js'
import type { InstallerOptions } from '../installers/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
function findRoot() {
  // Walk up to 6 levels looking for templates/codex-config.toml
  let cur = __dirname
  for (let i = 0; i < 6; i++) {
    try {
      accessSync(resolve(cur, 'templates', 'codex-config.toml'))
      return cur
    } catch {}
    cur = resolve(cur, '..')
  }
  return resolve(__dirname, '..')
}
const repoRoot = findRoot()

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
    'git-external-diff': { type: 'boolean', description: 'Set difftastic as git external diff' },
    'install-node': { type: 'string', description: 'nvm|brew|skip' },
    tools: { type: 'string', description: 'yes|no install/upgrade core CLI tools (rg, fd, fzf, jq, yq, difftastic)' },
    'codex-cli': { type: 'string', description: 'yes|no install/upgrade Codex CLI + ast-grep globally' },
    profile: { type: 'string', description: 'balanced|safe|minimal|yolo|skip (choose profile to write)' },
    'profile-mode': { type: 'string', description: 'add|overwrite (profile table merge strategy)' },
    sound: { type: 'string', description: 'Sound file, "none", or "skip" to leave unchanged' },
    'agents-md': { type: 'string', description: 'Write starter AGENTS.md to PATH (default PWD/AGENTS.md)', required: false }
  },
  async run({ args }) {
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
    const cliToolsChoice = normalizeToolsArg(args.tools)
    const cliCodexCliChoice = normalizeYesNoArg(args['codex-cli'])
    const isUnixLike = process.platform === 'darwin' || process.platform === 'linux'
    const cliSoundArg = typeof args.sound === 'undefined'
      ? undefined
      : String(args.sound).trim()

    if (cliSoundArg === '') throw new Error('Invalid --sound value (expected path, "none", or "skip")')

    const seededProfile = cliProfileChoice || (isProfile(currentProfile) ? currentProfile : undefined) || 'balanced'
    let profileChoice: 'balanced'|'safe'|'minimal'|'yolo'|'skip' = seededProfile
    let profileMode: 'add'|'overwrite' = cliProfileMode || 'add'
    let setDefaultProfile = true
    let installTools: 'yes'|'no' = cliToolsChoice || (isUnixLike ? 'yes' : 'no')
    let installCodexCli: 'yes'|'no' = cliCodexCliChoice || 'yes'
    let notifyAction: 'yes'|'no' | undefined
    let globalAgentsAction: 'create-default'|'overwrite-default'|'append-default'|'skip' | undefined
    let notificationSound: string | undefined

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

    if (runWizard) {
      p.intro('codex-1up · Install')
      if (!cliCodexCliChoice) {
        const codexCliResponse = await p.confirm({
          message: 'Install/update Codex CLI globally?',
          initialValue: true
        })
        if (p.isCancel(codexCliResponse)) return p.cancel('Install aborted')
        installCodexCli = codexCliResponse ? 'yes' : 'no'
      }

      if (isUnixLike && !cliToolsChoice) {
        p.note('We can install/update developer tools (rg, fd, fzf, jq, yq, difftastic, ast-grep) using your package manager (macOS/Linux).')
        const toolsResponse = await p.confirm({
          message: 'Install/update these CLI tools?',
          initialValue: true
        })
        if (p.isCancel(toolsResponse)) return p.cancel('Install aborted')
        installTools = toolsResponse ? 'yes' : 'no'
      } else if (!isUnixLike && !cliToolsChoice) {
        installTools = 'no'
      }

      // Profile selection + mode + default
      if (!cliProfileChoice) {
        p.note([
          'Profiles:',
          '  • Balanced: on-request approvals, workspace-write sandbox, web search on.',
          '  • Safe: on-failure approvals, workspace-write, web search off.',
          '  • Minimal: lean settings, minimal reasoning effort, web search off.',
          '  • YOLO: never approvals, danger-full-access, web search on, verbose.'
        ].join('\n'))
        const profileResponse = await p.select({
          message: 'Choose a Codex profile to install',
          options: [
            { label: 'Balanced (recommended)', value: 'balanced', hint: 'on-request approvals · workspace-write · web search on' },
            { label: 'Safe', value: 'safe', hint: 'on-failure approvals · workspace-write · web search off' },
            { label: 'Minimal', value: 'minimal', hint: 'lean defaults · minimal reasoning effort · web search off' },
            { label: 'YOLO', value: 'yolo', hint: 'never approvals · danger-full-access · web search on' },
            { label: 'Skip (no profile changes)', value: 'skip' }
          ],
          initialValue: initialProfileValue(currentProfile) as any
        }) as 'balanced'|'safe'|'minimal'|'yolo'|'skip'
        if (p.isCancel(profileResponse)) return p.cancel('Install aborted')
        profileChoice = profileResponse
      }

      if (profileChoice !== 'skip' && !cliProfileMode) {
        const modeResponse = await p.select({
          message: `How should we write profiles.${profileChoice}?`,
          options: [
            { label: 'Add / merge (preserve custom keys)', value: 'add' },
            { label: 'Overwrite codex profile (replace table)', value: 'overwrite' }
          ],
          initialValue: profileMode
        }) as 'add'|'overwrite'
        if (p.isCancel(modeResponse)) return p.cancel('Install aborted')
        profileMode = modeResponse
      }

      if (profileChoice === 'skip') {
        setDefaultProfile = false
      } else {
        const defaultResponse = await p.confirm({
          message: `Wrote profiles.${profileChoice} to ~/.codex/config.toml (mode: ${profileMode}). Set this as the default profile?`,
          initialValue: true
        })
        if (p.isCancel(defaultResponse)) return p.cancel('Install aborted')
        setDefaultProfile = Boolean(defaultResponse)
      }

      // Notification sound: choose + preview loop
      if (!cliSoundArg) {
        const soundsDir = resolve(repoRoot, 'sounds')
        let sounds: string[] = []
        try { sounds = (await fs.readdir(soundsDir)).filter(n => /\.(wav|mp3|ogg)$/i.test(n)).sort() } catch {}
        notifyAction = 'yes'
        let current: string = sounds.includes('noti_1.wav') ? 'noti_1.wav' : (sounds[0] || 'none')

        function makeOptions(cur: string) {
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

        // initial selection (includes custom)
        let pick = await p.select({ message: 'Notification sound', options: makeOptions(current), initialValue: current }) as string
        if (p.isCancel(pick)) return p.cancel('Install aborted')
        if (pick === 'skip') {
          // Do not touch existing notify or sound settings
          notifyAction = 'no'
          notificationSound = undefined
        } else if (pick === 'custom') {
          const cp = await promptCustomPath()
          if (cp === null) return p.cancel('Install aborted')
          current = cp
        } else {
          current = pick
        }
        if (pick !== 'skip') {
          // preview/confirm loop
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
            if (p.isCancel(action)) return p.cancel('Install aborted')
            if (action === 'use') break
            if (action === 'change') {
              const next = await p.select({ message: 'Notification sound', options: makeOptions(current), initialValue: current }) as string
              if (p.isCancel(next)) return p.cancel('Install aborted')
              if (next === 'custom') {
                const cp = await promptCustomPath()
                if (cp === null) return p.cancel('Install aborted')
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
            // preview
            try {
              const abs = current === 'none' ? 'none' : (current.startsWith('/') ? current : resolve(repoRoot, 'sounds', current))
              await previewSound(abs)
            } catch (e) { p.log.warn(String(e)) }
          }
          if (notificationSound === undefined) notificationSound = current
        }

      }

      if (globalAgentsExists) {
        const agChoice = await p.select({
          message: 'Global ~/.codex/AGENTS.md',
          options: [
            { label: 'Add to your existing AGENTS.md (Backup will be created)', value: 'append-default' },
            { label: 'Overwrite existing (Backup will be created)', value: 'overwrite-default' },
            { label: 'Skip — leave as-is', value: 'skip' },
          ],
          initialValue: 'append-default'
        }) as 'append-default'|'overwrite-default'|'skip'
        if (p.isCancel(agChoice)) return p.cancel('Install aborted')
        globalAgentsAction = agChoice
      } else {
        globalAgentsAction = 'skip'
      }
    }

    if (!runWizard) {
      if (profileChoice === 'skip') {
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
      profileMode,
      setDefaultProfile,
      installCodexCli,
      installTools,
      notify: notifyAction ?? (notifyExists ? 'no' : 'yes'),
      globalAgents: globalAgentsAction ?? 'skip',
      notificationSound,
      mode: 'manual',
      installNode: (args['install-node'] as 'nvm'|'brew'|'skip') || 'nvm',
      shell: String(args.shell || 'auto'),
      vscodeId: args.vscode ? String(args.vscode) : undefined,
      noVscode: args['no-vscode'] || false,
      agentsMd: typeof args['agents-md'] !== 'undefined' ? String(args['agents-md'] || process.cwd()) : undefined,
      dryRun: args['dry-run'] || false,
      assumeYes: args.yes || false,
      skipConfirmation: args['skip-confirmation'] || false
    }

    if (runWizard) {
      const s = p.spinner()
      s.start('Installing prerequisites and writing config')
      try {
        await runInstaller(installerOptions, repoRoot)
        s.stop('Base install complete')
        p.outro('Install finished')
      } catch (error) {
        s.stop('Installation failed')
        p.cancel(`Installation failed: ${error}`)
        throw error
      }
      await printPostInstallSummary()
      return
    }

    try {
      await runInstaller(installerOptions, repoRoot)
      await printPostInstallSummary()
    } catch (error) {
      p.cancel(`Installation failed: ${error}`)
      throw error
    }
  }
})

async function printPostInstallSummary() {
  const home = os.homedir()
  const cfgPath = resolve(home, '.codex', 'config.toml')
  let profile: string | undefined
  let profiles: string[] = []
  try {
    const raw = await fs.readFile(cfgPath, 'utf8')
    const data: any = TOML.parse(raw)
    profile = data.profile
    const profTable = data.profiles || {}
    profiles = Object.keys(profTable)
      } catch {
    // ignore — config may not exist if user skipped
  }

  const tools = ['codex', 'ast-grep', 'fd', 'rg', 'fzf', 'jq', 'yq', 'difft', 'difftastic']
  const results = await Promise.all(
    tools.map(async (t) => {
      try {
        await which(t)
        return [t, true] as const
      } catch {
        return [t, false] as const
      }
    })
  )

  const present = results.filter(([, ok]) => ok).map(([t]) => t)

  const lines: string[] = []
  lines.push('')
  lines.push('codex-1up: Installation summary')
  lines.push('────────────────────────────────')
  lines.push(`Config: ${cfgPath}${profile ? ` (active profile: ${profile})` : ''}`)
  if (profiles.length) lines.push(`Profiles: ${profiles.join(', ')}`)
  lines.push(`Tools detected: ${present.join(', ') || 'none'}`)
  lines.push('')
  lines.push('Usage:')
  lines.push('  - Switch profile for a session:  codex --profile <name>')
  lines.push('  - List available profiles:       codex-1up config profiles')
  lines.push('  - Persist active profile:        codex-1up config set-profile <name>')
  lines.push('  - Write AGENTS.md to a repo:     codex-1up agents --path . --template default')
  lines.push('')
  process.stdout.write(lines.join('\n') + '\n')
}


async function previewSound(absPath: string) {
  // Handle 'none'
  if (absPath.endsWith('/none') || absPath === 'none') return
  // pick a player
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


async function pathExists(path: string) {
  try { await fs.access(path); return true } catch { return false }
}

function normalizeProfileArg(value: unknown): ('balanced'|'safe'|'minimal'|'yolo'|'skip') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (isProfile(normalized)) return normalized
  if (normalized === 'skip') return 'skip'
  throw new Error('Invalid --profile value (use balanced|safe|minimal|yolo|skip).')
}

function normalizeProfileMode(value: unknown): ('add'|'overwrite') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'add' || normalized === 'overwrite') return normalized
  throw new Error('Invalid --profile-mode value (use add|overwrite).')
}

function normalizeToolsArg(value: unknown): ('yes'|'no') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'yes' || normalized === 'no') return normalized
  throw new Error('Invalid --tools value (use yes|no).')
}

function normalizeYesNoArg(value: unknown): ('yes'|'no') | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).toLowerCase()
  if (normalized === 'yes' || normalized === 'no') return normalized
  throw new Error('Expected yes|no')
}

function isProfile(value: unknown): value is 'balanced'|'safe'|'minimal'|'yolo' {
  return value === 'balanced' || value === 'safe' || value === 'minimal' || value === 'yolo'
}

function initialProfileValue(currentProfile: string | undefined): 'balanced'|'safe'|'minimal'|'yolo'|'skip' {
  if (isProfile(currentProfile)) return currentProfile
  return 'balanced'
}

async function readCurrentProfile(cfgPath: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(cfgPath, 'utf8')
    const data: any = TOML.parse(raw)
    const value = data.profile
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}
