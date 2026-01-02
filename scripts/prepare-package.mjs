#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const cliDir = path.join(repoRoot, 'cli')

const mode = process.argv[2] || 'prepare'
if (!['prepare', 'cleanup'].includes(mode)) {
  console.error('Usage: node scripts/prepare-package.mjs <prepare|cleanup>')
  process.exit(1)
}

const assets = ['templates', 'scripts', 'sounds']

if (!fs.existsSync(cliDir)) {
  throw new Error(`Missing CLI directory at ${cliDir}`)
}

if (mode === 'prepare') {
  prepareAssets()
} else {
  cleanupAssets()
}

function prepareAssets() {
  for (const name of assets) {
    const src = path.join(repoRoot, name)
    const dest = path.join(cliDir, name)
    if (!fs.existsSync(src)) {
      throw new Error(`Missing ${name} directory at ${src}`)
    }
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
    console.log(`Copied ${name} -> ${path.relative(repoRoot, dest)}`)
  }

  const readmeSrc = path.join(repoRoot, 'README.md')
  const readmeDest = path.join(cliDir, 'README.md')
  if (fs.existsSync(readmeSrc)) {
    let readme = fs.readFileSync(readmeSrc, 'utf8')
    const repoSlug = resolveRepoSlug()
    if (repoSlug) {
      readme = readme.replace(
        /\]\(\.\/public\//g,
        `](https://raw.githubusercontent.com/${repoSlug}/main/public/`
      )
    }
    fs.writeFileSync(readmeDest, readme)
    console.log(`Wrote ${path.relative(repoRoot, readmeDest)}`)
  }

  const licenseSrc = path.join(repoRoot, 'LICENSE')
  const licenseDest = path.join(cliDir, 'LICENSE')
  if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, licenseDest)
    console.log(`Wrote ${path.relative(repoRoot, licenseDest)}`)
  }
}

function cleanupAssets() {
  for (const name of assets) {
    const dest = path.join(cliDir, name)
    fs.rmSync(dest, { recursive: true, force: true })
  }
  fs.rmSync(path.join(cliDir, 'README.md'), { force: true })
  fs.rmSync(path.join(cliDir, 'LICENSE'), { force: true })
  console.log('Cleaned packaging assets from cli/')
}

function resolveRepoSlug() {
  const pkgPath = path.join(cliDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return ''
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const repoUrl = pkg?.repository?.url
  if (!repoUrl) return ''
  const match = String(repoUrl).match(/github\.com\/(.+?)\.git$/)
  return match ? match[1] : ''
}
