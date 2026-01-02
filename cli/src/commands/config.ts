import { defineCommand } from 'citty'
import { promises as fs } from 'fs'
import { resolve, dirname } from 'path'
import os from 'os'
import { findRepoRoot } from '../lib/repoRoot.js'

const repoRoot = findRepoRoot()

function getPaths() {
  const CODEX_HOME = resolve(os.homedir(), '.codex')
  const CFG = resolve(CODEX_HOME, 'config.toml')
  return { CODEX_HOME, CFG }
}

async function readFile(path: string) {
  return fs.readFile(path, 'utf8')
}

async function writeFile(path: string, data: string) {
  await fs.mkdir(dirname(path), { recursive: true })
  await fs.writeFile(path, data, 'utf8')
}

function listProfilesFromToml(toml: string): string[] {
  const re = /^\[profiles\.(.+?)\]/gm
  const names: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(toml))) names.push(m[1])
  return names
}

export function setRootProfileInline(toml: string, name: string): string {
  const line = `profile = "${name}"`
  if (/^profile\s*=\s*".*"/m.test(toml)) {
    return toml.replace(/^profile\s*=\s*".*"/m, line)
  }
  // Insert after first root assignment or at top
  const idx = toml.indexOf('\n')
  if (idx === -1) return line + '\n' + toml
  return toml.slice(0, idx + 1) + line + '\n' + toml.slice(idx + 1)
}

export const configCommand = defineCommand({
  meta: { name: 'config', description: 'Manage Codex config profiles' },
  subCommands: {
    init: defineCommand({
      meta: { name: 'init', description: 'Install unified config with multiple profiles' },
      args: { force: { type: 'boolean', description: 'Backup and overwrite if exists' } },
      async run({ args }) {
        const template = resolve(repoRoot, 'templates/codex-config.toml')
        const data = await readFile(template)
        const { CFG } = getPaths()
        const exists = await fs.access(CFG).then(() => true).catch(() => false)
        if (exists && !args.force) {
          process.stdout.write(`${CFG} exists. Use --force to overwrite.\n`)
          return
        }
        if (exists) {
          const backup = `${CFG}.backup.${Date.now()}`
          await fs.copyFile(CFG, backup)
          process.stdout.write(`Backed up to ${backup}\n`)
        }
        await writeFile(CFG, data)
        process.stdout.write(`Wrote ${CFG}\n`)
      }
    }),
    profiles: defineCommand({
      meta: { name: 'profiles', description: 'List profiles in the current config' },
      async run() {
        const { CFG } = getPaths()
        const data = await readFile(CFG)
        const names = listProfilesFromToml(data)
        process.stdout.write(names.length ? names.join('\n') + '\n' : 'No profiles found\n')
      }
    }),
    'set-profile': defineCommand({
      meta: { name: 'set-profile', description: 'Set the active profile in config.toml' },
      args: { name: { type: 'positional', required: true, description: 'Profile name' } },
      async run({ args }) {
        const { CFG } = getPaths()
        const data = await readFile(CFG)
        const names = listProfilesFromToml(data)
        const want = String(args.name)
        if (!names.includes(want)) {
          throw new Error(`Unknown profile: ${want}`)
        }
        const updated = setRootProfileInline(data, want)
        await writeFile(CFG, updated)
        process.stdout.write(`profile set to ${want}\n`)
      }
    })
  }
})
