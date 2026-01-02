import type { Logger } from '../installers/types.js'
import { getCodexStatus as getCodexStatusImpl, type CodexStatus } from '../installers/codexStatus.js'

export type { CodexStatus }

export async function getCodexStatus(logger?: Logger): Promise<CodexStatus> {
  return getCodexStatusImpl(logger)
}
