import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand } from 'citty'
import { skillsCommand } from '../src/commands/skills'

const listBundledMock = vi.fn(async () => [
  { id: 'debug-lldb', name: 'debug-lldb', description: 'debug', srcDir: '/tmp' }
])
const listInstalledMock = vi.fn(async () => [])
const installSkillsMock = vi.fn(async () => {})
const removeSkillMock = vi.fn(async () => {})

vi.mock('../src/actions/skills.js', () => ({
  listBundled: (...args: any[]) => listBundledMock(...args),
  listInstalled: (...args: any[]) => listInstalledMock(...args),
  installSkills: (...args: any[]) => installSkillsMock(...args),
  removeSkill: (...args: any[]) => removeSkillMock(...args)
}))

describe('skills command', () => {
  beforeEach(() => {
    listBundledMock.mockClear()
    listInstalledMock.mockClear()
    installSkillsMock.mockClear()
    removeSkillMock.mockClear()
  })

  it('lists bundled and installed skills', async () => {
    await runCommand(skillsCommand, { rawArgs: ['list'] })
    expect(listBundledMock).toHaveBeenCalled()
    expect(listInstalledMock).toHaveBeenCalled()
  })

  it('installs a skill by id', async () => {
    await runCommand(skillsCommand, { rawArgs: ['install', 'debug-lldb'] })
    expect(installSkillsMock).toHaveBeenCalledWith('select', ['debug-lldb'], expect.any(Object))
  })

  it('removes a skill', async () => {
    await runCommand(skillsCommand, { rawArgs: ['remove', 'debug-lldb'] })
    expect(removeSkillMock).toHaveBeenCalledWith('debug-lldb', expect.any(Object))
  })
})
