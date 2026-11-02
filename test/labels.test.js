// Tests for the labels sub-action: whole-word keyword matching, creating missing
// labels, applying them, and never failing a run or logging error values.
const { test } = require('uvu')
const assert = require('uvu/assert')
const { autoLabels, run } = require('../src/labels')

const SECRET = 'SYNTHETIC-ERROR-VALUE'

/**
 * Runs labels.run against a GitHub client whose calls are recorded.
 * @param {{ createLabelError?: { status: number, message: string }, addLabelsError?: Error }} [options]
 */
async function runLabels({ createLabelError, addLabelsError } = {}) {
  /** @type {string[]} */
  const created = []
  /** @type {{ issue_number: number, labels: string[] }[]} */
  const applied = []
  /** @type {string[]} */
  const warnings = []
  /** @type {string[]} */
  const logged = []
  const github = { rest: { issues: {
    createLabel: async (/** @type {{ name: string }} */ label) => {
      if (createLabelError) throw createLabelError
      created.push(label.name)
    },
    addLabels: async (/** @type {{ issue_number: number, labels: string[] }} */ params) => {
      if (addLabelsError) throw addLabelsError
      applied.push(params)
    },
  } } }
  const core = { warning: (/** @type {string} */ m) => warnings.push(m) }
  const context = { repo: { owner: 'o', repo: 'r' } }
  const log = console.log
  const error = console.error
  console.log = (...args) => logged.push(args.join(' '))
  console.error = (...args) => logged.push(args.join(' '))
  process.env.CLAUDE_RUNNER_ISSUE_NUMBER = '5'
  process.env.CLAUDE_RUNNER_TRIGGER_TEXT = 'fix the security bug'
  try {
    await run({ github, context, core })
  } finally {
    console.log = log
    console.error = error
    delete process.env.CLAUDE_RUNNER_ISSUE_NUMBER
    delete process.env.CLAUDE_RUNNER_TRIGGER_TEXT
  }
  return { created, applied, warnings, logged }
}

test('autoLabels from trigger keywords', () => {
  assert.equal(autoLabels('fix the thing'), ['claude-code', 'auto-generated'])
  assert.equal(autoLabels('security performance technical debt document deploy'), ['claude-code', 'auto-generated', 'security-fix', 'performance', 'technical-debt', 'documentation', 'ci-cd'])
})

test('autoLabels matches whole words, not substrings', () => {
  assert.equal(autoLabels('be specific and decide on the circle'), ['claude-code', 'auto-generated'])
  assert.ok(autoLabels('fix CI').includes('ci-cd'))
  assert.ok(autoLabels('update ci/cd').includes('ci-cd'))
  assert.ok(autoLabels('update the documentation').includes('documentation'))
  assert.ok(autoLabels('deployment broke').includes('ci-cd'))
})

test('run creates the labels and applies the matching ones to the issue', async () => {
  const { created, applied, warnings } = await runLabels()
  assert.is(created.length, 7)
  assert.equal(applied.map((a) => a.issue_number), [5])
  assert.equal(applied[0].labels, ['claude-code', 'auto-generated', 'security-fix'])
  assert.equal(warnings, [])
})

test('run still applies labels when they already exist', async () => {
  const { applied, warnings } = await runLabels({ createLabelError: { status: 422, message: 'exists' } })
  assert.is(applied.length, 1)
  assert.equal(warnings, [])
})

test('run warns without failing or logging the error value', async () => {
  const { warnings, logged } = await runLabels({ addLabelsError: new Error(SECRET) })
  assert.is(warnings.length, 1)
  assert.not.ok([...warnings, ...logged].join(' ').includes(SECRET))
})

test.run()
