import { describe, it, expect } from 'vitest'
import { mkdtemp, stat, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createBackupPath, createPrivilegedPmCmd, ensureDir } from '../src/installers/utils.js'

describe('utils helpers', () => {
  it('creates backup paths with timestamp', () => {
    const backup = createBackupPath('/tmp/testfile')
    expect(backup).toMatch(/testfile\.backup\./)
  })

  it('returns sudo wrapper when not root', () => {
    const originalGetuid = process.getuid
    Object.defineProperty(process, 'getuid', { value: () => 1000, configurable: true })
    const res = createPrivilegedPmCmd('apt-get')
    expect(res.cmd).toBe('sudo')
    expect(res.argsPrefix).toEqual(['apt-get'])
    Object.defineProperty(process, 'getuid', { value: originalGetuid, configurable: true })
  })

  it('returns direct command when root', () => {
    const originalGetuid = process.getuid
    Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true })
    const res = createPrivilegedPmCmd('dnf')
    expect(res.cmd).toBe('dnf')
    expect(res.argsPrefix).toEqual([])
    Object.defineProperty(process, 'getuid', { value: originalGetuid, configurable: true })
  })

  it('ensures a directory exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codex-1up-dir-'))
    const target = join(dir, 'nested')
    await ensureDir(target)
    const info = await stat(target)
    expect(info.isDirectory()).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})
