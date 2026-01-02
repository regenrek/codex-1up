import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand } from 'citty'
import { toolsCommand } from '../src/commands/tools'

const installToolsMock = vi.hoisted(() => vi.fn(async () => {}))
const getToolStatusesMock = vi.hoisted(() => vi.fn(async () => []))
const getAllToolIdsMock = vi.hoisted(() => vi.fn(() => ['rg', 'fd']))
const listToolDefinitionsMock = vi.hoisted(() => vi.fn(() => ([
  { id: 'rg' },
  { id: 'fd' }
])))
const isToolIdMock = vi.hoisted(() => vi.fn((value: string) => value === 'rg' || value === 'fd'))

vi.mock('../src/actions/tools.js', () => ({
  installTools: installToolsMock,
  getToolStatuses: getToolStatusesMock,
  getAllToolIds: getAllToolIdsMock,
  listToolDefinitions: listToolDefinitionsMock,
  isToolId: isToolIdMock
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
