import type { InstallerContext, PackageManager, ToolId } from './types.js'
import { detectPackageManager, runCommand, createPrivilegedPmCmd, needCmd } from './utils.js'
import { listTools } from './tooling.js'
import * as path from 'path'
import fs from 'fs-extra'
import { which } from 'zx'

export async function ensureTools(ctx: InstallerContext): Promise<void> {
  if (ctx.options.installTools === 'skip') {
    ctx.logger.info('Skipping developer tool installs (user choice)')
    return
  }

  const selectedIds = resolveSelectedTools(ctx.options.installTools, ctx.options.toolsSelected)
  if (selectedIds.length === 0) {
    ctx.logger.info('Skipping developer tool installs (no tools selected)')
    return
  }

  const pm = await detectPackageManager()
  ctx.logger.info(`Detected package manager: ${pm}`)

  if (pm === 'none') {
    ctx.logger.warn('Could not detect a supported package manager; please install tools manually')
    return
  }

  const tools = listTools().filter((t) => selectedIds.includes(t.id))
  const packages = uniquePackages(tools, pm)

  if (packages.length > 0) {
    if (pm !== 'brew') {
      const isRoot = typeof process.getuid === 'function' && process.getuid() === 0
      if (!isRoot) {
        ctx.logger.warn('Package installation may require sudo password. Please enter it when prompted.')
      }
    }

    switch (pm) {
      case 'brew':
        await runCommand('brew', ['update'], {
          dryRun: ctx.options.dryRun,
          logger: ctx.logger
        })
        await runCommand('brew', ['install', ...packages], {
          dryRun: ctx.options.dryRun,
          logger: ctx.logger
        })
        break
      case 'apt':
        {
          const { cmd: aptCmd, argsPrefix } = createPrivilegedPmCmd('apt-get')
          ctx.logger.info('Running apt-get update...')
          try {
            await runCommand(aptCmd, [...argsPrefix, 'update', '-y'], {
              dryRun: ctx.options.dryRun,
              logger: ctx.logger
            })
          } catch {
            ctx.logger.warn(
              `apt-get update failed; install tools manually: ${packages.join(', ')}`
            )
            break
          }

          for (const pkg of packages) {
            try {
              await runCommand(aptCmd, [...argsPrefix, 'install', '-y', pkg], {
                dryRun: ctx.options.dryRun,
                logger: ctx.logger
              })
            } catch {
              ctx.logger.warn(`apt-get install failed for ${pkg}; install manually if needed.`)
            }
          }
        }
        break
      case 'dnf':
        {
          const { cmd: dnfCmd, argsPrefix } = createPrivilegedPmCmd('dnf')
          await runCommand(dnfCmd, [...argsPrefix, 'install', '-y', ...packages], {
            dryRun: ctx.options.dryRun,
            logger: ctx.logger
          }).catch(() => {})
        }
        break
      case 'pacman':
        {
          const { cmd: pacmanCmd, argsPrefix } = createPrivilegedPmCmd('pacman')
          await runCommand(pacmanCmd, [...argsPrefix, '-Sy', '--noconfirm', ...packages], {
            dryRun: ctx.options.dryRun,
            logger: ctx.logger
          }).catch(() => {})
        }
        break
      case 'zypper':
        {
          const { cmd: zypperCmd, argsPrefix } = createPrivilegedPmCmd('zypper')
          await runCommand(zypperCmd, [...argsPrefix, 'refresh'], {
            dryRun: ctx.options.dryRun,
            logger: ctx.logger
          })
          await runCommand(zypperCmd, [...argsPrefix, 'install', '-y', ...packages], {
            dryRun: ctx.options.dryRun,
            logger: ctx.logger
          }).catch(() => {})
        }
        break
    }
  }

  if (selectedIds.includes('fd')) {
    await ensureAlias(ctx, 'fdfind', 'fd')
  }
  if (selectedIds.includes('bat')) {
    await ensureAlias(ctx, 'batcat', 'bat')
  }

  await logToolSummary(ctx, tools)
}

function resolveSelectedTools(mode: InstallerContext['options']['installTools'], selected: ToolId[] | undefined): ToolId[] {
  if (mode === 'all') return listTools().map((t) => t.id)
  if (mode === 'select') return selected ? [...selected] : []
  return []
}

function uniquePackages(tools: ReturnType<typeof listTools>, pm: PackageManager): string[] {
  const packages: string[] = []
  for (const tool of tools) {
    const entries = tool.packages[pm] || []
    for (const pkg of entries) {
      if (!packages.includes(pkg)) packages.push(pkg)
    }
  }
  return packages
}

async function ensureAlias(ctx: InstallerContext, sourceBin: string, targetBin: string): Promise<void> {
  if (!(await needCmd(sourceBin))) return
  if (await needCmd(targetBin)) return
  const localBin = path.join(ctx.homeDir, '.local', 'bin')
  await fs.ensureDir(localBin)
  const linkPath = path.join(localBin, targetBin)
  if (await fs.pathExists(linkPath)) return
  let sourcePath = sourceBin
  try {
    sourcePath = await which(sourceBin)
  } catch (error) {
    void error
  }
  if (ctx.options.dryRun) {
    ctx.logger.log(`[dry-run] ln -s ${sourcePath} ${linkPath}`)
    return
  }
  await fs.symlink(sourcePath, linkPath)
  ctx.logger.ok(`${targetBin} alias created at ~/.local/bin/${targetBin}`)
}

async function logToolSummary(ctx: InstallerContext, tools: ReturnType<typeof listTools>): Promise<void> {
  for (const tool of tools) {
    const installed = await isToolInstalled(tool)
    if (installed) {
      ctx.logger.ok(`${tool.id} ✓`)
    } else {
      ctx.logger.warn(`${tool.id} not detected after install`)
    }
  }
}

async function isToolInstalled(tool: ReturnType<typeof listTools>[number]): Promise<boolean> {
  for (const bin of tool.bins) {
    if (await needCmd(bin)) return true
  }
  return false
}
