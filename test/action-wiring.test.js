// Checks the composite action files are valid for GitHub's composite runner and
// that every src/ and scripts/ file they reference exists.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const ROOT = path.join(__dirname, '..')
const ACTIONS = ['action.yml', 'finalize/action.yml']

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

test.run()
