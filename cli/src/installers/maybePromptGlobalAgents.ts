import type { InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import { createBackupPath } from './utils.js'

export async function maybePromptGlobalAgents(ctx: InstallerContext): Promise<void> {
  const targetPath = path.join(ctx.homeDir, '.codex', 'AGENTS.md')
  const gaMode = ctx.options.globalAgents

  if (gaMode === 'skip') {
    ctx.logger.info('Skipping global AGENTS.md creation')
    return
  }

  const templateSrc = path.join(ctx.rootDir, 'templates', 'agent-templates', 'AGENTS-default.md')

  if (!(await fs.pathExists(templateSrc))) {
    ctx.logger.warn(`Template not found at ${templateSrc}`)
    return
  }

  switch (gaMode) {
    case 'create-default': {
      if (await fs.pathExists(targetPath)) {
        ctx.logger.info('Global AGENTS.md already exists; leaving unchanged')
        return
      }
      await fs.ensureDir(path.dirname(targetPath))
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cp ${templateSrc} ${targetPath}`)
      } else {
        await fs.copy(templateSrc, targetPath)
      }
      ctx.logger.ok(`Wrote ${targetPath}`)
      break
    }

    case 'overwrite-default': {
      await fs.ensureDir(path.dirname(targetPath))
      if (await fs.pathExists(targetPath)) {
        const backup = createBackupPath(targetPath)
        if (ctx.options.dryRun) {
          ctx.logger.log(`[dry-run] cp ${targetPath} ${backup}`)
        } else {
          await fs.copy(targetPath, backup)
        }
        ctx.logger.info(`Backed up existing AGENTS.md to: ${backup}`)
      }
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cp ${templateSrc} ${targetPath}`)
      } else {
        await fs.copy(templateSrc, targetPath)
      }
      ctx.logger.ok(`Wrote ${targetPath}`)
      break
    }

    case 'append-default': {
      await fs.ensureDir(path.dirname(targetPath))
      if (await fs.pathExists(targetPath)) {
        const backup = createBackupPath(targetPath)
        if (ctx.options.dryRun) {
          ctx.logger.log(`[dry-run] cp ${targetPath} ${backup}`)
        } else {
          await fs.copy(targetPath, backup)
        }
        ctx.logger.info(`Backed up existing AGENTS.md to: ${backup}`)
      }
      const templateContent = await fs.readFile(templateSrc, 'utf8')
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] append template to ${targetPath}`)
      } else {
        await fs.appendFile(targetPath, `\n---\n\n${templateContent}`, 'utf8')
      }
      ctx.logger.ok(`Appended template to ${targetPath}`)
      break
    }

    default:
      // Should be handled by CLI layer for interactive prompts
      if (ctx.options.skipConfirmation) {
        ctx.logger.info('Skipping global AGENTS.md creation (non-interactive mode)')
      }
      break
  }
}
