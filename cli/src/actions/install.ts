import os from 'os'
import { resolve } from 'path'
import { promises as fs } from 'fs'
import * as TOML from 'toml'
import type { InstallerOptions } from '../installers/types.js'
import { runInstaller } from '../installers/main.js'
import { listToolDefinitions, isToolInstalled } from './tools.js'
import { findRepoRoot } from '../lib/repoRoot.js'

export async function runInstall(options: InstallerOptions, rootDir?: string): Promise<void> {
  const root = rootDir || findRepoRoot()
  await runInstaller(options, root)
}

export async function printPostInstallSummary(): Promise<void> {
  const home = os.homedir()
  const cfgPath = resolve(home, '.codex', 'config.toml')
  let profile: string | undefined
  let profiles: string[] = []
  try {
    const raw = await fs.readFile(cfgPath, 'utf8')
    const data = TOML.parse(raw) as {
      profile?: string
      profiles?: Record<string, unknown>
    }
    profile = typeof data.profile === 'string' ? data.profile : undefined
    const profTable = data.profiles && typeof data.profiles === 'object' ? data.profiles : {}
    profiles = Object.keys(profTable)
  } catch (error) {
    void error
  }

  const tools = listToolDefinitions()
  const summaryTools = [
    { id: 'codex', bins: ['codex'] },
    ...tools
  ]
  const results = await Promise.all(
    summaryTools.map(async (tool) => {
      const installed = await isToolInstalled(tool.bins)
      return [tool.id, installed] as const
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
