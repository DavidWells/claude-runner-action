// End-to-end tests of the bash step scripts against real git repos and a temp
// GITHUB_OUTPUT file, the way the composite actions run them.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync, execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const tmpDirs = []
process.on('exit', () => tmpDirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })))

/** @returns {string} */
function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cra-'))
  tmpDirs.push(dir)
  return dir
}

/**
 * @param {string} cwd
 * @param {...string} args
 */
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Parse name<<delimiter heredoc entries from a GITHUB_OUTPUT file.
 * @param {string} file
 * @returns {Record<string, string>}
 */
function readOutputs(file) {
  /** @type {Record<string, string>} */
  const out = {}
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([\w-]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/**
 * @param {string} script
 * @param {string} cwd
 * @param {Record<string, string>} env
 */
function runScript(script, cwd, env) {
  const output = path.join(tmp(), 'github_output')
  fs.writeFileSync(output, '')
  const res = spawnSync('bash', [path.join(ROOT, 'scripts', script)], {
    cwd,
    env: { PATH: process.env.PATH, HOME: os.homedir(), GITHUB_OUTPUT: output, ...env },
    encoding: 'utf8',
  })
  return { ...res, outputs: readOutputs(output) }
}

/** Bare origin with one commit on main, plus a clone of it. */
function repoWithOrigin() {
  const origin = tmp()
  git(origin, 'init', '-q', '--bare', '-b', 'main')
  const work = tmp()
  git(work, 'init', '-q', '-b', 'main')
  git(work, 'config', 'user.name', 't')
  git(work, 'config', 'user.email', 't@t')
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n')
  git(work, 'add', '.')
  git(work, 'commit', '-q', '-m', 'init')
  git(work, 'remote', 'add', 'origin', origin)
  git(work, 'push', '-q', 'origin', 'main')
  return { origin, work, startSha: git(work, 'rev-parse', 'HEAD') }
}

const wipEnv = (startSha, extra = {}) => ({
  START_SHA: startSha,
  HEAD_REF: '',
  DEFAULT_BRANCH: 'main',
  RUN_ID: '77',
  CLAUDE_OUTCOME: 'failure',
  ...extra,
})

test('wip-push: nothing to push when tree is clean and HEAD unchanged', () => {
  const { work, startSha } = repoWithOrigin()
  const res = runScript('wip-push.sh', work, wipEnv(startSha))
  assert.is(res.status, 0, res.stderr)
  assert.ok(res.stdout.includes('No unfinished work to push'))
  assert.equal(res.outputs, {})
})

test('wip-push: commits dirty tree on default branch to claude/wip-<run>', () => {
  const { origin, work, startSha } = repoWithOrigin()
  fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')
  const res = runScript('wip-push.sh', work, wipEnv(startSha))
  assert.is(res.status, 0, res.stderr)
  assert.is(res.outputs.branch, 'claude/wip-77')
  assert.is(git(origin, 'rev-parse', 'claude/wip-77'), res.outputs.sha)
  assert.is(git(origin, 'log', '-1', '--format=%s', 'claude/wip-77'), 'wip: unfinished Claude work from run 77 (failure)')
  assert.is(git(origin, 'rev-parse', 'main'), startSha)
})

test('wip-push: pushes committed work on a feature branch to that branch', () => {
  const { origin, work, startSha } = repoWithOrigin()
  git(work, 'checkout', '-q', '-b', 'feat')
  fs.writeFileSync(path.join(work, 'c.txt'), 'c\n')
  git(work, 'add', '.')
  git(work, 'commit', '-q', '-m', 'claude commit')
  const res = runScript('wip-push.sh', work, wipEnv(startSha))
  assert.is(res.status, 0, res.stderr)
  assert.is(res.outputs.branch, 'feat')
  assert.is(git(origin, 'log', '-1', '--format=%s', 'feat'), 'claude commit')
})

test('wip-push: detached HEAD falls back to HEAD_REF', () => {
  const { origin, work, startSha } = repoWithOrigin()
  git(work, 'checkout', '-q', '--detach')
  fs.writeFileSync(path.join(work, 'd.txt'), 'd\n')
  const res = runScript('wip-push.sh', work, wipEnv(startSha, { HEAD_REF: 'pr-branch' }))
  assert.is(res.status, 0, res.stderr)
  assert.is(res.outputs.branch, 'pr-branch')
  assert.is(git(origin, 'rev-parse', 'pr-branch'), res.outputs.sha)
})

test('project-info: detects node framework and counts source files', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'package.json'), '{"dependencies":{"react":"19"}}')
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'a.tsx'), '')
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), '')
  fs.writeFileSync(path.join(dir, 'README.md'), '')
  const res = runScript('project-info.sh', dir, {})
  assert.is(res.status, 0, res.stderr)
  assert.equal(res.outputs, { 'project-type': 'node', framework: 'React', 'total-files': '2' })
})

test('project-info: rust and unknown', () => {
  const rust = tmp()
  fs.writeFileSync(path.join(rust, 'Cargo.toml'), '')
  assert.equal(runScript('project-info.sh', rust, {}).outputs, { 'project-type': 'rust', framework: 'Rust', 'total-files': '0' })
  assert.equal(runScript('project-info.sh', tmp(), {}).outputs, { 'project-type': 'unknown', framework: '', 'total-files': '0' })
})

test.run()
