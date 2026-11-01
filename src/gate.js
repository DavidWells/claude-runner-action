// Decides whether an event may start a Claude run: who sent it, their repo
// association, and whether the body mentions @claude without the artifact marker.
const TRUSTED_ASSOCIATIONS = ['COLLABORATOR', 'MEMBER', 'OWNER']
const ARTIFACT_MARKER = 'claude-dispatch-artifact'

/**
 * Case-insensitive substring check matching the workflow expression contains().
 * @param {string|null|undefined} text
 * @param {string} search
 * @returns {boolean}
 */
function contains(text, search) {
  return String(text || '').toLowerCase().includes(search.toLowerCase())
}

/**
 * @param {string|undefined} association
 * @returns {boolean}
 */
function isTrusted(association) {
  return TRUSTED_ASSOCIATIONS.includes(association || '')
}

/**
 * @param {string} eventName
 * @param {any} payload GitHub webhook event payload
 * @param {string} repoOwner
 * @returns {boolean}
 */
function isAuthorizedTrigger(eventName, payload, repoOwner) {
  const sender = payload.sender?.login
  const isOwner = sender === repoOwner

  switch (eventName) {
    case 'workflow_dispatch':
      return Boolean(payload.inputs?.trigger_text) && Boolean(payload.inputs?.actor)

    case 'pull_request_target': {
      const pr = payload.pull_request || {}
      const sameRepo = pr.head?.repo?.full_name === payload.repository?.full_name
      return sameRepo &&
        contains(pr.body, '@claude') &&
        !contains(pr.body, ARTIFACT_MARKER)
    }

    case 'issue_comment': {
      const comment = payload.comment || {}
      return (isOwner || sender === 'github-actions[bot]' || isTrusted(comment.author_association)) &&
        contains(comment.body, '@claude') &&
        !contains(comment.body, ARTIFACT_MARKER)
    }

    case 'issues': {
      const issue = payload.issue || {}
      // The issue's author, not the sender: `assigned` fires with the assigner as
      // sender while the text Claude runs on is still the author's
      return isTrusted(issue.author_association) &&
        (contains(issue.body, '@claude') || contains(issue.title, '@claude')) &&
        !contains(issue.body, ARTIFACT_MARKER)
    }

    case 'pull_request_review_comment':
      return (isOwner || isTrusted(payload.comment?.author_association)) &&
        contains(payload.comment?.body, '@claude')

    case 'pull_request_review':
      return (isOwner || isTrusted(payload.review?.author_association)) &&
        contains(payload.review?.body, '@claude')

    default:
      return false
  }
}

/**
 * github-script entry: exports CLAUDE_RUNNER_AUTHORIZED for later steps.
 * @param {{ context: any, core: any }} params
 */
function run({ context, core }) {
  const authorized = isAuthorizedTrigger(context.eventName, context.payload, context.repo.owner)
  if (!authorized) {
    core.notice('Event is not an authorized @claude trigger; skipping run')
  }
  core.exportVariable('CLAUDE_RUNNER_AUTHORIZED', String(authorized))
}

module.exports = { isAuthorizedTrigger, run }
