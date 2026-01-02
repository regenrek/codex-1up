import { defineCommand } from 'citty'
import { $ } from 'zx'
import { resolve } from 'path'
import { findRepoRoot } from '../lib/repoRoot.js'

const repoRoot = findRepoRoot()

export const uninstallCommand = defineCommand({
  meta: { name: 'uninstall', description: 'Clean up aliases and config created by this tool' },
  async run() {
    await $`bash ${resolve(repoRoot, 'scripts/uninstall.sh')}`
  }
})
