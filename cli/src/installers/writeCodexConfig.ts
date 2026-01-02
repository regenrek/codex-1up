import type { InstallerContext, Profile } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import { createBackupPath } from './utils.js'

interface ProfileDefaults {
  root: Array<[string, string]>
  features: Array<[string, string]>
  tables?: Record<string, Array<[string, string]>>
}

const PROFILE_DEFAULTS: Record<Profile, ProfileDefaults> = {
  balanced: {
    root: [
      ['approval_policy', '"on-request"'],
      ['sandbox_mode', '"workspace-write"'],
      ['model', '"gpt-5.2-codex"'],
      ['model_reasoning_effort', '"medium"'],
      ['model_reasoning_summary', '"concise"']
    ],
    features: [['web_search_request', 'true']],
    tables: {
      // Required for web search (and other networked commands) in workspace-write sandbox.
      sandbox_workspace_write: [['network_access', 'true']]
    }
  },
  safe: {
    root: [
      ['approval_policy', '"on-failure"'],
      ['sandbox_mode', '"read-only"'],
      ['model', '"gpt-5.2-codex"'],
      ['model_reasoning_effort', '"medium"'],
      ['model_reasoning_summary', '"concise"']
    ],
    features: [['web_search_request', 'false']]
  },
  yolo: {
    root: [
      ['approval_policy', '"never"'],
      ['sandbox_mode', '"danger-full-access"'],
      ['model', '"gpt-5.2-codex"'],
      ['model_reasoning_effort', '"high"'],
      ['model_reasoning_summary', '"detailed"']
    ],
    features: [['web_search_request', 'true']]
  }
}

const HEADER_COMMENT = '# ~/.codex/config.toml — managed by codex-1up (patch mode)\n'

export async function writeCodexConfig(ctx: InstallerContext): Promise<void> {
  const cfgPath = path.join(ctx.homeDir, '.codex', 'config.toml')
  await fs.ensureDir(path.dirname(cfgPath))
  const exists = await fs.pathExists(cfgPath)
  const initial = exists ? await fs.readFile(cfgPath, 'utf8') : HEADER_COMMENT
  const migratedWindowsSandbox = migrateExperimentalWindowsSandboxFlag(initial)
  const migratedLegacyFeatures = migrateLegacyRootFeatureFlags(migratedWindowsSandbox.toml)
  const editor = new TomlEditor(migratedLegacyFeatures.toml)
  let touched = migratedWindowsSandbox.changed || migratedLegacyFeatures.changed

  touched = applyProfile(
    editor,
    ctx.options.profileScope,
    ctx.options.profile,
    ctx.options.profileMode,
    ctx.options.profilesSelected
  ) || touched
  touched = applyDefaultProfile(editor, ctx.options.profile, ctx.options.setDefaultProfile) || touched
  touched = applyNotifications(editor, ctx.options.notificationSound) || touched

  if (!touched) {
    ctx.logger.info('Config already up to date; no changes needed.')
    return
  }

  const finalContent = editor.content()
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] write ${cfgPath}`)
    ctx.logger.log(finalContent)
    return
  }

  if (exists) {
    const backup = createBackupPath(cfgPath)
    await fs.copy(cfgPath, backup)
    ctx.logger.info(`Backed up current config to ${backup}`)
  }

  await fs.writeFile(cfgPath, finalContent, 'utf8')
  ctx.logger.ok('Updated ~/.codex/config.toml with requested settings.')
}

function applyProfile(
  editor: TomlEditor,
  scope: InstallerContext['options']['profileScope'],
  profile: InstallerContext['options']['profile'],
  mode: InstallerContext['options']['profileMode'],
  selected: InstallerContext['options']['profilesSelected']
): boolean {
  let targets: Profile[] = []
  if (scope === 'all') {
    targets = Object.keys(PROFILE_DEFAULTS) as Profile[]
  } else if (scope === 'selected') {
    targets = (selected || []) as Profile[]
  } else {
    if (profile === 'skip') return false
    targets = [profile] as Profile[]
  }
  if (targets.length === 0) return false

  let changed = false
  for (const name of targets) {
    const defaults = PROFILE_DEFAULTS[name]
    if (mode === 'overwrite') {
      changed = editor.replaceTable(`profiles.${name}`, defaults.root) || changed
      changed = editor.replaceTable(`profiles.${name}.features`, defaults.features) || changed
      for (const [table, lines] of Object.entries(defaults.tables || {})) {
        changed = editor.replaceTable(`profiles.${name}.${table}`, lines) || changed
      }
    } else {
      editor.ensureTable(`profiles.${name}`)
      for (const [key, value] of defaults.root) {
        changed = editor.setKey(`profiles.${name}`, key, value, { mode: 'if-missing' }) || changed
      }
      editor.ensureTable(`profiles.${name}.features`)
      for (const [key, value] of defaults.features) {
        changed = editor.setKey(`profiles.${name}.features`, key, value, { mode: 'if-missing' }) || changed
      }
      for (const [table, lines] of Object.entries(defaults.tables || {})) {
        editor.ensureTable(`profiles.${name}.${table}`)
        for (const [key, value] of lines) {
          changed = editor.setKey(`profiles.${name}.${table}`, key, value, { mode: 'if-missing' }) || changed
        }
      }
    }
  }
  return changed
}

function applyDefaultProfile(editor: TomlEditor, profile: InstallerContext['options']['profile'], setDefault: boolean): boolean {
  if (!setDefault || profile === 'skip') return false
  return editor.setRootKey('profile', `"${profile}"`, { mode: 'force' })
}

function applyNotifications(editor: TomlEditor, sound: string | undefined): boolean {
  if (!sound || sound === 'none') return false
  editor.ensureTable('tui')
  const existing = editor.getValue('tui', 'notifications')
  if (existing) {
    const trimmed = existing.trim().toLowerCase()
    if (trimmed.startsWith('true') || trimmed.startsWith('[')) {
      return false
    }
  }
  return editor.setKey('tui', 'notifications', 'true', { mode: 'force' })
}

interface SetKeyOptions {
  mode: 'force' | 'if-missing'
}

class TomlEditor {
  private text: string

  constructor(initial: string) {
    this.text = initial || ''
  }

  content(): string {
    return ensureEndsWithNewline(this.text)
  }

  ensureTable(table: string): boolean {
    if (this.hasTable(table)) return false
    const prefix = this.text.length === 0 ? '' : formatTableSeparator(this.text)
    this.text = prefix + `[${table}]\n`
    return true
  }

  setKey(table: string, key: string, value: string, options: SetKeyOptions): boolean {
    const range = findTableRange(this.text, table)
    if (!range) {
      this.ensureTable(table)
      return this.setKey(table, key, value, options)
    }
    const block = this.text.slice(range.start, range.end)
    const regex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*$`, 'm')
    const match = regex.exec(block)
    if (match) {
      if (options.mode === 'if-missing') return false
      const before = this.text
      const absStart = range.start + match.index
      const absEnd = absStart + match[0].length
      this.text = before.slice(0, absStart) + `${key} = ${value}` + before.slice(absEnd)
      return this.text !== before
    }
    const before = this.text
    const insertionPos = range.end
    const lead = before.slice(0, insertionPos)
    const tail = before.slice(insertionPos)
    const needsLeadingNewline = lead.length > 0 && !lead.endsWith('\n')
    const needsTrailingNewline = tail.length > 0 && !tail.startsWith('\n')
    const line = `${needsLeadingNewline ? '\n' : ''}${key} = ${value}\n${needsTrailingNewline ? '\n' : ''}`
    this.text = lead + line + tail
    return this.text !== before
  }

  getValue(table: string, key: string): string | undefined {
    const range = findTableRange(this.text, table)
    if (!range) return undefined
    const block = this.text.slice(range.start, range.end)
    const regex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`, 'm')
    const match = regex.exec(block)
    return match ? match[1] : undefined
  }

  replaceTable(table: string, lines: Array<[string, string]>): boolean {
    const body = lines.map(([k, v]) => `${k} = ${v}`).join('\n')
    const block = `[${table}]\n${body}\n\n`
    const before = this.text
    const range = findTableRange(this.text, table)
    if (!range) {
      const sep = before.length === 0 ? '' : formatTableSeparator(before)
      this.text = sep + block
      return this.text !== before
    }
    this.text = before.slice(0, range.start) + block + before.slice(range.end)
    return this.text !== before
  }

  setRootKey(key: string, value: string, options: SetKeyOptions): boolean {
    const range = findRootRange(this.text)
    const block = this.text.slice(range.start, range.end)
    const regex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=.*$`, 'm')
    const match = regex.exec(block)
    if (match) {
      if (options.mode === 'if-missing') return false
      const before = this.text
      const absStart = range.start + match.index
      const absEnd = absStart + match[0].length
      this.text = before.slice(0, absStart) + `${key} = ${value}` + before.slice(absEnd)
      return this.text !== before
    }
    const before = this.text
    const insertionPos = range.end
    const needsLeading = insertionPos > 0 && !before.slice(0, insertionPos).endsWith('\n')
    const tail = before.slice(insertionPos)
    const needsTrailing = tail.length > 0 && !tail.startsWith('\n')
    const line = `${needsLeading ? '\n' : ''}${key} = ${value}\n${needsTrailing ? '\n' : ''}`
    this.text = before.slice(0, insertionPos) + line + tail
    return this.text !== before
  }

  private hasTable(table: string): boolean {
    return findTableRange(this.text, table) !== null
  }
}

function findTableRange(text: string, table: string): { start: number; end: number } | null {
  const regex = /^\s*\[([^\]]+)\]\s*$/gm
  const matches: Array<{ name: string; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    matches.push({ name: match[1].trim(), index: match.index })
  }
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].name === table) {
      const start = matches[i].index
      const end = matches[i + 1]?.index ?? text.length
      return { start, end }
    }
  }
  return null
}

function findRootRange(text: string): { start: number; end: number } {
  const regex = /^\s*\[([^\]]+)\]\s*$/gm
  const firstMatch = regex.exec(text)
  if (!firstMatch) return { start: 0, end: text.length }
  return { start: 0, end: firstMatch.index }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureEndsWithNewline(text: string): string {
  return text.endsWith('\n') ? text : text + '\n'
}

function formatTableSeparator(text: string): string {
  let out = text
  if (!out.endsWith('\n')) out += '\n'
  if (!out.endsWith('\n\n')) out += '\n'
  return out
}

function migrateExperimentalWindowsSandboxFlag(toml: string): { toml: string; changed: boolean } {
  // Codex CLI v0.74 deprecates `enable_experimental_windows_sandbox` in favor of
  // `[features].experimental_windows_sandbox`.
  const OLD_KEY = 'enable_experimental_windows_sandbox'
  const NEW_KEY = 'experimental_windows_sandbox'

  if (!toml.includes(OLD_KEY)) return { toml, changed: false }

  const lines = toml.split(/\r?\n/)
  let currentTable = ''

  const isRelevantTable = (table: string) =>
    table === 'features' || /^profiles\.[^.]+\.features$/.test(table)

  // First pass: find which relevant tables already define the new key.
  const tablesWithNewKey = new Set<string>()
  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (table) {
      currentTable = table[1].trim()
      continue
    }
    if (/^\s*#/.test(line)) continue
    if (!isRelevantTable(currentTable)) continue
    if (new RegExp(`^\\s*${NEW_KEY}\\s*=`).test(line)) tablesWithNewKey.add(currentTable)
  }

  // Second pass: rename/remove old key lines; also capture any legacy root-level setting.
  currentTable = ''
  let changed = false
  let rootOldValue: string | undefined

  const out: string[] = []
  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (table) {
      currentTable = table[1].trim()
      out.push(line)
      continue
    }

    if (!/^\s*#/.test(line)) {
      if (currentTable === '') {
        const m = line.match(new RegExp(`^\\s*${OLD_KEY}\\s*=\\s*(.+?)\\s*$`))
        if (m) {
          rootOldValue = m[1]
          changed = true
          continue // drop legacy root key
        }
      }

      if (isRelevantTable(currentTable)) {
        if (new RegExp(`^\\s*${OLD_KEY}\\s*=`).test(line)) {
          if (tablesWithNewKey.has(currentTable)) {
            changed = true
            continue // new key already exists; remove deprecated one
          }
          out.push(line.replace(new RegExp(`^(\\s*)${OLD_KEY}(\\s*=\\s*)`), `$1${NEW_KEY}$2`))
          changed = true
          continue
        }
      }
    }

    out.push(line)
  }

  let next = out.join('\n')

  // If the legacy key was set at root, migrate it into [features] unless already set there.
  if (rootOldValue !== undefined) {
    const featuresRange = findTableRange(next, 'features')
    const alreadySetInFeatures = (() => {
      if (!featuresRange) return false
      const block = next.slice(featuresRange.start, featuresRange.end)
      return new RegExp(`^\\s*${NEW_KEY}\\s*=`,'m').test(block)
    })()

    if (!alreadySetInFeatures) {
      const line = `${NEW_KEY} = ${rootOldValue}`
      if (featuresRange) {
        // Insert at end of the [features] table.
        const before = next.slice(0, featuresRange.end)
        const after = next.slice(featuresRange.end)
        const needsLeadNl = before.length > 0 && !before.endsWith('\n')
        const needsTrailNl = after.length > 0 && !after.startsWith('\n')
        next = before + `${needsLeadNl ? '\n' : ''}${line}\n${needsTrailNl ? '\n' : ''}` + after
      } else {
        // No [features] table exists; append one.
        const sep = next.length === 0 ? '' : formatTableSeparator(next)
        next = sep + `[features]\n${line}\n`
      }
      changed = true
    }
  }

  return { toml: next, changed }
}

function migrateLegacyRootFeatureFlags(toml: string): { toml: string; changed: boolean } {
  // Codex CLI deprecated a number of root-level booleans in favor of [features].*
  // Keep this list intentionally small and high-confidence.
  const MAPPINGS: Array<{ oldKey: string; newKey: string }> = [
    { oldKey: 'experimental_use_exec_command_tool', newKey: 'streamable_shell' },
    { oldKey: 'experimental_use_unified_exec_tool', newKey: 'unified_exec' },
    { oldKey: 'experimental_use_rmcp_client', newKey: 'rmcp_client' },
    { oldKey: 'include_apply_patch_tool', newKey: 'apply_patch_freeform' }
  ]

  const hasAny = MAPPINGS.some(m => toml.includes(m.oldKey))
  if (!hasAny) return { toml, changed: false }

  function parseBoolRhs(rhs: string): string | undefined {
    const trimmed = rhs.trim()
    const m = /^(true|false)\b/i.exec(trimmed)
    return m ? m[1].toLowerCase() : (trimmed || undefined)
  }

  const lines = toml.split(/\r?\n/)
  let currentTable = ''

  const wanted: Record<string, string> = {}
  const out: string[] = []
  let changed = false

  for (const line of lines) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (table) {
      currentTable = table[1].trim()
      out.push(line)
      continue
    }

    if (currentTable === '' && !/^\s*#/.test(line)) {
      let migrated = false
      for (const { oldKey, newKey } of MAPPINGS) {
        const m = line.match(new RegExp(`^\\s*${escapeRegExp(oldKey)}\\s*=\\s*(.+?)\\s*$`))
        if (m) {
          const rhs = parseBoolRhs(m[1])
          if (rhs !== undefined) wanted[newKey] = rhs
          changed = true
          migrated = true
          break
        }
      }
      if (migrated) continue
    }

    out.push(line)
  }

  let next = out.join('\n')
  if (Object.keys(wanted).length === 0) return { toml: next, changed }

  // Insert each migrated feature into [features] if not already present.
  for (const { newKey } of MAPPINGS) {
    const rhs = wanted[newKey]
    if (rhs === undefined) continue

    const featuresRange = findTableRange(next, 'features')
    const alreadySetInFeatures = (() => {
      if (!featuresRange) return false
      const block = next.slice(featuresRange.start, featuresRange.end)
      return new RegExp(`^\\s*${escapeRegExp(newKey)}\\s*=`, 'm').test(block)
    })()

    if (alreadySetInFeatures) continue

    const line = `${newKey} = ${rhs}`
    if (featuresRange) {
      const before = next.slice(0, featuresRange.end)
      const after = next.slice(featuresRange.end)
      const needsLeadNl = before.length > 0 && !before.endsWith('\n')
      const needsTrailNl = after.length > 0 && !after.startsWith('\n')
      next = before + `${needsLeadNl ? '\n' : ''}${line}\n${needsTrailNl ? '\n' : ''}` + after
    } else {
      const sep = next.length === 0 ? '' : formatTableSeparator(next)
      next = sep + `[features]\n${line}\n`
    }
    changed = true
  }

  return { toml: next, changed }
}
