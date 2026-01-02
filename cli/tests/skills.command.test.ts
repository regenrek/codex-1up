import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand } from 'citty'
import { skillsCommand } from '../src/commands/skills'

const listBundledMock = vi.hoisted(() => vi.fn(async () => [
  { id: 'debug-lldb', name: 'debug-lldb', description: 'debug', srcDir: '/tmp' }
]))
const listInstalledMock = vi.hoisted(() => vi.fn(async () => []))
const installSkillsMock = vi.hoisted(() => vi.fn(async () => {}))
const removeSkillMock = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('../src/actions/skills.js', () => ({
  listBundled: listBundledMock,
  listInstalled: listInstalledMock,
  installSkills: installSkillsMock,
  removeSkill: removeSkillMock
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
