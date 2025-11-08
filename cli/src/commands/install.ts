import { defineCommand } from 'citty'
import { execa } from 'execa'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { promises as fs } from 'fs'
import os from 'os'
import { accessSync } from 'fs'
import * as TOML from 'toml'
import * as p from '@clack/prompts'

const __dirname = dirname(fileURLToPath(import.meta.url))
function findRoot() {
    const a = resolve(__dirname, '../../');
  const b = resolve(__dirname, '../../..');
  try { accessSync(resolve(a, 'install.sh')); return a } catch (e) {}
  return b
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
    'agents-md': { type: 'string', description: 'Write starter AGENTS.md to PATH (default PWD/AGENTS.md)', required: false },
    'agents-template': { type: 'string', description: 'default|typescript|python|shell' }
  },
  async run({ args }) {
    const installPath = resolve(repoRoot, 'install.sh')
    const flags: string[] = []
    const cfgPath = resolve(os.homedir(), '.codex', 'config.toml')
    const cfgExists = await pathExists(cfgPath)
    let overwriteConfig: 'yes' | 'no' | undefined
    let allowProfileUpdate = !cfgExists

    // If no flags and in an interactive TTY, offer a friendly guided install
    const runWizard =
      process.stdout.isTTY &&
      !args['dry-run'] &&
      !args['skip-confirmation'] &&
      !args.yes &&
      !args.vscode &&
      !args['git-external-diff'] &&
      !args['install-node'] &&
      typeof args['agents-md'] === 'undefined' &&
      !args['agents-template']

    let chosenProfile: 'balanced'|'safe'|'minimal'|'yolo' = 'balanced'
    let createGlobalAgents = false
    let mode: 'recommended'|'manual' = 'recommended'

    if (runWizard) {
      p.intro('codex-1up · Guided install')
      const m = await p.select({
        message: 'Choose install mode',
        options: [
          { label: 'Recommended (most users)', value: 'recommended' },
          { label: 'Manual (advanced)', value: 'manual' },
        ],
        initialValue: 'recommended'
      }) as 'recommended'|'manual'
      if (p.isCancel(m)) return p.cancel('Install aborted')
      mode = m

      if (mode === 'recommended') {
        const prof = await p.select({
          message: 'Active profile',
          options: [
            { label: 'balanced (default)', value: 'balanced' },
            { label: 'safe', value: 'safe' },
            { label: 'minimal', value: 'minimal' },
            { label: 'yolo (risky)', value: 'yolo' },
          ],
          initialValue: 'balanced'
        }) as 'balanced'|'safe'|'minimal'|'yolo'
        if (p.isCancel(prof)) return p.cancel('Install aborted')
        chosenProfile = prof

        if (cfgExists) {
          const overwrite = await p.confirm({
            message: 'Overwrite existing ~/.codex/config.toml with the latest template? (backup will be created)',
            initialValue: false
          })
          if (p.isCancel(overwrite)) return p.cancel('Install aborted')
          overwriteConfig = overwrite ? 'yes' : 'no'
          allowProfileUpdate = overwrite
          if (!overwrite) {
            p.log.info('Keeping existing config (no overwrite).')
          }
        }

        const ag = await p.confirm({ message: 'Create a global ~/.codex/AGENTS.md now?', initialValue: false })
        if (p.isCancel(ag)) return p.cancel('Install aborted')
        createGlobalAgents = Boolean(ag)
      }
    }
    if (args.yes) flags.push('--yes')
    if (args['dry-run']) flags.push('--dry-run')
    if (args['skip-confirmation']) flags.push('--skip-confirmation')
    if (args.shell) flags.push('--shell', String(args.shell))
    if (args.vscode) flags.push('--vscode', String(args.vscode))
    if (args['no-vscode']) flags.push('--no-vscode')
    if (args['git-external-diff']) flags.push('--git-external-diff')
    if (args['install-node']) flags.push('--install-node', String(args['install-node']))
    if (typeof args['agents-md'] !== 'undefined') {
      const v = args['agents-md']
      flags.push('--agents-md')
      if (v) flags.push(String(v))
    }
    if (args['agents-template']) flags.push('--agents-template', String(args['agents-template']))

    if (runWizard && mode === 'recommended') {
      // Safety summary: require explicit 'yes' acknowledgement
      // Loop once if user does not type 'yes'
      const summary = [
        '',
        'Recommended will install and configure:',
        '  • Node.js (via nvm) if missing',
        '  • Global npm: @openai/codex, @ast-grep/cli (install/upgrade)',
        '  • Dev tools: fd/rg/fzf/jq/yq (+ difftastic if available)',
        '  • ~/.codex/config.toml from template',
        '  • ~/.codex/notify.sh and enable tui.notifications',
        '  • Default sound: noti_1.wav (copied to ~/.codex/sounds)',
        '  • Global AGENTS.md (default template) if you opted in',
        ''
      ].join('\n')
      p.note(summary, 'Summary')
      const ack = await p.text({
        message: "Type 'yes' to continue with Recommended",
        placeholder: 'yes',
        validate(v) { return v === 'yes' ? undefined : "Please type exactly 'yes' to proceed" }
      })
      if (p.isCancel(ack)) return p.cancel('Install aborted')

      const s = p.spinner()
      s.start('Installing prerequisites and writing config')
      const env = { ...process.env, INSTALL_MODE: 'recommended' } as NodeJS.ProcessEnv
      if (overwriteConfig) env.CODEX_1UP_OVERWRITE_CONFIG = overwriteConfig
      await execa('bash', [installPath, '--yes', '--skip-confirmation', ...flags], {
        stdio: 'inherit',
        env
      })
      s.stop('Base install complete')
      if (allowProfileUpdate) {
        await setActiveProfile(chosenProfile)
      } else {
        p.log.info('Profile unchanged (existing config kept).')
      }
      if (createGlobalAgents) { await writeGlobalAgents('default') }
      p.outro('Install finished')
      await printPostInstallSummary()
      return
    }

    const child = execa('bash', [installPath, ...flags], { stdio: 'inherit' })
    await child
    await printPostInstallSummary()
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
  const results = await Promise.all(tools.map(async (t) => {
    try {
      const { stdout } = await execa('bash', ['-lc', `command -v ${t} >/dev/null 2>&1 && echo 1 || echo 0`])
      return [t, stdout.trim() === '1'] as const
    } catch {
      return [t, false] as const
    }
  }))

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


async function setActiveProfile(name: 'balanced'|'safe'|'minimal'|'yolo') {
  const cfgPath = resolve(os.homedir(), '.codex', 'config.toml')
  try {
    const raw = await fs.readFile(cfgPath, 'utf8')
    const updated = setRootProfileInline(raw, name)
    await fs.writeFile(cfgPath, updated, 'utf8')
  } catch {}
}

async function writeGlobalAgents(template: 'default'|'typescript'|'python'|'shell') {
  const dest = resolve(os.homedir(), '.codex', 'AGENTS.md')
  const src = resolve(repoRoot, 'templates/agent-templates', `AGENTS-${template}.md`)
  await fs.mkdir(resolve(os.homedir(), '.codex'), { recursive: true })
  await fs.copyFile(src, dest)
}

async function pathExists(path: string) {
  try { await fs.access(path); return true } catch { return false }
}
