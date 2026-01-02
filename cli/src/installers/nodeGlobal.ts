import * as p from '@clack/prompts'
import type { Logger } from './types.js'
import { chooseNodePmForGlobal } from './utils.js'

export async function resolveNodeGlobalPm(options: {
  logger?: Logger
  interactive: boolean
}): Promise<'pnpm' | 'npm' | 'none'> {
  const pmChoice = await chooseNodePmForGlobal(options.logger)
  if (pmChoice.pm === 'pnpm') return 'pnpm'
  if (pmChoice.pm === 'npm') return 'npm'

  if (pmChoice.pm === 'none' && pmChoice.reason?.startsWith('pnpm-')) {
    if (options.interactive) {
      const fallback = await p.select({
        message: 'pnpm is installed but its global bin is not configured. How should we proceed?',
        initialValue: 'npm',
        options: [
          { value: 'npm', label: 'Use npm for global installs this run' },
          { value: 'skip', label: 'Skip global installs (run "pnpm setup" then re-run)' }
        ]
      })
      if (p.isCancel(fallback) || fallback === 'skip') {
        options.logger?.warn('Skipping global Node installs; pnpm is misconfigured. Run "pnpm setup" then re-run.')
        return 'none'
      }
      options.logger?.info('pnpm misconfigured; falling back to npm for global installs.')
      return 'npm'
    }
    options.logger?.warn('pnpm detected but global bin dir is not configured; falling back to npm for this run. Run "pnpm setup" to use pnpm.')
    return 'npm'
  }

  return 'none'
}
