import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand } from 'citty'
import { toolsCommand } from '../src/commands/tools'

const installToolsMock = vi.fn(async () => {})
const getToolStatusesMock = vi.fn(async () => [])
const getAllToolIdsMock = vi.fn(() => ['rg', 'fd'])
const listToolDefinitionsMock = vi.fn(() => ([
  { id: 'rg' },
  { id: 'fd' }
]))
const isToolIdMock = vi.fn((value: string) => value === 'rg' || value === 'fd')

vi.mock('../src/actions/tools.js', () => ({
  installTools: (...args: any[]) => installToolsMock(...args),
  getToolStatuses: (...args: any[]) => getToolStatusesMock(...args),
  getAllToolIds: (...args: any[]) => getAllToolIdsMock(...args),
  listToolDefinitions: (...args: any[]) => listToolDefinitionsMock(...args),
  isToolId: (...args: any[]) => isToolIdMock(...args)
}))

describe('tools command', () => {
  beforeEach(() => {
    installToolsMock.mockClear()
    getToolStatusesMock.mockClear()
    listToolDefinitionsMock.mockClear()
    isToolIdMock.mockClear()
  })

  it('lists tools', async () => {
    await runCommand(toolsCommand, { rawArgs: ['list'] })
    expect(getToolStatusesMock).toHaveBeenCalled()
  })

  it('installs a list of tools', async () => {
    await runCommand(toolsCommand, { rawArgs: ['install', 'rg,fd'] })
    expect(installToolsMock).toHaveBeenCalledWith(['rg', 'fd'], expect.any(Object))
  })

  it('installs all tools', async () => {
    await runCommand(toolsCommand, { rawArgs: ['install', 'all'] })
    expect(installToolsMock).toHaveBeenCalledWith('all', expect.any(Object))
  })
})
