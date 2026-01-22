import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import { resolve } from 'path'
import * as TOML from 'toml'

// Guardrail: keep our template aligned to Codex CLI (codex-rs) config keys.
// This list is based on codex tag `rust-v0.88.0` (see `codex-rs/core/config.schema.json`).

const ROOT_KEYS = new Set([
  'model',
  'approval_policy',
  'sandbox_mode',
  'profile',
  'web_search',
  'cli_auth_credentials_store',
  'mcp_oauth_credentials_store',
  'file_opener',
  'show_raw_agent_reasoning',
  'hide_agent_reasoning',
  'sandbox_workspace_write',
  'tui',
  'tools',
  'features',
  'profiles'
])

const WEB_SEARCH_MODES = new Set(['disabled', 'cached', 'live'])

const SANDBOX_WORKSPACE_WRITE_KEYS = new Set([
  'exclude_slash_tmp',
  'exclude_tmpdir_env_var',
  'network_access',
  'writable_roots'
])

const TUI_KEYS = new Set([
  'alternate_screen',
  'animations',
  'notifications',
  'scroll_events_per_tick',
  'scroll_invert',
  'scroll_mode',
  'scroll_trackpad_accel_events',
  'scroll_trackpad_accel_max',
  'scroll_trackpad_lines',
  'scroll_wheel_like_max_duration_ms',
  'scroll_wheel_lines',
  'scroll_wheel_tick_detect_max_ms',
  'show_tooltips'
])

const TOOLS_KEYS = new Set(['view_image', 'web_search'])

const FEATURES_KEYS = new Set([
  'apply_patch_freeform',
  'child_agents_md',
  'collab',
  'collaboration_modes',
  'elevated_windows_sandbox',
  'enable_experimental_windows_sandbox',
  'enable_request_compression',
  'exec_policy',
  'experimental_use_freeform_apply_patch',
  'experimental_use_unified_exec_tool',
  'experimental_windows_sandbox',
  'include_apply_patch_tool',
  'powershell_utf8',
  'remote_compaction',
  'remote_models',
  'responses_websockets',
  'shell_snapshot',
  'shell_tool',
  'steer',
  'tui2',
  'undo',
  'unified_exec',
  'web_search',
  'web_search_cached',
  'web_search_request'
])

const PROFILE_KEYS = new Set([
  'approval_policy',
  'sandbox_mode',
  'model',
  'model_reasoning_effort',
  'model_reasoning_summary',
  'web_search',
  'features',
  'sandbox_workspace_write'
])

function assertKeysAllowed(obj: Record<string, unknown>, allowed: Set<string>, ctx: string) {
  for (const key of Object.keys(obj)) {
    expect(allowed.has(key), `${ctx}: unexpected key "${key}"`).toBe(true)
  }
}

describe('templates/codex-config.toml schema guard', () => {
  it('only uses keys present in codex-rs v0.88 config schema', async () => {
    const repoRoot = resolve(__dirname, '../../')
    const templatePath = resolve(repoRoot, 'templates', 'codex-config.toml')
    const raw = await fs.readFile(templatePath, 'utf8')
    const data = TOML.parse(raw) as Record<string, unknown>

    assertKeysAllowed(data, ROOT_KEYS, 'root')

    if (typeof data.web_search === 'string') {
      expect(WEB_SEARCH_MODES.has(data.web_search), 'root.web_search invalid').toBe(true)
    }

    if (data.sandbox_workspace_write && typeof data.sandbox_workspace_write === 'object') {
      assertKeysAllowed(
        data.sandbox_workspace_write as Record<string, unknown>,
        SANDBOX_WORKSPACE_WRITE_KEYS,
        'sandbox_workspace_write'
      )
    }

    if (data.tui && typeof data.tui === 'object') {
      assertKeysAllowed(data.tui as Record<string, unknown>, TUI_KEYS, 'tui')
    }

    if (data.tools && typeof data.tools === 'object') {
      assertKeysAllowed(data.tools as Record<string, unknown>, TOOLS_KEYS, 'tools')
    }

    if (data.features && typeof data.features === 'object') {
      assertKeysAllowed(data.features as Record<string, unknown>, FEATURES_KEYS, 'features')
    }

    if (data.profiles && typeof data.profiles === 'object') {
      const profiles = data.profiles as Record<string, unknown>
      for (const [name, value] of Object.entries(profiles)) {
        expect(typeof value).toBe('object')
        const prof = value as Record<string, unknown>
        assertKeysAllowed(prof, PROFILE_KEYS, `profiles.${name}`)

        if (typeof prof.web_search === 'string') {
          expect(WEB_SEARCH_MODES.has(prof.web_search), `profiles.${name}.web_search invalid`).toBe(true)
        }

        if (prof.features && typeof prof.features === 'object') {
          assertKeysAllowed(prof.features as Record<string, unknown>, FEATURES_KEYS, `profiles.${name}.features`)
        }

        if (prof.sandbox_workspace_write && typeof prof.sandbox_workspace_write === 'object') {
          assertKeysAllowed(
            prof.sandbox_workspace_write as Record<string, unknown>,
            SANDBOX_WORKSPACE_WRITE_KEYS,
            `profiles.${name}.sandbox_workspace_write`
          )
        }
      }
    }
  })
})

