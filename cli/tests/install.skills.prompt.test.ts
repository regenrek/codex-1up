import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type { InstallerContext } from '../src/installers/types.js'
import { maybeInstallSkills } from '../src/installers/maybeInstallSkills.js'

const selectMock = vi.hoisted(() => vi.fn(async () => 'overwrite'))

vi.mock('@clack/prompts', () => ({
  select: selectMock,
  isCancel: (v: unknown) => v === Symbol.for('cancel')
}))

function createCtx(rootDir: string, homeDir: string): InstallerContext {
  const logger = {
    log: vi.fn(),
    info: vi.fn(),
    ok: vi.fn(),
    warn: vi.fn(),
    err: vi.fn()
  }
  return {
    cwd: rootDir,
    homeDir,
    rootDir,
    logDir: join(homeDir, '.codex-1up'),
    logFile: join(homeDir, '.codex-1up', 'test.log'),
    logger,
    options: {
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
      skills: 'all',
      skillsSelected: undefined,
      mode: 'manual',
      installNode: 'skip',
      shell: 'zsh',
      vscodeId: undefined,
      noVscode: true,
      agentsMd: undefined,
      dryRun: false,
      assumeYes: false,
      skipConfirmation: false
    }
  }
}

describe('maybeInstallSkills overwrite prompt', () => {
  let tempRoot = ''
  let tempHome = ''
  let templateSkillDir = ''
  let destSkillDir = ''

  beforeEach(async () => {
    selectMock.mockReset()
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    tempRoot = await mkdtemp(join(tmpdir(), 'codex-1up-root-'))
    tempHome = await mkdtemp(join(tmpdir(), 'codex-1up-home-'))

    templateSkillDir = join(tempRoot, 'templates', 'skills', 'sample-skill')
    destSkillDir = join(tempHome, '.codex', 'skills', 'sample-skill')
    await mkdir(templateSkillDir, { recursive: true })
    await mkdir(destSkillDir, { recursive: true })

    const skillMd = [
      '---',
      'name: sample-skill',
      'description: Sample skill',
      '---',
      '',
      '# Sample'
    ].join('\n')
    await writeFile(join(templateSkillDir, 'SKILL.md'), skillMd, 'utf8')
    await writeFile(join(templateSkillDir, 'payload.txt'), 'new', 'utf8')
    await writeFile(join(destSkillDir, 'payload.txt'), 'old', 'utf8')
  })

  afterEach(async () => {
    try { await rm(tempRoot, { recursive: true, force: true }) } catch {}
    try { await rm(tempHome, { recursive: true, force: true }) } catch {}
  })

  it('skips when user chooses skip for existing skill', async () => {
    selectMock.mockResolvedValueOnce('skip')
    const ctx = createCtx(tempRoot, tempHome)
    await maybeInstallSkills(ctx)

    const payload = await readFile(join(destSkillDir, 'payload.txt'), 'utf8')
    expect(payload).toBe('old')
    const entries = await readdir(join(tempHome, '.codex', 'skills'))
    expect(entries.some(name => name.startsWith('sample-skill.backup.'))).toBe(false)
  })

  it('overwrites and backs up when user chooses overwrite', async () => {
    selectMock.mockResolvedValueOnce('overwrite')
    const ctx = createCtx(tempRoot, tempHome)
    await maybeInstallSkills(ctx)

    const payload = await readFile(join(destSkillDir, 'payload.txt'), 'utf8')
    expect(payload).toBe('new')
    const entries = await readdir(join(tempHome, '.codex', 'skills'))
    const backup = entries.find(name => name.startsWith('sample-skill.backup.'))
    expect(backup).toBeTruthy()
  })
})
