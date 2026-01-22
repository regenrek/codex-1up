import { describe, it, expect, vi } from 'vitest'

vi.mock('os', async () => {
  const actual = await vi.importActual<any>('os')
  return {
    ...actual,
    platform: () => 'linux',
    arch: () => 'x64'
  }
})

vi.mock('zx', () => ({ $: vi.fn(async () => ({ stdout: '' })) }))

vi.mock('../src/installers/utils.js', () => ({
  needCmd: vi.fn(async () => false),
  runCommand: vi.fn(async () => undefined)
}))

describe('installers/ensureNode non-mac brew error', () => {
  it('throws when brew install is requested on non-macOS', async () => {
    const { ensureNode } = await import('../src/installers/ensureNode.js')
    await expect(ensureNode({
      cwd: '/tmp',
      homeDir: '/tmp/home',
      rootDir: '/tmp/root',
      logDir: '/tmp/log',
      logFile: '/tmp/log/install.log',
      logger: { log() {}, info() {}, ok() {}, warn() {}, err() {} },
      options: {
        profile: 'skip',
        profileScope: 'single',
        profileMode: 'add',
        setDefaultProfile: false,
        profilesSelected: undefined,
        installTools: 'skip',
        toolsSelected: undefined,
        installCodexCli: 'no',
        notify: 'no',
        globalAgents: 'skip',
        notificationSound: undefined,
        skills: 'skip',
        skillsSelected: undefined,
        mode: 'manual',
        installNode: 'brew',
        shell: 'auto',
        vscodeId: undefined,
        noVscode: true,
        agentsMd: undefined,
        dryRun: false,
        assumeYes: true,
        skipConfirmation: true
      }
    } as any)).rejects.toThrow(/Homebrew is only available on macOS/)
  })
})

