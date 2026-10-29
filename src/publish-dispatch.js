// Publishes a workflow_dispatch run's result (claude.job.completed/failed) to the
// event bus so the reply mailer can email the sender a threaded receipt.
const { publish } = require('./event-bus')

/**
 * @param {{ outcome: string, repository?: string, branch?: string, runUrl?: string, prUrl?: string, email?: string, inReplyTo?: string, subject?: string }} params
 */
function dispatchResultEvent({ outcome, repository = '', branch = '', runUrl = '', prUrl = '', email = '', inReplyTo = '', subject = '' }) {
  const status = outcome === 'success' ? 'completed' : 'failed'
  return {
    type: `claude.job.${status}`,
    detail: {
      status,
      repository,
      event: 'workflow_dispatch',
      branch,
      results: { runUrl, prUrl, prCreated: prUrl !== '', claudeOutcome: outcome },
      notify: { email, inReplyTo, subject },
    },
  }
}

if (require.main === module) {
  const env = process.env
  const event = dispatchResultEvent({
    outcome: env.CLAUDE_OUTCOME || '',
    repository: env.GITHUB_REPOSITORY,
    branch: env.CLAUDE_RUNNER_DISPATCH_BRANCH,
    runUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    prUrl: env.CLAUDE_RUNNER_DISPATCH_PR_URL,
    email: env.NOTIFY_EMAIL,
    inReplyTo: env.IN_REPLY_TO,
    subject: env.NOTIFY_SUBJECT,
  })
  console.log(`🔔 Publishing ${event.type} to event bus`)
  publish({ url: env.EVENT_BUS_URL || '', apiKey: env.EVENT_BUS_API_KEY || '', event })
}

module.exports = { dispatchResultEvent }
