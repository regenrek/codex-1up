import { defineCommand } from 'citty'
import { getToolStatuses, installTools, getAllToolIds, listToolDefinitions, isToolId } from '../actions/tools.js'
import type { ToolId } from '../installers/types.js'

export const toolsCommand = defineCommand({
  meta: { name: 'tools', description: 'Manage developer tools' },
  subCommands: {
    list: defineCommand({
      meta: { name: 'list', description: 'List known tools and installation status' },
      async run() {
        const statuses = await getToolStatuses()
        for (const status of statuses) {
          process.stdout.write(`${status.id} ${status.installed ? '✓' : '✖'}\n`)
        }
      }
    }),
    install: defineCommand({
      meta: { name: 'install', description: 'Install tools by id or all' },
      args: {
        tool: { type: 'positional', required: true, description: 'Tool id or "all"' },
        'dry-run': { type: 'boolean', description: 'Print actions without making changes' }
      },
      async run({ args }) {
        const toolArg = String(args.tool || '').trim().toLowerCase()
        if (!toolArg) throw new Error('Tool id required')
        if (toolArg === 'all') {
          await installTools('all', { dryRun: Boolean(args['dry-run']) })
          return
        }
        const parts = toolArg.split(',').map(t => t.trim()).filter(Boolean)
        const unique = Array.from(new Set(parts))
        const unknown = unique.filter(t => !isToolId(t))
        if (unknown.length) {
          const known = getAllToolIds().join(', ')
          throw new Error(`Unknown tool id(s): ${unknown.join(', ')}. Known: ${known}`)
        }
        await installTools(unique as ToolId[], { dryRun: Boolean(args['dry-run']) })
      }
    }),
    doctor: defineCommand({
      meta: { name: 'doctor', description: 'Show missing tools and hints' },
      async run() {
        const statuses = await getToolStatuses()
        const missing = statuses.filter(s => !s.installed).map(s => s.id)
        if (missing.length === 0) {
          process.stdout.write('All tools are installed.\n')
          return
        }
        const known = listToolDefinitions().map(t => t.id).join(', ')
        process.stdout.write(`Missing tools: ${missing.join(', ')}\n`)
        process.stdout.write(`Known tools: ${known}\n`)
      }
    })
  }
})
