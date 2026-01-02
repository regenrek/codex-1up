import type { Logger } from './types.js'
import { createWriteStream } from 'fs'

export function createLogger(logFile: string): Logger {
  let logStream: ReturnType<typeof createWriteStream> | null = null
  try {
    logStream = createWriteStream(logFile, { flags: 'a' })
  } catch (error) {
    void error
    // Fallback to stdout only if file write fails
  }

  const write = (prefix: string, msg: string) => {
    const line = prefix ? `${prefix} ${msg}\n` : `${msg}\n`
    process.stdout.write(line)
    if (logStream) {
      logStream.write(line)
    }
  }

  return {
    log: (msg: string) => write('', msg),
    info: (msg: string) => write('', msg),
    ok: (msg: string) => write('✔', msg),
    warn: (msg: string) => write('⚠', msg),
    err: (msg: string) => write('✖', msg)
  }
}
