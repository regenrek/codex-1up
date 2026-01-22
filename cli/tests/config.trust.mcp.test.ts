import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { root } from '../src/index'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-cfg-extra`)
const CH = resolve(td, '.codex')
const CFG = resolve(CH, 'config.toml')

beforeAll(async () => {
  process.env.HOME = td
  process.env.USERPROFILE = td // Windows compatibility
  await fs.mkdir(CH, { recursive: true })
})

afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('config trust + mcp', () => {
  it('writes trusted project entry for a path', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    const repoPath = resolve(td, 'repo-a')
    await fs.mkdir(repoPath, { recursive: true })

    await runCommand(root, { rawArgs: ['config', 'trust', '--path', repoPath] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toContain(`[projects.${JSON.stringify(repoPath)}]`)
    expect(data).toContain('trust_level = "trusted"')
  })

  it('adds/updates an MCP server entry', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    await runCommand(root, { rawArgs: ['config', 'mcp', 'set', 'my-server', '--command', 'node', '--args', 'server.js,--flag', '--enabled', 'true'] })
    let data = await fs.readFile(CFG, 'utf8')
    expect(data).toContain('[mcp_servers.my-server]')
    expect(data).toContain('command = "node"')
    expect(data).toContain('args = ["server.js","--flag"]')
    expect(data).toContain('enabled = true')

    // Update existing: flip enabled and set url.
    await runCommand(root, { rawArgs: ['config', 'mcp', 'set', 'my-server', '--url', 'http://localhost:1234', '--enabled', 'false'] })
    data = await fs.readFile(CFG, 'utf8')
    expect(data).toContain('url = "http://localhost:1234"')
    expect(data).toContain('enabled = false')
  })

  it('supports MCP server names that require quoting', async () => {
    await runCommand(root, { rawArgs: ['config', 'init', '--force'] })
    await runCommand(root, { rawArgs: ['config', 'mcp', 'set', 'my server', '--command', 'node'] })
    const data = await fs.readFile(CFG, 'utf8')
    expect(data).toContain(`[mcp_servers.${JSON.stringify('my server')}]`)
    expect(data).toContain('command = "node"')
  })
})

