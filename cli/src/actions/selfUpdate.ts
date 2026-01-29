import * as p from '@clack/prompts'
import { PACKAGE_NAME, PACKAGE_VERSION } from '../lib/package.js'
import type { Logger } from '../installers/types.js'
import { execCapture, needCmd, runCommand } from '../installers/utils.js'
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
  // Public API: keep fast path only (no npm fallback).
  const latest = await getLatestVersionViaFetch(PACKAGE_NAME)
  const updateAvailable = Boolean(latest && isNewerVersion(latest, current))
  return { current, latest, updateAvailable }
}

export async function runSelfUpdate(options: SelfUpdateOptions): Promise<'updated'|'skipped'|'up-to-date'|'error'> {
  const logger = options.logger
  const status = await checkSelfUpdateWithFallback(logger)
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

async function checkSelfUpdateWithFallback(logger?: Logger): Promise<SelfUpdateStatus> {
  const current = PACKAGE_VERSION
  const latest = await getLatestVersionWithFallback(PACKAGE_NAME, logger)
  const updateAvailable = Boolean(latest && isNewerVersion(latest, current))
  return { current, latest, updateAvailable }
}

async function getLatestVersionWithFallback(pkgName: string, logger?: Logger): Promise<string | undefined> {
  // Fast path: direct registry fetch (usually fastest, but may not honor npm proxy config).
  const latest = await getLatestVersionViaFetch(pkgName)
  if (latest) return latest

  // Fallback: `npm view <pkg> version` (more likely to work in proxied environments).
  // Keep a hard timeout so we never hang the wizard.
  try {
    if (!(await needCmd('npm'))) return undefined
    const res = await execCapture('npm', ['view', pkgName, 'version'], { timeoutMs: 8000 })
    if (res.timedOut) return undefined
    if (res.code !== 0) return undefined
    const v = (res.stdout || '').trim()
    return v || undefined
  } catch (e) {
    logger?.warn(`Error checking latest codex-1up version via npm: ${e}`)
    return undefined
  }
}

async function getLatestVersionViaFetch(pkgName: string): Promise<string | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)
  timeout.unref?.()
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`, {
      signal: controller.signal
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { version?: string }
    return data.version
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
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
