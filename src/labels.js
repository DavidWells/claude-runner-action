// Labels the triggering Issue/PR after a successful run: ensures the label set
// exists, then applies claude-code, auto-generated and keyword labels.

const REQUIRED_LABELS = [
  { name: 'claude-code', color: '7B68EE', description: 'Items created or modified by Claude Code' },
  { name: 'auto-generated', color: '00D084', description: 'Automatically generated content' },
  { name: 'security-fix', color: 'FF4444', description: 'Security-related fixes' },
  { name: 'performance', color: 'FFA500', description: 'Performance improvements' },
  { name: 'technical-debt', color: '8B4513', description: 'Resolving technical debt' },
  { name: 'documentation', color: '0366D6', description: 'Documentation related' },
  { name: 'ci-cd', color: '28A745', description: 'CI/CD improvements' },
]

/** Keyword pattern for each label applied from the trigger text */
const KEYWORD_LABELS = [
  ['security-fix', /\bsecurity\b/],
  ['performance', /\bperformance\b/],
  ['technical-debt', /\btechnical debt\b/],
  ['documentation', /\bdocument/],
  ['ci-cd', /\b(ci|cd)\b|\bdeploy/],
]

/**
 * Labels to apply for a trigger text.
 * @param {string} triggerText
 * @returns {string[]}
 */
function autoLabels(triggerText) {
  const text = triggerText.toLowerCase()
  const matched = KEYWORD_LABELS.filter(([, pattern]) => /** @type {RegExp} */ (pattern).test(text)).map(([label]) => /** @type {string} */ (label))
  return ['claude-code', 'auto-generated', ...matched]
}

/**
 * github-script entry. Warns instead of failing, since labels never change a run's outcome.
 * @param {{ github: any, context: any, core: any }} params
 */
async function run({ github, context, core }) {
  const { owner, repo } = context.repo
  console.log(JSON.stringify({ code: 'claude-workflow.029' }))

  try {
    for (const label of REQUIRED_LABELS) {
      try {
        await github.rest.issues.createLabel({ owner, repo, ...label })
      } catch (error) {
        // 422 means the label already exists
        if (/** @type {any} */ (error).status !== 422) throw error
      }
    }
    await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: Number(process.env.CLAUDE_RUNNER_ISSUE_NUMBER),
      labels: autoLabels(process.env.CLAUDE_RUNNER_TRIGGER_TEXT || ''),
    })
  } catch (error) {
    console.error(JSON.stringify({ code: 'claude-workflow.037' }))
    core.warning('Could not apply labels')
  }
}

module.exports = { autoLabels, run }
