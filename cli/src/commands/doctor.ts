import { defineCommand } from 'citty'
import { $ } from 'zx'
import { resolve } from 'path'
import { findRepoRoot } from '../lib/repoRoot.js'

const repoRoot = findRepoRoot()

export const doctorCommand = defineCommand({
  meta: { name: 'doctor', description: 'Run environment checks' },
  async run() {
    await $`bash ${resolve(repoRoot, 'scripts/doctor.sh')}`
  }
})
