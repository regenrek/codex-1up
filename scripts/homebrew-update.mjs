#!/usr/bin/env node
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const cliPackagePath = path.join(repoRoot, 'cli', 'package.json')

if (!fs.existsSync(cliPackagePath)) {
  throw new Error(`Missing CLI package.json at ${cliPackagePath}`)
}

const pkg = JSON.parse(fs.readFileSync(cliPackagePath, 'utf8'))
const pkgName = pkg.name
if (!pkgName) {
  throw new Error('package.json is missing name')
}

const tagName = process.env.TAG_NAME || process.env.GITHUB_REF_NAME || ''
const explicitVersion = process.env.VERSION || ''
const resolvedVersion = explicitVersion || tagName.replace(/^v/, '') || pkg.version

if (!resolvedVersion) {
  throw new Error('Unable to resolve release version')
}

if (pkg.version && pkg.version !== resolvedVersion) {
  throw new Error(
    `Version mismatch: package.json has ${pkg.version} but release is ${resolvedVersion}`,
  )
}

const tarballUrl = `https://registry.npmjs.org/${pkgName}/-/${pkgName}-${resolvedVersion}.tgz`
const sha256 = await sha256ForUrl(tarballUrl)

const formulaClass = toFormulaClassName(pkgName)
const description = escapeRubyString(pkg.description || 'Command-line interface')
const homepage = resolveHomepage(pkg.repository)
const license = normalizeLicense(pkg.license)
const binName = resolveBinName(pkg.bin, pkgName)
const binRelPath = resolveBinRelPath(pkg.bin, pkgName, binName)

const formula = `class ${formulaClass} < Formula
  desc "${description}"
  homepage "${homepage}"
  url "${tarballUrl}"
  sha256 "${sha256}"
  license "${license}"

  depends_on "node"

  def install
    ENV["HOME"] = buildpath
    system "npm", "install", *std_npm_args
    # npm install doesn't reliably create prefix/bin shims for ESM .mjs bins;
    # symlink the package's bin entrypoint explicitly (preserves relative dist paths).
    bin.install_symlink libexec/"lib/node_modules/${pkgName}/${binRelPath}" => "${binName}"
  end

  test do
    system "#{bin}/${binName}", "--help"
  end
end
`

const tapPath = process.env.TAP_PATH
if (!tapPath) {
  throw new Error('TAP_PATH is required (path to checked out homebrew tap)')
}

const formulaDir = path.join(tapPath, 'Formula')
fs.mkdirSync(formulaDir, { recursive: true })
const formulaPath = path.join(formulaDir, `${pkgName}.rb`)

fs.writeFileSync(formulaPath, formula, 'utf8')
console.log(`Wrote ${formulaPath}`)

async function sha256ForUrl(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  const data = Buffer.from(await res.arrayBuffer())
  return createHash('sha256').update(data).digest('hex')
}

function toFormulaClassName(name) {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function escapeRubyString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function resolveHomepage(repository) {
  if (!repository) return 'https://github.com/regenrek/codex-1up'
  const url = typeof repository === 'string' ? repository : repository.url
  if (!url) return 'https://github.com/regenrek/codex-1up'
  return url.replace(/^git\+/, '').replace(/\.git$/, '')
}

function normalizeLicense(license) {
  if (!license) return 'MIT'
  if (typeof license === 'string') return license
  if (license.type) return license.type
  return 'MIT'
}

function resolveBinName(bin, fallback) {
  if (!bin) return fallback
  if (typeof bin === 'string') return fallback
  if (typeof bin === 'object') {
    const names = Object.keys(bin)
    if (names.length > 0) return names[0]
  }
  return fallback
}

function resolveBinRelPath(bin, pkgName, binName) {
  if (!bin) return `bin/${pkgName}.mjs`
  if (typeof bin === 'string') return bin
  if (typeof bin === 'object' && bin[binName]) return String(bin[binName])
  // Fallback: first value in the map.
  if (typeof bin === 'object') {
    const values = Object.values(bin).map(String).filter(Boolean)
    if (values.length > 0) return values[0]
  }
  return `bin/${pkgName}.mjs`
}
