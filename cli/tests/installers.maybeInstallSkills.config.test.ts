import { describe, it, expect, beforeEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import type { InstallerContext, InstallerOptions, Logger } from '../src/installers/types'

const logger: Logger = { log:()=>{}, info:()=>{}, ok:()=>{}, warn:()=>{}, err:()=>{} }

vi.mock('../src/installers/skills.js', () => ({
  listBundledSkills: vi.fn(async () => ([
    {
      id: 'debug-lldb',
      name: 'debug-lldb',
      description: 'debug',
      srcDir: '/tmp/fake-skill-src'
    }
  ]))
}))

describe('maybeInstallSkills writes skills.config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('adds [[skills.config]] entries for installed skills', async () => {
    const homeDir = await fs.mkdtemp(join(tmpdir(), 'codex-1up-skillcfg-'))
    const codexHome = resolve(homeDir, '.codex')
    const cfgPath = resolve(codexHome, 'config.toml')
    await fs.mkdir(codexHome, { recursive: true })
    await fs.writeFile(cfgPath, 'model = "gpt-5.2-codex"\n', 'utf8')

    const fakeSkillSrc = resolve(homeDir, 'skill-src')
    await fs.mkdir(fakeSkillSrc, { recursive: true })
    await fs.writeFile(resolve(fakeSkillSrc, 'SKILL.md'), '# Skill\n', 'utf8')

    // Patch the mocked skill srcDir to our temp directory.
    const mod = await import('../src/installers/skills.js')
    ;(mod.listBundledSkills as any).mockImplementationOnce(async () => ([
      { id: 'debug-lldb', name: 'debug-lldb', description: 'debug', srcDir: fakeSkillSrc }
    ]))

    const options: InstallerOptions = {
      profile: 'skip',
      profileScope: 'selected',
      profileMode: 'add',
      setDefaultProfile: false,
      profilesSelected: [],
      installTools: 'skip',
      toolsSelected: undefined,
      installCodexCli: 'no',
      notify: 'no',
      globalAgents: 'skip',
      notificationSound: undefined,
      skills: 'select',
      skillsSelected: ['debug-lldb'],
      mode: 'manual',
      installNode: 'skip',
      shell: 'auto',
      vscodeId: undefined,
      noVscode: true,
      agentsMd: undefined,
      dryRun: false,
      assumeYes: true,
      skipConfirmation: true
    }

    const ctx: InstallerContext = {
      cwd: homeDir,
      homeDir,
      rootDir: resolve(__dirname, '../../'),
      logDir: codexHome,
      logFile: resolve(codexHome, 'log.txt'),
      options,
      logger
    }

    const { maybeInstallSkills } = await import('../src/installers/maybeInstallSkills.js')
    await maybeInstallSkills(ctx)

    const updated = await fs.readFile(cfgPath, 'utf8')
    const expectedPath = resolve(homeDir, '.codex', 'skills', 'debug-lldb', 'SKILL.md')
    expect(updated).toContain('[skills]')
    expect(updated).toContain('[[skills.config]]')
    expect(updated).toContain('enabled = true')
    expect(updated).toContain(`path = "${expectedPath}"`)
  })
})

