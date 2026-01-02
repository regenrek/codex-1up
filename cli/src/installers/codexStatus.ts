import { $ } from 'zx'
import type { Logger } from './types.js'
import { needCmd } from './utils.js'

const CODEX_PKG = '@openai/codex'

export interface CodexStatus {
  found: boolean
  version?: string
  latest?: string
  updateAvailable: boolean
}

export async function getCodexStatus(logger?: Logger): Promise<CodexStatus> {
  const installed = await getInstalledCodexVersion()
  const latest = await getLatestCodexVersion(logger)
  const updateAvailable = Boolean(installed.found && installed.version && latest && installed.version !== latest)
  return {
    found: installed.found,
    version: installed.version,
    latest,
    updateAvailable
  }
}

export async function getLatestCodexVersion(logger?: Logger): Promise<string | undefined> {
  try {
    const latestResult = await $`npm view ${CODEX_PKG} version`.quiet()
    const latest = latestResult.stdout.trim()
    if (!latest) {
      logger?.warn('Could not fetch latest Codex CLI version; skipping upgrade check')
      return undefined
    }
    return latest
  } catch (error) {
    logger?.warn(`Error checking latest Codex CLI version: ${error}`)
    return undefined
  }
}

export async function getInstalledCodexVersion(): Promise<{ found: boolean; version?: string }> {
  const hasCmd = await needCmd('codex')
  if (!hasCmd) return { found: false }

  let version = ''

  try {
    const result = await $`codex --version`.quiet().nothrow()
    version = parseSemver(result.stdout || '')
  } catch (error) {
    void error
  }

  if (!version) {
    try {
      const installedResult = await $`npm ls -g ${CODEX_PKG} --depth=0 --json`.quiet().nothrow()
      const installedJson = JSON.parse(installedResult.stdout || '{}')
      version = installedJson.dependencies?.[CODEX_PKG]?.version || ''
    } catch (error) {
      void error
    }
  }

  return { found: true, version: version || undefined }
}

function parseSemver(value: string): string {
  const match = value.match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/)
  return match ? match[1] : ''
}
