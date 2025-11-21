export type Profile = 'balanced' | 'safe' | 'minimal' | 'yolo'
export type ProfileSelection = Profile | 'skip'
export type ProfileMode = 'add' | 'overwrite'
export type InstallMode = 'recommended' | 'manual'
export type NotifyAction = 'yes' | 'no'
export type GlobalAgentsAction = 'create-default' | 'overwrite-default' | 'append-default' | 'skip'
export type InstallNodeMethod = 'nvm' | 'brew' | 'skip'
export type PackageManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'zypper' | 'none'
export type InstallToolsChoice = 'yes' | 'no'
export type InstallCodexCliChoice = 'yes' | 'no'

export interface InstallerOptions {
  profile: ProfileSelection
  profileMode: ProfileMode
  setDefaultProfile: boolean
  installTools: InstallToolsChoice
  installCodexCli: InstallCodexCliChoice
  notify: NotifyAction | undefined
  globalAgents: GlobalAgentsAction | undefined
  notificationSound?: string | undefined // 'none' to disable
  mode: InstallMode
  installNode: InstallNodeMethod
  shell: string
  vscodeId: string | undefined
  noVscode: boolean
  agentsMd: string | undefined
  dryRun: boolean
  assumeYes: boolean
  skipConfirmation: boolean
}

export interface InstallerContext {
  cwd: string
  homeDir: string
  rootDir: string
  logDir: string
  logFile: string
  options: InstallerOptions
  logger: Logger
}

export interface Logger {
  log: (msg: string) => void
  info: (msg: string) => void
  ok: (msg: string) => void
  warn: (msg: string) => void
  err: (msg: string) => void
}
