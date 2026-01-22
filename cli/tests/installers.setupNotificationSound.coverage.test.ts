import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

describe('installers/setupNotificationSound (extra coverage)', () => {
  const logger = { log: vi.fn(), info: vi.fn(), ok: vi.fn(), warn: vi.fn(), err: vi.fn() }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  async function mkTmp(prefix: string) {
    return await fs.mkdtemp(join(tmpdir(), prefix))
  }

  async function writeNotify(home: string, soundPath: string) {
    const notifyFile = resolve(home, '.codex', 'notify.sh')
    await fs.mkdir(resolve(home, '.codex'), { recursive: true })
    await fs.writeFile(notifyFile, `#!/usr/bin/env bash\nDEFAULT_CODEX_SOUND="${soundPath}"\n`, 'utf8')
    return notifyFile
  }

  it('disables sound when notificationSound=none (patches notify.sh)', async () => {
    const rootDir = await mkTmp('codex-1up-root-')
    const homeDir = await mkTmp('codex-1up-home-')

    const notifyFile = await writeNotify(homeDir, '/old/sound.wav')

    const { setupNotificationSound } = await import('../src/installers/setupNotificationSound.js')
    await setupNotificationSound({
      rootDir,
      homeDir,
      cwd: rootDir,
      logDir: resolve(rootDir, 'log'),
      logFile: resolve(rootDir, 'log', 'install.log'),
      logger,
      options: { notificationSound: 'none', dryRun: false, mode: 'manual' } as any
    } as any)

    const patched = await fs.readFile(notifyFile, 'utf8')
    expect(patched).toContain('DEFAULT_CODEX_SOUND=""')
    expect(logger.ok).toHaveBeenCalledWith('Notification sound disabled')
  })

  it('dry-run copies repo sound into ~/.codex/sounds and patches notify.sh', async () => {
    const rootDir = await mkTmp('codex-1up-root-')
    const homeDir = await mkTmp('codex-1up-home-')

    await fs.mkdir(resolve(rootDir, 'sounds'), { recursive: true })
    await fs.writeFile(resolve(rootDir, 'sounds', 'noti_2.wav'), 'fake', 'utf8')
    await writeNotify(homeDir, '/old/sound.wav')

    const { setupNotificationSound } = await import('../src/installers/setupNotificationSound.js')
    await setupNotificationSound({
      rootDir,
      homeDir,
      cwd: rootDir,
      logDir: resolve(rootDir, 'log'),
      logFile: resolve(rootDir, 'log', 'install.log'),
      logger,
      options: { notificationSound: 'noti_2.wav', dryRun: true, mode: 'manual' } as any
    } as any)

    const dest = resolve(homeDir, '.codex', 'sounds', 'noti_2.wav')
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(`[dry-run] cp ${resolve(rootDir, 'sounds', 'noti_2.wav')} ${dest}`))
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(`[dry-run] patch ${resolve(homeDir, '.codex', 'notify.sh')} DEFAULT_CODEX_SOUND -> ${dest}`))
    expect(logger.ok).toHaveBeenCalledWith('Notification sound configured')
  })

  it('uses absolute custom sound path without copying', async () => {
    const rootDir = await mkTmp('codex-1up-root-')
    const homeDir = await mkTmp('codex-1up-home-')

    const custom = resolve(rootDir, 'custom.wav')
    await fs.writeFile(custom, 'fake', 'utf8')
    const notifyFile = await writeNotify(homeDir, '/old/sound.wav')

    const { setupNotificationSound } = await import('../src/installers/setupNotificationSound.js')
    await setupNotificationSound({
      rootDir,
      homeDir,
      cwd: rootDir,
      logDir: resolve(rootDir, 'log'),
      logFile: resolve(rootDir, 'log', 'install.log'),
      logger,
      options: { notificationSound: custom, dryRun: false, mode: 'manual' } as any
    } as any)

    const patched = await fs.readFile(notifyFile, 'utf8')
    expect(patched).toContain(`DEFAULT_CODEX_SOUND="${custom}"`)
    expect(logger.ok).toHaveBeenCalledWith('Notification sound configured')
  })

  it('warns when selected sound file is missing', async () => {
    const rootDir = await mkTmp('codex-1up-root-')
    const homeDir = await mkTmp('codex-1up-home-')
    await writeNotify(homeDir, '/old/sound.wav')

    const { setupNotificationSound } = await import('../src/installers/setupNotificationSound.js')
    await setupNotificationSound({
      rootDir,
      homeDir,
      cwd: rootDir,
      logDir: resolve(rootDir, 'log'),
      logFile: resolve(rootDir, 'log', 'install.log'),
      logger,
      options: { notificationSound: 'missing.wav', dryRun: false, mode: 'manual' } as any
    } as any)

    expect(logger.warn).toHaveBeenCalledWith('No notification sound selected or file missing; skipping sound setup')
  })

  it('uses recommended default sound when mode=recommended and no selection provided', async () => {
    const rootDir = await mkTmp('codex-1up-root-')
    const homeDir = await mkTmp('codex-1up-home-')

    await fs.mkdir(resolve(rootDir, 'sounds'), { recursive: true })
    await fs.writeFile(resolve(rootDir, 'sounds', 'noti_1.wav'), 'fake', 'utf8')
    const notifyFile = await writeNotify(homeDir, '/old/sound.wav')

    const { setupNotificationSound } = await import('../src/installers/setupNotificationSound.js')
    await setupNotificationSound({
      rootDir,
      homeDir,
      cwd: rootDir,
      logDir: resolve(rootDir, 'log'),
      logFile: resolve(rootDir, 'log', 'install.log'),
      logger,
      options: { notificationSound: undefined, dryRun: false, mode: 'recommended' } as any
    } as any)

    const patched = await fs.readFile(notifyFile, 'utf8')
    expect(patched).toContain(`DEFAULT_CODEX_SOUND="${resolve(homeDir, '.codex', 'sounds', 'noti_1.wav')}"`)
    expect(logger.ok).toHaveBeenCalledWith('Notification sound configured')
  })
})

