import fs from 'fs-extra'
import * as path from 'path'

export interface BundledSkill {
  // Directory name under templates/skills (should match frontmatter name per spec)
  id: string
  name: string
  description: string
  srcDir: string
}

export async function listBundledSkills(rootDir: string): Promise<BundledSkill[]> {
  const skillsRoot = path.join(rootDir, 'templates', 'skills')
  const dirents = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => [])
  const out: BundledSkill[] = []

  for (const de of dirents) {
    if (!de.isDirectory()) continue
    const id = de.name
    const srcDir = path.join(skillsRoot, id)
    const skillMd = path.join(srcDir, 'SKILL.md')
    if (!(await fs.pathExists(skillMd))) continue
    const raw = await fs.readFile(skillMd, 'utf8').catch(() => '')
    const meta = parseSkillFrontmatter(raw)
    if (!meta?.name || !meta?.description) continue
    out.push({
      id,
      name: meta.name,
      description: meta.description,
      srcDir
    })
  }

  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export function parseSkillFrontmatter(md: string): { name?: string; description?: string } | null {
  const lines = md.split(/\r?\n/)
  if (lines.length < 3) return null
  if (lines[0].trim() !== '---') return null

  const fm: string[] = []
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
    fm.push(lines[i])
  }
  if (end === -1) return null

  const map: Record<string, string> = {}
  for (const line of fm) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    if (!key) continue
    let value = trimmed.slice(idx + 1).trim()
    if (!value) continue
    value = stripYamlQuotes(stripYamlInlineComment(value))
    map[key] = value
  }

  return { name: map.name, description: map.description }
}

function stripYamlInlineComment(value: string): string {
  // Extremely small helper: allow `key: value # comment` for unquoted values.
  const v = value.trim()
  if (!v) return v
  if (v.startsWith('"') || v.startsWith("'")) return v
  const idx = v.indexOf(' #')
  if (idx === -1) return v
  return v.slice(0, idx).trim()
}

function stripYamlQuotes(value: string): string {
  const v = value.trim()
  if (v.length >= 2) {
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1)
    }
  }
  return v
}

