import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(async () => false),
  isCancel: (v: any) => v === null
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<any>('os')
  return {
    ...actual,
    platform: () => 'darwin',
    arch: () => 'arm64'
  }
})

vi.mock('zx', () => ({ $: vi.fn(async () => ({ stdout: '' })) }))

vi.mock('../src/installers/utils.js', () => ({
  needCmd: vi.fn(async (cmd: string) => cmd === 'node' ? false : false),
  runCommand: vi.fn(async () => undefined)
}))

describe('installers/ensureNode interactive abort paths', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('aborts Homebrew install when user declines confirm', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
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
        assumeYes: false,
        skipConfirmation: false
      }
    } as any)).rejects.toThrow(/Homebrew installation aborted by user/)
  })
})

