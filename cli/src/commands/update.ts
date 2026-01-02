import { defineCommand } from 'citty'
import { createActionContext } from '../actions/context.js'
import { runSelfUpdate } from '../actions/selfUpdate.js'

export const updateCommand = defineCommand({
  meta: { name: 'update', description: 'Check for and apply codex-1up updates' },
  args: {
    yes: { type: 'boolean', description: 'Non-interactive; apply updates without prompting' },
    'dry-run': { type: 'boolean', description: 'Print actions without making changes' },
    'skip-confirmation': { type: 'boolean', description: 'Skip prompts' }
  },
  async run({ args }) {
    const ctx = await createActionContext()
    const interactive =
      process.stdout.isTTY && !args['dry-run'] && !args['skip-confirmation'] && !args.yes
    await runSelfUpdate({
      interactive,
      assumeYes: Boolean(args.yes),
      skipConfirmation: Boolean(args['skip-confirmation']),
      dryRun: Boolean(args['dry-run']),
      logger: ctx.logger
    })
  }
})
