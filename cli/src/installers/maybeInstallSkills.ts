import type { InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import { createBackupPath } from './utils.js'
import { listBundledSkills } from './skills.js'

export async function maybeInstallSkills(ctx: InstallerContext): Promise<void> {
  const mode = ctx.options.skills
  if (mode === 'skip') {
    ctx.logger.info('Skipping bundled skills installation')
    return
  }

  const bundled = await listBundledSkills(ctx.rootDir)
  if (bundled.length === 0) {
    ctx.logger.info('No bundled skills found; skipping')
    return
  }

  const selected = (() => {
    if (mode === 'all') return bundled
    const wanted = new Set((ctx.options.skillsSelected || []).map(s => s.trim()).filter(Boolean))
    // Accept both directory ids and declared skill names for convenience.
    return bundled.filter(s => wanted.has(s.id) || wanted.has(s.name))
  })()

  if (selected.length === 0) {
    ctx.logger.info('No skills selected; skipping')
    return
  }

  const destRoot = path.join(ctx.homeDir, '.codex', 'skills')
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] mkdir -p ${destRoot}`)
  } else {
    await fs.ensureDir(destRoot)
  }

  ctx.logger.info(`Installing ${selected.length} skill(s) into: ${destRoot}`)

  for (const skill of selected) {
    const destDir = path.join(destRoot, skill.id)
    const exists = await fs.pathExists(destDir)
    if (exists) {
      const backup = createBackupPath(destDir)
      if (ctx.options.dryRun) {
        ctx.logger.log(`[dry-run] cp -R ${destDir} ${backup}`)
        ctx.logger.log(`[dry-run] rm -rf ${destDir}`)
      } else {
        await fs.copy(destDir, backup)
        await fs.remove(destDir)
      }
      ctx.logger.info(`Backed up existing skill ${skill.id} to: ${backup}`)
    }

    if (ctx.options.dryRun) {
      ctx.logger.log(`[dry-run] cp -R ${skill.srcDir} ${destDir}`)
    } else {
      await fs.copy(skill.srcDir, destDir)
    }
    ctx.logger.ok(`Installed skill: ${skill.id}`)
  }
}

