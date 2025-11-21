import type { InstallerContext, Profile } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import { createBackupPath } from './utils.js'

interface ProfileDefaults {
  root: Array<[string, string]>
  features: Array<[string, string]>
}

const PROFILE_DEFAULTS: Record<Profile, ProfileDefaults> = {
  balanced: {
    root: [
      ['approval_policy', '"on-request"'],
      ['sandbox_mode', '"workspace-write"'],
      ['model', '"gpt-5.1-codex-max"'],
      ['model_reasoning_effort', '"medium"']
    ],
    features: [['web_search_request', 'true']]
  },
  safe: {
    root: [
      ['approval_policy', '"on-failure"'],
      ['sandbox_mode', '"workspace-write"'],
      ['model', '"gpt-5.1-codex-max"'],
      ['model_reasoning_effort', '"medium"']
    ],
    features: [['web_search_request', 'false']]
  },
  minimal: {
    root: [
      ['model', '"gpt-5.1-codex-max"'],
      ['model_reasoning_effort', '"medium"']
    ],
    features: [['web_search_request', 'false']]
  },
  yolo: {
    root: [
      ['approval_policy', '"never"'],
      ['sandbox_mode', '"danger-full-access"'],
      ['model', '"gpt-5.1-codex-max"'],
      ['model_reasoning_effort', '"medium"'],
      ['model_reasoning_summary', '"detailed"'],
      ['model_verbosity', '"high"'],
      ['tool_output_token_limit', '25000']
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
  const editor = new TomlEditor(initial)
  let touched = false

  touched = applyProfile(editor, ctx.options.profile, ctx.options.profileMode) || touched
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

function applyProfile(editor: TomlEditor, profile: InstallerContext['options']['profile'], mode: InstallerContext['options']['profileMode']): boolean {
  if (profile === 'skip') return false
  const defaults = PROFILE_DEFAULTS[profile]
  let changed = false
  if (mode === 'overwrite') {
    changed = editor.replaceTable(`profiles.${profile}`, defaults.root) || changed
    changed = editor.replaceTable(`profiles.${profile}.features`, defaults.features) || changed
  } else {
    editor.ensureTable(`profiles.${profile}`)
    for (const [key, value] of defaults.root) {
      changed = editor.setKey(`profiles.${profile}`, key, value, { mode: 'if-missing' }) || changed
    }
    editor.ensureTable(`profiles.${profile}.features`)
    for (const [key, value] of defaults.features) {
      changed = editor.setKey(`profiles.${profile}.features`, key, value, { mode: 'if-missing' }) || changed
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
