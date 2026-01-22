export type Profile = 'balanced' | 'safe' | 'yolo'
export type ProfileSelection = Profile | 'skip'
export type ProfileMode = 'add' | 'overwrite'
export type ProfileScope = 'single' | 'all' | 'selected'
export type InstallMode = 'recommended' | 'manual'
export type NotifyAction = 'yes' | 'no'
export type GlobalAgentsAction = 'create-default' | 'overwrite-default' | 'append-default' | 'skip'
export type SkillsInstallMode = 'skip' | 'all' | 'select'
export type WebSearchMode = 'disabled' | 'cached' | 'live'
export type WebSearchChoice = WebSearchMode | 'skip'
export type FileOpener = 'cursor' | 'vscode' | 'vscode-insiders' | 'windsurf'
export type FileOpenerChoice = FileOpener | 'none' | 'skip'
export type CredentialsStoreMode = 'auto' | 'file' | 'keyring'
export type CredentialsStoreChoice = CredentialsStoreMode | 'skip'
export type TuiAltScreenMode = 'auto' | 'always' | 'never'
export type TuiAltScreenChoice = TuiAltScreenMode | 'skip'
export type ExperimentalFeature =
  | 'background-terminal'   // shell_tool
  | 'shell-snapshot'        // shell_snapshot
  | 'multi-agents'          // collab (spawn agents)
  | 'steering'              // steer
  | 'collaboration-modes'   // collaboration_modes (/collab)
  | 'child-agent-project-docs' // child_agents_md (extra AGENTS.md guidance)
export type ToolId =
  | 'rg'
  | 'fd'
  | 'fzf'
  | 'jq'
  | 'yq'
  | 'ast-grep'
  | 'bat'
  | 'git'
  | 'git-delta'
  | 'gh'
export type InstallNodeMethod = 'nvm' | 'brew' | 'skip'
export type PackageManager = 'brew' | 'apt' | 'dnf' | 'pacman' | 'zypper' | 'none'
export type InstallToolsChoice = 'all' | 'skip' | 'select'
export type InstallCodexCliChoice = 'yes' | 'no' | 'auto'

export interface InstallerOptions {
  profile: ProfileSelection
  profileScope: ProfileScope
  profileMode: ProfileMode
  setDefaultProfile: boolean
  profilesSelected?: Profile[] | undefined // only used when profileScope === 'selected'
  installTools: InstallToolsChoice
  toolsSelected?: ToolId[] | undefined // only used when installTools === 'select'
  installCodexCli: InstallCodexCliChoice
  notify: NotifyAction | undefined
  globalAgents: GlobalAgentsAction | undefined
  notificationSound?: string | undefined // 'none' to disable
  skills: SkillsInstallMode
  skillsSelected?: string[] | undefined // only used when skills === 'select'
  webSearch?: WebSearchChoice | undefined
  fileOpener?: FileOpenerChoice | undefined
  credentialsStore?: CredentialsStoreChoice | undefined
  enableTui2?: boolean
  tuiAlternateScreen?: TuiAltScreenChoice | undefined
  experimentalFeatures?: ExperimentalFeature[] | undefined
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
