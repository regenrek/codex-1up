import type { InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import * as p from '@clack/prompts'
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
  const interactive =
    process.stdout.isTTY &&
    !ctx.options.dryRun &&
    !ctx.options.skipConfirmation &&
    !ctx.options.assumeYes
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] mkdir -p ${destRoot}`)
  } else {
    await fs.ensureDir(destRoot)
  }

  ctx.logger.info(`Installing ${selected.length} skill(s) into: ${destRoot}`)

  const installedSkillIds: string[] = []
  for (const skill of selected) {
    const destDir = path.join(destRoot, skill.id)
    const exists = await fs.pathExists(destDir)
    if (exists) {
      if (interactive) {
        const choice = await p.select({
          message: `Skill "${skill.id}" already exists. Overwrite? (backup created)`,
          options: [
            { label: 'Overwrite', value: 'overwrite' },
            { label: 'Skip', value: 'skip' }
          ],
          initialValue: 'overwrite'
        }) as 'overwrite' | 'skip'
        if (p.isCancel(choice) || choice === 'skip') {
          ctx.logger.info(`Skipping existing skill: ${skill.id}`)
          continue
        }
      }
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
    installedSkillIds.push(skill.id)
  }

  if (installedSkillIds.length > 0) {
    const cfgPath = path.join(ctx.homeDir, '.codex', 'config.toml')
    if (await fs.pathExists(cfgPath)) {
      await ensureSkillsConfigEntries(cfgPath, installedSkillIds, ctx)
    } else {
      ctx.logger.info(`Config not found at ${cfgPath}; skipping skills.config entries`)
    }
  }
}

async function ensureSkillsConfigEntries(
  cfgPath: string,
  skillIds: string[],
  ctx: InstallerContext
): Promise<void> {
  const skillPaths = skillIds.map(id => path.join(ctx.homeDir, '.codex', 'skills', id, 'SKILL.md'))
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] update ${cfgPath} (add skills.config entries)`)
    return
  }

  const original = await fs.readFile(cfgPath, 'utf8')
  const missing = skillPaths.filter(p => !original.includes(`path = "${p}"`))
  if (missing.length === 0) return

  const hasSkillsTable = /^\s*\[skills\]\s*$/m.test(original)
  const blocks: string[] = []
  if (!hasSkillsTable) blocks.push('[skills]')
  for (const pth of missing) {
    blocks.push('[[skills.config]]')
    blocks.push('enabled = true')
    blocks.push(`path = "${pth}"`)
    blocks.push('')
  }

  const next = original.replace(/\s*$/, '\n\n') + blocks.join('\n').trimEnd() + '\n'
  await fs.writeFile(cfgPath, next, 'utf8')
  ctx.logger.ok(`Registered ${missing.length} skill(s) in config (skills.config)`)
}
