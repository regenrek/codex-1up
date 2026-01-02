import { listTools, isToolId as isToolIdImpl, type ToolDefinition } from '../installers/tooling.js'
import { needCmd } from '../installers/utils.js'
import { ensureTools } from '../installers/ensureTools.js'
import type { ToolId } from '../installers/types.js'
import { createActionContext } from './context.js'

export interface ToolStatus {
  id: ToolId
  installed: boolean
}

export type { ToolDefinition }

export function listToolDefinitions(): ToolDefinition[] {
  return listTools()
}

export function isToolId(value: string): value is ToolId {
  return isToolIdImpl(value)
}

export function getAllToolIds(): ToolId[] {
  return listToolDefinitions().map(t => t.id)
}

export async function getToolStatuses(): Promise<ToolStatus[]> {
  const tools = listTools()
  const statuses: ToolStatus[] = []
  for (const tool of tools) {
    const installed = await isToolInstalled(tool.bins)
    statuses.push({ id: tool.id, installed })
  }
  return statuses
}

export async function installTools(ids: ToolId[] | 'all', opts: { dryRun?: boolean } = {}): Promise<void> {
  const installAll = ids === 'all'
  const options = {
    installTools: installAll ? 'all' : 'select',
    toolsSelected: installAll ? undefined : ids,
    dryRun: Boolean(opts.dryRun)
  } as const
  const ctx = await createActionContext(options)
  await ensureTools(ctx)
}

export async function isToolInstalled(bins: string[]): Promise<boolean> {
  for (const bin of bins) {
    if (await needCmd(bin)) return true
  }
  return false
}
