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

function tomlQuoteKeySegment(value: string): string {
  // Quoted key segments allow slashes/spaces in table names: [projects."/path/to/repo"]
  return JSON.stringify(value)
}

function ensureProjectsTrustInline(toml: string, absPath: string, trustLevel: 'trusted'|'untrusted'): string {
  const tableHeader = `[projects.${tomlQuoteKeySegment(absPath)}]`
  const lines = toml.split(/\r?\n/)

  // Find (or append) the table.
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === tableHeader) { start = i; break }
  }
  if (start === -1) {
    const trimmed = toml.replace(/\s*$/, '\n')
    return trimmed + `\n${tableHeader}\ntrust_level = "${trustLevel}"\n`
  }

  // Replace or insert trust_level inside this table.
  let i = start + 1
  for (; i < lines.length; i++) {
    const ln = lines[i]
    if (/^\s*\[/.test(ln)) break
    if (/^\s*trust_level\s*=/.test(ln)) {
      lines[i] = `trust_level = "${trustLevel}"`
      return lines.join('\n').replace(/\s*$/, '\n')
    }
  }
  lines.splice(i, 0, `trust_level = "${trustLevel}"`)
  return lines.join('\n').replace(/\s*$/, '\n')
}

function ensureMcpServerInline(
  toml: string,
  name: string,
  fields: { command?: string; args?: string[]; url?: string; enabled?: boolean }
): string {
  const seg = /^[A-Za-z0-9_-]+$/.test(name) ? name : tomlQuoteKeySegment(name)
  const tableHeader = `[mcp_servers.${seg}]`
  const lines = toml.split(/\r?\n/)

  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === tableHeader) { start = i; break }
  }
  if (start === -1) {
    const parts: string[] = ['', tableHeader]
    if (fields.command) parts.push(`command = ${JSON.stringify(fields.command)}`)
    if (fields.args) parts.push(`args = ${JSON.stringify(fields.args)}`)
    if (fields.url) parts.push(`url = ${JSON.stringify(fields.url)}`)
    if (typeof fields.enabled === 'boolean') parts.push(`enabled = ${fields.enabled ? 'true' : 'false'}`)
    return toml.replace(/\s*$/, '\n') + parts.join('\n') + '\n'
  }

  const setKey = (key: string, rhs: string) => {
    for (let i = start + 1; i < lines.length; i++) {
      const ln = lines[i]
      if (/^\s*\[/.test(ln)) {
        lines.splice(i, 0, `${key} = ${rhs}`)
        return
      }
      if (new RegExp(`^\\s*${key}\\s*=`).test(ln)) {
        lines[i] = `${key} = ${rhs}`
        return
      }
    }
    lines.push(`${key} = ${rhs}`)
  }

  if (fields.command) setKey('command', JSON.stringify(fields.command))
  if (fields.args) setKey('args', JSON.stringify(fields.args))
  if (fields.url) setKey('url', JSON.stringify(fields.url))
  if (typeof fields.enabled === 'boolean') setKey('enabled', fields.enabled ? 'true' : 'false')
  return lines.join('\n').replace(/\s*$/, '\n')
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
    ,
    trust: defineCommand({
      meta: { name: 'trust', description: 'Mark a repo path as trusted (projects.<path>.trust_level)' },
      args: {
        path: { type: 'string', description: 'Path to trust (default: PWD)' }
      },
      async run({ args }) {
        const { CFG } = getPaths()
        const raw = await readFile(CFG)
        const abs = resolve(String(args.path || process.cwd()))
        const updated = ensureProjectsTrustInline(raw, abs, 'trusted')
        await writeFile(CFG, updated)
        process.stdout.write(`trusted: ${abs}\n`)
      }
    }),
    mcp: defineCommand({
      meta: { name: 'mcp', description: 'Manage [mcp_servers] entries in config.toml' },
      subCommands: {
        set: defineCommand({
          meta: { name: 'set', description: 'Add/update an MCP server entry' },
          args: {
            name: { type: 'positional', required: true, description: 'Server name (table key)' },
            command: { type: 'string', description: 'Command to run (e.g. "node")' },
            args: { type: 'string', description: 'Comma-separated args (e.g. "server.js,--flag")' },
            url: { type: 'string', description: 'HTTP URL (for remote MCP)' },
            enabled: { type: 'string', description: 'true|false (optional)' }
          },
          async run({ args }) {
            const { CFG } = getPaths()
            const raw = await readFile(CFG)
            const name = String(args.name)
            const argv = typeof args.args === 'undefined'
              ? undefined
              : String(args.args).split(',').map(s => s.trim()).filter(Boolean)
            const enabled = typeof args.enabled === 'undefined'
              ? undefined
              : String(args.enabled).trim().toLowerCase() === 'true'
            const updated = ensureMcpServerInline(raw, name, {
              command: typeof args.command === 'undefined' ? undefined : String(args.command),
              args: argv,
              url: typeof args.url === 'undefined' ? undefined : String(args.url),
              enabled: typeof args.enabled === 'undefined' ? undefined : enabled
            })
            await writeFile(CFG, updated)
            process.stdout.write(`mcp server updated: ${name}\n`)
          }
        })
      }
    })
  }
})
