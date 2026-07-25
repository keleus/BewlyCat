import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import process from 'node:process'

const baseSha = process.env.PR_BASE_SHA
const headSha = process.env.PR_HEAD_SHA

if (!baseSha || !headSha) {
  console.error('缺少 PR_BASE_SHA 或 PR_HEAD_SHA，无法检查 PR 变更。')
  process.exit(2)
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
}

function changedFiles(diffFilter) {
  return git([
    'diff',
    '--name-only',
    '-z',
    `--diff-filter=${diffFilter}`,
    `${baseSha}...${headSha}`,
  ]).split('\0').filter(Boolean)
}

function escapeAnnotation(value) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}

function warning(message, file) {
  const fileAttribute = file ? `file=${escapeAnnotation(file)},` : ''
  console.warn(`::warning ${fileAttribute}title=第三方依赖变更::${escapeAnnotation(message)}`)
}

function error(message, file) {
  console.error(`::error file=${escapeAnnotation(file)},title=PR 文件策略::${escapeAnnotation(message)}`)
}

function isAgentsFile(file) {
  return file.split('/').at(-1) === 'AGENTS.md'
}

function isLocalTestFile(file) {
  return /(?:^|\/)(?:__tests__|tests?|e2e|cypress|test-results|playwright-report|coverage)(?:\/|$)/i.test(file)
    || /(?:^|\/)[^/]+\.(?:test|spec|e2e)\.[^/]+$/i.test(file)
}

function readPackageJson(revision) {
  try {
    return JSON.parse(git(['show', `${revision}:package.json`]))
  }
  catch {
    return {}
  }
}

function dependencyMap(packageJson) {
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
  const dependencies = new Map()

  for (const section of sections) {
    for (const [name, version] of Object.entries(packageJson[section] ?? {}))
      dependencies.set(`${section}:${name}`, { name, section, version })
  }

  return dependencies
}

function compareDependencies() {
  const before = dependencyMap(readPackageJson(baseSha))
  const after = dependencyMap(readPackageJson(headSha))
  const added = []
  const updated = []
  const removed = []

  for (const [key, dependency] of after) {
    if (!before.has(key))
      added.push(dependency)
    else if (before.get(key).version !== dependency.version)
      updated.push({ ...dependency, before: before.get(key).version })
  }

  for (const [key, dependency] of before) {
    if (!after.has(key))
      removed.push(dependency)
  }

  return { added, removed, updated }
}

function dependencyLine(dependency) {
  return `\`${dependency.name}\` (${dependency.section}: \`${dependency.version}\`)`
}

const allChangedFiles = changedFiles('ACDMRTUXB')
const introducedOrModifiedFiles = changedFiles('AMCR')
const agentsFiles = allChangedFiles.filter(isAgentsFile)
const localTestFiles = introducedOrModifiedFiles.filter(isLocalTestFile)
const dependencyFiles = allChangedFiles.filter(file =>
  file === 'package.json'
  || file === 'pnpm-lock.yaml'
  || file === 'pnpm-workspace.yaml',
)

for (const file of agentsFiles)
  error('PR 不允许新增、修改、移动或删除 AGENTS.md。', file)

for (const file of localTestFiles)
  error('PR 不允许提交本地测试文件或测试产物。', file)

const dependencyChanges = compareDependencies()
const summary = ['## PR 文件策略检查', '']

if (agentsFiles.length || localTestFiles.length) {
  summary.push('### ❌ 发现禁止提交的文件', '')

  for (const file of agentsFiles)
    summary.push(`- \`${file}\`：AGENTS.md 不允许通过 PR 改动`)

  for (const file of localTestFiles)
    summary.push(`- \`${file}\`：本地测试文件或测试产物不允许提交`)

  summary.push('')
}
else {
  summary.push('✅ 未发现 AGENTS.md 或本地测试文件变更。', '')
}

if (dependencyFiles.length) {
  const message = `检测到依赖相关文件变更：${dependencyFiles.join('、')}。请确认第三方包的必要性、许可证、体积和安全风险。`
  warning(message, dependencyFiles[0])
  summary.push('### ⚠️ 第三方依赖变更提醒', '', message, '')

  if (dependencyChanges.added.length) {
    summary.push('新增依赖：', '')
    for (const dependency of dependencyChanges.added)
      summary.push(`- ${dependencyLine(dependency)}`)
    summary.push('')
  }

  if (dependencyChanges.updated.length) {
    summary.push('版本变更：', '')
    for (const dependency of dependencyChanges.updated)
      summary.push(`- \`${dependency.name}\` (${dependency.section}: \`${dependency.before}\` → \`${dependency.version}\`)`)
    summary.push('')
  }

  if (dependencyChanges.removed.length) {
    summary.push('移除依赖：', '')
    for (const dependency of dependencyChanges.removed)
      summary.push(`- ${dependencyLine(dependency)}`)
    summary.push('')
  }
}
else {
  summary.push('✅ 未发现第三方依赖相关文件变更。', '')
}

const summaryText = `${summary.join('\n')}\n`

if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryText)
else
  console.log(summaryText)

if (agentsFiles.length || localTestFiles.length)
  process.exitCode = 1
