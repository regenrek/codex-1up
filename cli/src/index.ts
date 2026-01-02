import { defineCommand } from 'citty'
import { installCommand } from './commands/install.js'
import { agentsCommand } from './commands/agents.js'
import { doctorCommand } from './commands/doctor.js'
import { uninstallCommand } from './commands/uninstall.js'
import { configCommand } from './commands/config.js'
import { PACKAGE_DESCRIPTION, PACKAGE_VERSION } from './lib/package.js'
import { updateCommand } from './commands/update.js'
import { toolsCommand } from './commands/tools.js'
import { skillsCommand } from './commands/skills.js'

export const root = defineCommand({
  meta: {
    name: 'codex-1up',
    version: PACKAGE_VERSION,
    description: PACKAGE_DESCRIPTION
  },
  subCommands: {
    install: installCommand,
    agents: agentsCommand,
    doctor: doctorCommand,
    uninstall: uninstallCommand,
    config: configCommand,
    update: updateCommand,
    tools: toolsCommand,
    skills: skillsCommand
  }
})
