// Picks the Claude model from keywords in the trigger text (fable, opus, haiku,
// sonnet); defaults to opus. Run as a script it exports CLAUDE_RUNNER_MODEL.
const { exportVariable } = require('./github')

/** Checked in order; first keyword found wins */
const MODEL_KEYWORDS = [
  ['fable', 'claude-fable-5'],
  ['opus', 'opus'],
  ['haiku', 'haiku'],
  ['sonnet', 'sonnet'],
]
const DEFAULT_MODEL = 'opus'

/**
 * @param {string} text
 * @returns {string}
 */
function selectModel(text) {
  const match = MODEL_KEYWORDS.find(([keyword]) => new RegExp(`\\b${keyword}\\b`, 'i').test(text))
  return match ? match[1] : DEFAULT_MODEL
}

if (require.main === module) {
  const model = selectModel(process.env.CLAUDE_RUNNER_TRIGGER_TEXT || '')
  console.log('Claude model', model)
  exportVariable('CLAUDE_RUNNER_MODEL', model)
}

module.exports = { selectModel }
