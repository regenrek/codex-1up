import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { runCommand } from 'citty'
import { root } from '../src/index'

const td = join(tmpdir(), `codex-1up-test-${Date.now()}-agents`)

beforeAll(async () => { await fs.mkdir(td, { recursive: true }) })
afterAll(async () => { try { await fs.rm(td, { recursive: true, force: true }) } catch {} })

describe('agents write', () => {
  it('writes AGENTS.md to directory', async () => {
    await runCommand(root, { rawArgs: ['agents', '--path', td, '--template', 'default'] })
    const p = resolve(td, 'AGENTS.md')
    const data = await fs.readFile(p, 'utf8')
    expect(data).toMatch(/File Operations|ast-grep|Selection/i)
  })
})
