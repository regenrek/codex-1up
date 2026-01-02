import os from 'os'
import * as path from 'path'
import { promises as fs } from 'fs'
import type { InstallerContext, InstallerOptions } from '../installers/types.js'
import { createLogger } from '../installers/logger.js'
import { findRepoRoot } from '../lib/repoRoot.js'

export function createBaseOptions(): InstallerOptions {
  return {
    profile: 'skip',
    profileScope: 'selected',
    profileMode: 'add',
    setDefaultProfile: false,
    profilesSelected: undefined,
    installTools: 'skip',
    toolsSelected: undefined,
    installCodexCli: 'no',
    notify: 'no',
    globalAgents: 'skip',
    notificationSound: undefined,
    skills: 'skip',
    skillsSelected: undefined,
    mode: 'manual',
    installNode: 'skip',
    shell: 'auto',
    vscodeId: undefined,
    noVscode: true,
    agentsMd: undefined,
    dryRun: false,
    assumeYes: false,
    skipConfirmation: false
  }
}

export async function createActionContext(
  options: Partial<InstallerOptions> = {}
): Promise<InstallerContext> {
  const homeDir = os.homedir()
  const logDir = path.join(homeDir, '.codex-1up')
  await fs.mkdir(logDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const logFile = path.join(logDir, `command-${timestamp}.log`)
  const logger = createLogger(logFile)
  const base = createBaseOptions()
  return {
    cwd: process.cwd(),
    homeDir,
    rootDir: findRepoRoot(),
    logDir,
    logFile,
    options: { ...base, ...options },
    logger
  }
}
