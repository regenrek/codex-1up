import type { InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'

export async function setupNotificationSound(ctx: InstallerContext): Promise<void> {
  const srcDir = path.join(ctx.rootDir, 'sounds')
  const targetDir = path.join(ctx.homeDir, '.codex', 'sounds')
  await fs.ensureDir(targetDir)

  // Clean up any legacy rc blocks from older versions (they caused shell syntax errors)
  await cleanupLegacyRcBlocks(ctx)

  const selected = ctx.options.notificationSound
  if (selected === 'none') {
    // Disable sound by clearing DEFAULT_CODEX_SOUND in notify.sh
    const notifyFile = path.join(ctx.homeDir, '.codex', 'notify.sh')
    if (await fs.pathExists(notifyFile)) {
      const txt = await fs.readFile(notifyFile, 'utf8')
      const patched = txt.replace(/^DEFAULT_CODEX_SOUND=.*$/m, 'DEFAULT_CODEX_SOUND=""')
      if (ctx.options.dryRun) ctx.logger.log(`[dry-run] patch ${notifyFile} DEFAULT_CODEX_SOUND -> empty`)
      else if (patched !== txt) await fs.writeFile(notifyFile, patched, 'utf8')
    }
    ctx.logger.ok('Notification sound disabled')
    return
  }

  let src: string | undefined
  if (selected && !path.isAbsolute(selected)) src = path.join(srcDir, selected)
  else if (selected) src = selected
  else if (ctx.options.mode === 'recommended') src = path.join(srcDir, 'noti_1.wav')

  if (!src || !(await fs.pathExists(src))) {
    ctx.logger.warn('No notification sound selected or file missing; skipping sound setup')
    return
  }

  const isAbsolute = path.isAbsolute(src)
  const isRepoSound = src.startsWith(path.join(ctx.rootDir, 'sounds'))
  const dest = (!isAbsolute || isRepoSound) ? path.join(targetDir, path.basename(src)) : src
  if (!isAbsolute || isRepoSound) {
    if (ctx.options.dryRun) ctx.logger.log(`[dry-run] cp ${src} ${dest}`)
    else await fs.copy(src, dest)
  }

  // Patch ~/.codex/notify.sh with the selected sound path
  const notifyFile = path.join(ctx.homeDir, '.codex', 'notify.sh')
  if (await fs.pathExists(notifyFile)) {
    const txt = await fs.readFile(notifyFile, 'utf8')
    const line = `DEFAULT_CODEX_SOUND="${dest}"`
    const patched = txt.replace(/^DEFAULT_CODEX_SOUND=.*$/m, line)
    if (patched !== txt) {
      if (ctx.options.dryRun) ctx.logger.log(`[dry-run] patch ${notifyFile} DEFAULT_CODEX_SOUND -> ${dest}`)
      else await fs.writeFile(notifyFile, patched, 'utf8')
    }
  }
  ctx.logger.ok('Notification sound configured')
}

/**
 * Remove legacy codex-1up blocks from shell rc files.
 * Older versions wrote invalid `>>> codex-1up >>>` markers that caused shell syntax errors.
 * This cleanup runs automatically so users don't need to manually fix their rc files.
 */
async function cleanupLegacyRcBlocks(ctx: InstallerContext): Promise<void> {
  const PROJECT = 'codex-1up'
  const rcFiles = [
    path.join(ctx.homeDir, '.bashrc'),
    path.join(ctx.homeDir, '.zshrc'),
    path.join(ctx.homeDir, '.config', 'fish', 'config.fish')
  ]

  for (const rcFile of rcFiles) {
    if (!(await fs.pathExists(rcFile))) continue

    const original = await fs.readFile(rcFile, 'utf8')
    let cleaned = original

    // Remove commented markers (newer format, but no longer needed)
    const commentedStart = `# >>> ${PROJECT} >>>`
    const commentedEnd = `# <<< ${PROJECT} <<<`
    const commentedRegex = new RegExp(`${escapeRegex(commentedStart)}[\\s\\S]*?${escapeRegex(commentedEnd)}\\n?`, 'g')
    cleaned = cleaned.replace(commentedRegex, '')

    // Remove legacy bare markers (invalid shell syntax)
    const legacyStart = `>>> ${PROJECT} >>>`
    const legacyEnd = `<<< ${PROJECT} <<<`
    const legacyRegex = new RegExp(`${escapeRegex(legacyStart)}[\\s\\S]*?${escapeRegex(legacyEnd)}\\n?`, 'g')
    cleaned = cleaned.replace(legacyRegex, '')

    if (cleaned !== original) {
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cleanup legacy codex-1up block from ${rcFile}`)
      } else {
        await fs.writeFile(rcFile, cleaned, 'utf8')
        ctx.logger.ok(`Cleaned up legacy codex-1up block from ${rcFile}`)
      }
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
