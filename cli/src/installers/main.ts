import type { InstallerOptions, InstallerContext } from './types.js'
import fs from 'fs-extra'
import * as path from 'path'
import * as os from 'os'
import { createLogger } from './logger.js'
import { ensureNode } from './ensureNode.js'
import { installNpmGlobals } from './installNpmGlobals.js'
import { ensureTools } from './ensureTools.js'
import { writeCodexConfig } from './writeCodexConfig.js'
import { ensureNotifyHook } from './ensureNotifyHook.js'
import { setupNotificationSound } from './setupNotificationSound.js'
import { maybePromptGlobalAgents } from './maybePromptGlobalAgents.js'
import { maybeInstallVscodeExt } from './maybeInstallVscodeExt.js'
import { maybeWriteAgents } from './maybeWriteAgents.js'
import { maybeInstallSkills } from './maybeInstallSkills.js'
import { getInstalledCodexVersion } from './codexStatus.js'
import { needCmd } from './utils.js'

const PROJECT = 'codex-1up'

export async function runInstaller(options: InstallerOptions, rootDir: string): Promise<void> {
  const homeDir = os.homedir()
  const logDir = path.join(homeDir, `.${PROJECT}`)
  await fs.ensureDir(logDir)
  try {
    await fs.chmod(logDir, 0o700)
  } catch {
    // best-effort on platforms without POSIX perms
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const logFile = path.join(logDir, `install-${timestamp}.log`)

  const logger = createLogger(logFile)

  logger.info(`==> ${PROJECT} installer`)
  logger.info(`Log: ${logFile}`)

  const ctx: InstallerContext = {
    cwd: process.cwd(),
    homeDir,
    rootDir,
    logDir,
    logFile,
    codexVersion: undefined,
    options,
    logger
  }

  try {
    await ensureNode(ctx)
    await installNpmGlobals(ctx)
    await ensureTools(ctx)

    const hasCodex = await needCmd('codex')
    const configWritable = hasCodex || ctx.options.installCodexCli === 'yes'
    if (!configWritable) {
      logger.warn('Codex CLI not found and codex install was skipped; skipping config/notify setup until codex is installed.')
    }

    if (configWritable) {
      // Detect installed codex version only when needed for config gating.
      // This avoids potentially slow/fragile version probes in environments where `needCmd('codex')`
      // is mocked (tests) or where `codex --version` may be slow to spawn.
      if (ctx.options.suppressUnstableWarning === true) {
        const installed = await getInstalledCodexVersion()
        ctx.codexVersion = installed.version
      }

      await writeCodexConfig(ctx)
      await ensureNotifyHook(ctx)
      await setupNotificationSound(ctx)
      await maybePromptGlobalAgents(ctx)
    }

    await maybeInstallSkills(ctx)
    await maybeInstallVscodeExt(ctx)
    await maybeWriteAgents(ctx)

    logger.ok('All done. Open a new shell or \'source\' your rc file to load aliases.')
    logger.info('Next steps:')
    logger.info('  1) codex    # sign in; then ask it to plan a refactor')
    logger.info(`  2) ./bin/codex-1up agents --path $PWD   # write a starter AGENTS.md to your repo`)
    logger.info('  3) Review ~/.codex/config.toml (see: https://github.com/openai/codex/blob/main/docs/config.md)')
  } catch (error) {
    logger.err(`Installation failed: ${error}`)
    throw error
  }
}
