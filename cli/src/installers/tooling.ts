import type { PackageManager, ToolId } from './types.js'

export interface ToolDefinition {
  id: ToolId
  label: string
  bins: string[]
  packages: Partial<Record<PackageManager, string[]>>
}

export const TOOL_DEFS: ToolDefinition[] = [
  {
    id: 'rg',
    label: 'rg',
    bins: ['rg'],
    packages: {
      brew: ['ripgrep'],
      apt: ['ripgrep'],
      dnf: ['ripgrep'],
      pacman: ['ripgrep'],
      zypper: ['ripgrep']
    }
  },
  {
    id: 'fd',
    label: 'fd',
    bins: ['fd', 'fdfind'],
    packages: {
      brew: ['fd'],
      apt: ['fd-find'],
      dnf: ['fd-find'],
      pacman: ['fd'],
      zypper: ['fd']
    }
  },
  {
    id: 'fzf',
    label: 'fzf',
    bins: ['fzf'],
    packages: {
      brew: ['fzf'],
      apt: ['fzf'],
      dnf: ['fzf'],
      pacman: ['fzf'],
      zypper: ['fzf']
    }
  },
  {
    id: 'jq',
    label: 'jq',
    bins: ['jq'],
    packages: {
      brew: ['jq'],
      apt: ['jq'],
      dnf: ['jq'],
      pacman: ['jq'],
      zypper: ['jq']
    }
  },
  {
    id: 'yq',
    label: 'yq',
    bins: ['yq'],
    packages: {
      brew: ['yq'],
      apt: ['yq'],
      dnf: ['yq'],
      pacman: ['yq'],
      zypper: ['yq']
    }
  },
  {
    id: 'ast-grep',
    label: 'ast-grep',
    bins: ['ast-grep', 'sg'],
    packages: {
      brew: ['ast-grep'],
      apt: ['ast-grep'],
      dnf: ['ast-grep'],
      pacman: ['ast-grep'],
      zypper: ['ast-grep']
    }
  },
  {
    id: 'bat',
    label: 'bat',
    bins: ['bat', 'batcat'],
    packages: {
      brew: ['bat'],
      apt: ['bat'],
      dnf: ['bat'],
      pacman: ['bat'],
      zypper: ['bat']
    }
  },
  {
    id: 'git',
    label: 'git',
    bins: ['git'],
    packages: {
      brew: ['git'],
      apt: ['git'],
      dnf: ['git'],
      pacman: ['git'],
      zypper: ['git']
    }
  },
  {
    id: 'git-delta',
    label: 'git-delta',
    bins: ['delta'],
    packages: {
      brew: ['git-delta'],
      apt: ['git-delta'],
      dnf: ['git-delta'],
      pacman: ['git-delta'],
      zypper: ['git-delta']
    }
  },
  {
    id: 'gh',
    label: 'gh',
    bins: ['gh'],
    packages: {
      brew: ['gh'],
      apt: ['gh'],
      dnf: ['gh'],
      pacman: ['github-cli'],
      zypper: ['gh']
    }
  }
]

const TOOL_ID_SET = new Set<ToolId>(TOOL_DEFS.map((t) => t.id))

export function isToolId(value: string): value is ToolId {
  return TOOL_ID_SET.has(value as ToolId)
}

export function listTools(): ToolDefinition[] {
  return TOOL_DEFS
}
