import * as p from '@clack/prompts'
import type { InstallerContext } from './types.js'
import { needCmd, runCommand } from './utils.js'
import { getCodexStatus } from './codexStatus.js'
import { resolveNodeGlobalPm } from './nodeGlobal.js'

const CODEX_PKG = '@openai/codex'

export async function installNpmGlobals(ctx: InstallerContext): Promise<void> {
  if (ctx.options.installCodexCli === 'no') {
    ctx.logger.info('Skipping Codex CLI install (user choice)')
    return
  }

  const interactive =
    process.stdout.isTTY &&
    !ctx.options.dryRun &&
    !ctx.options.skipConfirmation &&
    !ctx.options.assumeYes

  const status = await getCodexStatus(ctx.logger)

  if (status.found) {
    const versionLabel = status.version ? `v${status.version}` : 'unknown version'
    ctx.logger.info(`Found Codex CLI ${versionLabel}. Checking for newer version...`)
  } else {
    ctx.logger.info('Codex CLI not found.')
  }

  let shouldInstall = false
  let shouldUpdate = false

  if (!status.found) {
    if (ctx.options.installCodexCli === 'yes') {
      shouldInstall = true
    } else if (interactive) {
      const answer = await p.confirm({
        message: 'Codex CLI not found. Install now?',
        initialValue: true
      })
      if (p.isCancel(answer)) {
        ctx.logger.info('Codex CLI install cancelled.')
      } else if (answer) {
        shouldInstall = true
      } else {
        ctx.logger.info('Skipping Codex CLI install.')
      }
    } else {
      shouldInstall = true
    }
  } else if (status.updateAvailable) {
    const latestLabel = status.latest ? `v${status.latest}` : 'a newer version'
    if (ctx.options.installCodexCli === 'yes') {
      shouldUpdate = true
    } else if (interactive) {
      const answer = await p.confirm({
        message: `Codex CLI ${status.version} found; latest is ${latestLabel}. Update now?`,
        initialValue: true
      })
      if (p.isCancel(answer)) {
        ctx.logger.info('Codex CLI update cancelled; keeping existing version.')
      } else if (answer) {
        shouldUpdate = true
      } else {
        ctx.logger.info('Keeping existing Codex CLI version as requested.')
      }
    } else {
      shouldUpdate = true
    }
  } else if (status.found) {
    if (status.latest && status.version) {
      ctx.logger.ok(`Codex CLI up-to-date (${status.version})`)
    } else {
      ctx.logger.ok('Codex CLI found; unable to verify latest version.')
    }
  }

  const updates: string[] = []
  if (shouldInstall || shouldUpdate) {
    if (status.latest) {
      updates.push(`${CODEX_PKG}@${status.latest}`)
    } else {
      updates.push(CODEX_PKG)
    }
  }

  if (updates.length === 0) {
    return
  }

  const nodePm = await resolveNodeGlobalPm({
    logger: ctx.logger,
    interactive: process.stdout.isTTY &&
      !ctx.options.dryRun &&
      !ctx.options.skipConfirmation &&
      !ctx.options.assumeYes
  })

  if (nodePm === 'none') {
    ctx.logger.warn('Skipping global Node installs because no supported package manager was found.')
  } else if (nodePm === 'pnpm') {
    ctx.logger.info('Installing/updating Codex CLI via pnpm')
    await runCommand('pnpm', ['add', '-g', ...updates], {
      dryRun: ctx.options.dryRun,
      logger: ctx.logger
    })
  } else {
    ctx.logger.info('Installing/updating Codex CLI via npm')
    await runCommand('npm', ['install', '-g', ...updates], {
      dryRun: ctx.options.dryRun,
      logger: ctx.logger
    })
  }

  if (await needCmd('codex')) {
    ctx.logger.ok('Codex CLI installed')
  } else {
    ctx.logger.err('Codex CLI not found after install')
  }
}
