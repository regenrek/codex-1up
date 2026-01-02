import type { InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import { createBackupPath } from './utils.js'

export async function ensureNotifyHook(ctx: InstallerContext): Promise<void> {
  const notifyTarget = path.join(ctx.homeDir, '.codex', 'notify.sh')
  const templateSrc = path.join(ctx.rootDir, 'templates', 'notification.sh')

  await fs.ensureDir(path.dirname(notifyTarget))

  const notifyMode = ctx.options.notify

  if (notifyMode === 'no') {
    ctx.logger.info('Skipping notify hook installation')
    return
  }

  if (!(await fs.pathExists(templateSrc))) {
    ctx.logger.warn(`Notification template missing at ${templateSrc}; skipping notify hook install`)
    return
  }

  if (await fs.pathExists(notifyTarget)) {
    if (notifyMode === 'yes') {
      const backup = createBackupPath(notifyTarget)
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cp ${notifyTarget} ${backup}`)
      } else {
        await fs.copy(notifyTarget, backup)
      }
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cp ${templateSrc} ${notifyTarget}`)
      } else {
        await fs.copy(templateSrc, notifyTarget)
        await fs.chmod(notifyTarget, 0o755)
      }
      ctx.logger.ok('Updated notify hook (backup created)')
    } else if (!ctx.options.assumeYes && !ctx.options.skipConfirmation) {
      // This should be handled by CLI layer
      ctx.logger.info('Keeping existing notify hook')
    }
  } else {
    if (ctx.options.dryRun) {
      ctx.logger.log(`[dry-run] cp ${templateSrc} ${notifyTarget}`)
    } else {
      await fs.copy(templateSrc, notifyTarget)
      await fs.chmod(notifyTarget, 0o755)
    }
    ctx.logger.ok('Installed notify hook to ~/.codex/notify.sh')
  }

  // Update config to enable notify hook and tui.notifications
  const cfgPath = path.join(ctx.homeDir, '.codex', 'config.toml')
  if (await fs.pathExists(cfgPath)) {
    await updateConfigForNotify(cfgPath, notifyTarget, ctx)
  } else {
    ctx.logger.warn(`Config not found at ${cfgPath}; run again after config is created`)
  }
}

async function updateConfigForNotify(
  cfgPath: string,
  notifyPath: string,
  ctx: InstallerContext
): Promise<void> {
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] update config notify and tui.notifications`)
    return
  }

  const original = await fs.readFile(cfgPath, 'utf8')
  const lines = original.split(/\r?\n/)
  let currentTable = ''
  let rootNotifyIndex: number | null = null
  let rootTuiStart: number | null = null
  // Scan to find existing root notify and [tui] table, and remove misplaced keys
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const table = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (table) {
      currentTable = table[1]
      if (currentTable === 'tui') {
        rootTuiStart = i
      }
      continue
    }
    const isNotify = /^\s*notify\s*=\s*\[/.test(line)
    const isTuiNotifications = /^\s*tui\.notifications\s*=/.test(line)
    const isBareNotifications = /^\s*notifications\s*=/.test(line)
    if (isNotify) {
      if (currentTable === '') {
        if (rootNotifyIndex === null) rootNotifyIndex = i
      } else if (/^profiles\.[^.]+\.features$/.test(currentTable)) {
        // Remove misplaced notify inside features
        lines.splice(i, 1); i--
      }
    }
    if (isTuiNotifications) {
      if (/^profiles\.[^.]+\.features$/.test(currentTable)) {
        lines.splice(i, 1); i--
      }
    }
    // Remove stray root-level notifications = ... (should live under [tui])
    if (isBareNotifications && currentTable === '') {
      lines.splice(i, 1); i--
    }
  }

  // Helper to insert at top (after initial comments/blank lines)
  function insertAtTop(snippet: string) {
    let idx = 0
    while (idx < lines.length && (/^\s*(#.*)?$/.test(lines[idx]))) idx++
    lines.splice(idx, 0, snippet)
  }

  // Ensure root notify contains our hook
  if (rootNotifyIndex !== null) {
    // Merge path if missing
    const m = lines[rootNotifyIndex].match(/^(\s*notify\s*=\s*\[)([^\]]*)\]/)
    if (m) {
      const items = m[2].trim()
      const has = items.includes(JSON.stringify(notifyPath))
      if (!has) {
        const sep = items && !items.endsWith(',') ? ', ' : ''
        lines[rootNotifyIndex] = `${m[1]}${items}${sep}${JSON.stringify(notifyPath)}]`
        ctx.logger.ok('Added notify hook to config')
      }
    }
  } else {
    insertAtTop(`notify = [${JSON.stringify(notifyPath)}]`)
    ctx.logger.ok('Enabled notify hook in config')
  }

  // Ensure [tui].notifications = true at root
  let wroteTui = false
  if (rootTuiStart !== null) {
    // Look for notifications within [tui]
    let i = rootTuiStart + 1
    let found = false
    for (; i < lines.length; i++) {
      const ln = lines[i]
      if (/^\s*\[/.test(ln)) break // next table
      if (/^\s*notifications\s*=/.test(ln)) {
        lines[i] = 'notifications = true'; found = true; wroteTui = true; break
      }
    }
    if (!found) {
      lines.splice(rootTuiStart + 1, 0, 'notifications = true')
      wroteTui = true
    }
  }
  if (!wroteTui) {
    // Insert a [tui] table at top to guarantee root scope
    insertAtTop('[tui]\nnotifications = true')
  }

  // Final sweep: remove any bare notifications outside [tui] and any dotted tui.notifications
  const cleaned: string[] = []
  currentTable = ''
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]
    const m = ln.match(/^\s*\[([^\]]+)\]\s*$/)
    if (m) { currentTable = m[1]; cleaned.push(ln); continue }
    if (/^\s*tui\.notifications\s*=/.test(ln)) continue
    if (/^\s*notifications\s*=/.test(ln) && currentTable !== 'tui') continue
    cleaned.push(ln)
  }

  await fs.writeFile(cfgPath, cleaned.join('\n'), 'utf8')
}
