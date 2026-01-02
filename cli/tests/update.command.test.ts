import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCommand } from 'citty'
import { buildRawArgsFromFlags } from './test-utils'
import { updateCommand } from '../src/commands/update'

const runSelfUpdateMock = vi.fn(async () => 'up-to-date')

vi.mock('../src/actions/selfUpdate.js', () => ({
  runSelfUpdate: runSelfUpdateMock
}))

vi.mock('../src/actions/context.js', () => ({
  createActionContext: vi.fn(async () => ({
    logger: {
      log: vi.fn(),
      info: vi.fn(),
      ok: vi.fn(),
      warn: vi.fn(),
      err: vi.fn()
    }
  }))
}))

describe('update command', () => {
  beforeEach(() => {
    runSelfUpdateMock.mockClear()
  })

  it('runs interactive update when tty and no flags', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(updateCommand, { rawArgs: buildRawArgsFromFlags({}) })
    expect(runSelfUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true,
      assumeYes: false,
      skipConfirmation: false,
      dryRun: false
    }))
  })

  it('disables interactive when --yes is set', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    await runCommand(updateCommand, { rawArgs: buildRawArgsFromFlags({ yes: true }) })
    expect(runSelfUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      interactive: false,
      assumeYes: true
    }))
  })
})
