import { defineCommand } from 'citty'
import { findRepoRoot } from '../lib/repoRoot.js'
import { installSkills, listBundled, listInstalled, removeSkill } from '../actions/skills.js'

export const skillsCommand = defineCommand({
  meta: { name: 'skills', description: 'Manage bundled Agent Skills' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List bundled and installed skills' },
      async run() {
        const root = findRepoRoot()
        const bundled = await listBundled(root)
        const installed = await listInstalled()

        process.stdout.write('Bundled skills:\n')
        if (bundled.length === 0) {
          process.stdout.write('  (none)\n')
        } else {
          for (const skill of bundled) {
            process.stdout.write(`  ${skill.id} — ${skill.description}\n`)
          }
        }

        process.stdout.write('\nInstalled skills:\n')
        if (installed.length === 0) {
          process.stdout.write('  (none)\n')
        } else {
          for (const skill of installed) {
            process.stdout.write(`  ${skill.id}\n`)
          }
        }
      }
    }),
    install: defineCommand({
      meta: { name: 'install', description: 'Install bundled skills by id or all' },
      args: {
        name: { type: 'positional', required: true, description: 'Skill id or "all"' },
        'dry-run': { type: 'boolean', description: 'Print actions without making changes' }
      },
      async run({ args }) {
        const raw = String(args.name || '').trim()
        if (!raw) throw new Error('Skill id required')
        if (raw === 'all') {
          await installSkills('all', undefined, { dryRun: Boolean(args['dry-run']) })
          return
        }
        const root = findRepoRoot()
        const bundled = await listBundled(root)
        const requested = raw.split(',').map(s => s.trim()).filter(Boolean)
        const knownIds = new Set(bundled.map(s => s.id))
        const knownNames = new Set(bundled.map(s => s.name))
        const unknown = requested.filter(name => !knownIds.has(name) && !knownNames.has(name))
        if (unknown.length) {
          const available = bundled.map(s => s.id).join(', ') || '(none)'
          throw new Error(`Unknown skill(s): ${unknown.join(', ')}. Available: ${available}`)
        }
        await installSkills('select', requested, { dryRun: Boolean(args['dry-run']) })
      }
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove an installed skill (backup created)' },
      args: {
        name: { type: 'positional', required: true, description: 'Skill id' },
        'dry-run': { type: 'boolean', description: 'Print actions without making changes' }
      },
      async run({ args }) {
        const name = String(args.name || '').trim()
        if (!name) throw new Error('Skill id required')
        await removeSkill(name, { dryRun: Boolean(args['dry-run']) })
      }
    }),
    refresh: defineCommand({
      meta: { name: 'refresh', description: 'Reinstall bundled skills into ~/.codex/skills' },
      args: { 'dry-run': { type: 'boolean', description: 'Print actions without making changes' } },
      async run({ args }) {
        await installSkills('all', undefined, { dryRun: Boolean(args['dry-run']) })
      }
    })
  }
})
