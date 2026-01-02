import { accessSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export function findRepoRoot(fromUrl: string = import.meta.url): string {
  const startDir = dirname(fileURLToPath(fromUrl))
  let cur = startDir
  for (let i = 0; i < 6; i++) {
    try {
      accessSync(resolve(cur, 'templates', 'codex-config.toml'))
      return cur
    } catch {
      // continue walking
    }
    cur = resolve(cur, '..')
  }
  return resolve(startDir, '..')
}
