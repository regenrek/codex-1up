import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createLogger } from '../src/installers/logger.js'

let tempDir = ''

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'codex-1up-log-'))
})

afterAll(async () => {
  try { await rm(tempDir, { recursive: true, force: true }) } catch {}
})

describe('createLogger', () => {
  it('writes log lines to a file', async () => {
    const logFile = join(tempDir, 'test.log')
    const logger = createLogger(logFile)
    logger.info('hello')
    logger.ok('ok')
    logger.warn('warn')
    logger.err('err')
    await new Promise(resolve => setTimeout(resolve, 10))
    const data = await readFile(logFile, 'utf8')
    expect(data).toMatch(/hello/)
    expect(data).toMatch(/ok/)
    expect(data).toMatch(/warn/)
    expect(data).toMatch(/err/)
  })
})
