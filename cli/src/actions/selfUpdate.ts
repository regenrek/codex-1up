import * as p from '@clack/prompts'
import { PACKAGE_NAME, PACKAGE_VERSION } from '../lib/package.js'
import type { Logger } from '../installers/types.js'
import { runCommand } from '../installers/utils.js'
import { resolveNodeGlobalPm } from '../installers/nodeGlobal.js'

export interface SelfUpdateStatus {
  current: string
  latest?: string
  updateAvailable: boolean
}

export interface SelfUpdateOptions {
  interactive: boolean
  assumeYes?: boolean
  skipConfirmation?: boolean
  dryRun?: boolean
  logger?: Logger
}

export async function checkSelfUpdate(): Promise<SelfUpdateStatus> {
  const current = PACKAGE_VERSION
  const latest = await getLatestVersion(PACKAGE_NAME)
  const updateAvailable = Boolean(latest && isNewerVersion(latest, current))
  return { current, latest, updateAvailable }
}

export async function runSelfUpdate(options: SelfUpdateOptions): Promise<'updated'|'skipped'|'up-to-date'|'error'> {
  const logger = options.logger
  const status = await checkSelfUpdate()
  if (!status.latest) {
    logger?.warn('Unable to check for codex-1up updates right now.')
    return 'error'
  }

  if (!status.updateAvailable) {
    logger?.ok(`codex-1up is up-to-date (v${status.current}).`)
    return 'up-to-date'
  }

  const promptAllowed = options.interactive && !options.assumeYes && !options.skipConfirmation
  let shouldUpdate = options.assumeYes || options.skipConfirmation

  if (promptAllowed) {
    const answer = await p.confirm({
      message: `New codex-1up version available (v${status.latest}). Update now?`,
      initialValue: true
    })
    if (p.isCancel(answer)) {
      logger?.info('Update canceled.')
      return 'skipped'
    }
    shouldUpdate = Boolean(answer)
  }

  if (!shouldUpdate) {
    logger?.info('Skipping codex-1up update.')
    return 'skipped'
  }

  const nodePm = await resolveNodeGlobalPm({
    logger,
    interactive: options.interactive && !options.assumeYes && !options.skipConfirmation
  })

  if (nodePm === 'none') {
    logger?.warn('No supported Node package manager found; cannot update codex-1up.')
    return 'error'
  }

  const pkgSpec = status.latest ? `${PACKAGE_NAME}@${status.latest}` : PACKAGE_NAME
  const dryRun = Boolean(options.dryRun)

  if (nodePm === 'pnpm') {
    logger?.info('Updating codex-1up via pnpm')
    await runCommand('pnpm', ['add', '-g', pkgSpec], { dryRun, logger })
  } else {
    logger?.info('Updating codex-1up via npm')
    await runCommand('npm', ['install', '-g', pkgSpec], { dryRun, logger })
  }

  logger?.ok(`codex-1up updated to v${status.latest}`)
  return 'updated'
}

async function getLatestVersion(pkgName: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`)
    if (!res.ok) return undefined
    const data = (await res.json()) as { version?: string }
    return data.version
  } catch {
    return undefined
  }
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParsed = parseSemver(latest)
  const currentParsed = parseSemver(current)
  if (!latestParsed || !currentParsed) {
    return latest !== current
  }
  for (let i = 0; i < 3; i++) {
    if (latestParsed[i] > currentParsed[i]) return true
    if (latestParsed[i] < currentParsed[i]) return false
  }
  return false
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
