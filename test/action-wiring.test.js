// Checks the composite action files are valid for GitHub's composite runner and
// that every src/ and scripts/ file they reference exists.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const ROOT = path.join(__dirname, '..')
const ACTIONS = ['action.yml', 'finalize/action.yml', 'labels/action.yml']

/**
 * @param {string} file
 */
function load(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8')
  return { text, doc: YAML.parse(text) }
}

for (const file of ACTIONS) {
  test(`${file}: composite steps are well-formed`, () => {
    const { doc } = load(file)
    assert.is(doc.runs.using, 'composite')
    for (const step of doc.runs.steps) {
      assert.ok(step.run || step.uses, `step without run/uses: ${step.name}`)
      if (step.run) assert.ok(step.shell, `run step without shell: ${step.name}`)
      // Composite steps ignore timeout-minutes; the caller sets it
      assert.not.ok('timeout-minutes' in step, `timeout-minutes in composite step: ${step.name}`)
    }
  })

  test(`${file}: referenced src/ and scripts/ files exist`, () => {
    const { text } = load(file)
    const actionPath = path.dirname(path.join(ROOT, file))
    // ACTION_DIR is github.action_path, or its parent when set with "/.."
    const actionDir = text.includes('ACTION_DIR: ${{ github.action_path }}/..') ? path.join(actionPath, '..') : actionPath
    const refs = [
      ...[...text.matchAll(/ACTION_DIR\}(\/[\w./-]+\.js)/g)].map((m) => path.join(actionDir, m[1])),
      ...[...text.matchAll(/GITHUB_ACTION_PATH(\/[\w./-]+\.(?:js|sh))/g)].map((m) => path.join(actionPath, m[1])),
    ]
    assert.ok(refs.length > 0)
    for (const ref of refs) {
      assert.ok(fs.existsSync(ref), `${file} references missing ${path.relative(ROOT, ref)}`)
    }
  })

  test(`${file}: steps only read inputs it declares`, () => {
    const { text, doc } = load(file)
    const declared = Object.keys(doc.inputs || {})
    // Action inputs only, not github.event.inputs (workflow_dispatch inputs)
    const used = [...text.matchAll(/(?<![\w.])inputs\.([\w-]+)/g)].map((m) => m[1])
    for (const name of used) {
      assert.ok(declared.includes(name), `${file} uses undeclared input ${name}`)
    }
  })
}

test('template triggers on pull_request, not pull_request_target', () => {
  const { doc } = load('workflow-templates/claude.yml')
  assert.ok('pull_request' in doc.on)
  assert.not.ok('pull_request_target' in doc.on)
})

test('third-party actions are pinned to a commit SHA', () => {
  for (const file of ACTIONS) {
    const { doc } = load(file)
    for (const step of doc.runs.steps) {
      if (!step.uses || step.uses.startsWith('actions/')) continue
      assert.match(step.uses, /@[0-9a-f]{40}$/, `${file}: ${step.uses}`)
    }
  }
})

test('transcripts and sessions are only stored for private repos', () => {
  const { doc } = load('finalize/action.yml')
  for (const name of ['Save Claude session', 'Upload Claude transcript']) {
    const step = doc.runs.steps.find((/** @type {{ name: string }} */ s) => s.name === name)
    assert.ok(step.if.includes('github.event.repository.private == true'), name)
  }
})

test('caller template requests only the permissions the action uses', () => {
  const { doc } = load('workflow-templates/claude.yml')
  assert.equal(Object.keys(doc.jobs.claude.permissions).sort(), ['actions', 'contents', 'id-token', 'issues', 'pull-requests'])
})

test('caller template runs Claude, labels on success, then finalizes', () => {
  const { doc } = load('workflow-templates/claude.yml')
  const steps = doc.jobs.claude.steps
  assert.equal(steps.map((/** @type {{ uses: string }} */ s) => s.uses), [
    'DavidWells/claude-runner-action@v1',
    'DavidWells/claude-runner-action/labels@v1',
    'DavidWells/claude-runner-action/finalize@v1',
  ])
  assert.is(steps[0].id, 'claude')
  assert.is(steps[1].if, "steps.claude.outputs.claude-outcome == 'success'")
  assert.is(steps[2].if, 'always()')
})

test('main action has no repository management', () => {
  const { text } = load('action.yml')
  assert.not.ok(/repo-management|CAN_MANAGE|REPO_ADMIN_MODE/.test(text))
  assert.not.ok(fs.existsSync(path.join(ROOT, 'src/repo-management.js')))
})

test.run()
