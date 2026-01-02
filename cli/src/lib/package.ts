import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

type PackageJson = {
  name?: string
  version?: string
  description?: string
  bin?: string | Record<string, string>
}

const __dirname = dirname(fileURLToPath(import.meta.url))

const readPackageJson = (path: string, silent = false): PackageJson => {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson
  } catch (error) {
    if (silent) {
      return {}
    }
    throw error
  }
}

const isCliPackage = (pkg: PackageJson): boolean => {
  if (pkg.name === 'codex-1up') {
    return true
  }
  if (pkg.bin === 'codex-1up') {
    return true
  }
  if (pkg.bin && typeof pkg.bin === 'object' && 'codex-1up' in pkg.bin) {
    return true
  }
  return false
}

const findNearestPackageJson = (startDir: string): string => {
  let current = startDir
  let firstFound: string | null = null
  while (true) {
    const candidate = join(current, 'package.json')
    if (existsSync(candidate)) {
      if (!firstFound) {
        firstFound = candidate
      }
      const pkg = readPackageJson(candidate, true)
      if (isCliPackage(pkg)) {
        return candidate
      }
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return firstFound ?? join(startDir, 'package.json')
}

const packageJsonPath = findNearestPackageJson(__dirname)

const packageJson = readPackageJson(packageJsonPath)

export const PACKAGE_NAME = packageJson.name || 'codex-1up'
export const PACKAGE_VERSION = packageJson.version || '0.0.0'
export const PACKAGE_DESCRIPTION = packageJson.description || 'Codex CLI helper'
export const PACKAGE_JSON_PATH = packageJsonPath
