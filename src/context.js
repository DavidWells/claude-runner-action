// Extracts the issue/PR, refs and trigger text a run works on, detects issues
// that already have a linked PR, and exports it all as CLAUDE_RUNNER_* env vars.

/**
 * @typedef {Object} RunContext
 * @property {string} issueNumber
 * @property {string} prNumber
 * @property {string} headRef
 * @property {string} baseRef
 * @property {string} headSha
 * @property {boolean} isPR
 * @property {string} triggerText
 */

/**
 * @param {string} text
 * @returns {string}
 */
function ensureMention(text) {
  return text.includes('@claude') ? text : `@claude ${text}`
}

/**
 * @param {any} pr pull_request payload object
 * @param {string} triggerText
 * @returns {RunContext}
 */
function fromPullRequest(pr, triggerText) {
  return {
    issueNumber: String(pr.number),
    prNumber: String(pr.number),
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    headSha: pr.head.sha,
    isPR: true,
    triggerText: triggerText || '',
  }
}

/**
 * Context available from the event payload alone (no API calls).
 * @param {string} eventName
 * @param {any} payload
 * @returns {RunContext}
 */
function contextFromPayload(eventName, payload) {
  const empty = { issueNumber: '', prNumber: '', headRef: '', baseRef: '', headSha: '', isPR: false, triggerText: '' }

  switch (eventName) {
    case 'workflow_dispatch':
      return { ...empty, triggerText: ensureMention(payload.inputs.trigger_text) }
    case 'pull_request':
      return fromPullRequest(payload.pull_request, payload.pull_request.body)
    case 'issues':
      return { ...empty, issueNumber: String(payload.issue.number), triggerText: `${payload.issue.title} ${payload.issue.body}` }
    case 'issue_comment':
      return { ...empty, issueNumber: String(payload.issue.number), triggerText: payload.comment.body }
    case 'pull_request_review_comment':
      return fromPullRequest(payload.pull_request, payload.comment.body)
    case 'pull_request_review':
      return fromPullRequest(payload.pull_request, payload.review.body)
    default:
      return empty
  }
}

/**
 * Pull requests that cross-reference an issue, from its timeline events.
 * @param {any[]} timeline
 */
function linkedPullRequests(timeline) {
  return timeline
    .filter((event) => event.event === 'cross-referenced')
    .filter((event) => event.source?.issue?.pull_request?.url)
    .map((event) => ({
      issueNumber: event.source?.issue?.number,
      actor: event.actor?.login,
      url: event.source?.issue?.pull_request?.url,
      title: event.source?.issue?.title,
      body: event.source?.issue?.body,
    }))
}

/**
 * Whether a PR's head lives outside this repo. Its code is untrusted and would
 * be checked out next to the run's secrets. A deleted fork has no head repo.
 * @param {any} pr pull_request payload object
 * @param {string} repoFullName
 * @returns {boolean}
 */
function isForkHead(pr, repoFullName) {
  return pr.head?.repo?.full_name !== repoFullName
}

/**
 * Fork PRs and issues that already have a linked PR are left alone.
 * @param {{ isPR: boolean, hasLinkedPR: boolean, isFork?: boolean }} params
 * @returns {boolean}
 */
function shouldContinue({ isPR, hasLinkedPR, isFork = false }) {
  return !isFork && !(!isPR && hasLinkedPR)
}

/**
 * github-script entry.
 * @param {{ github: any, context: any, core: any }} params
 */
async function run({ github, context, core }) {
  const ctx = contextFromPayload(context.eventName, context.payload)
  let hasLinkedPR = false
  let pullRequest = context.payload.pull_request

  if (context.eventName === 'issue_comment') {
    const issueNumber = Number(ctx.issueNumber)
    if (context.payload.issue.pull_request) {
      try {
        const pr = await github.rest.pulls.get({ owner: context.repo.owner, repo: context.repo.repo, pull_number: issueNumber })
        Object.assign(ctx, fromPullRequest(pr.data, ctx.triggerText))
        pullRequest = pr.data
        console.log(JSON.stringify({ code: 'claude-workflow.015' }))
      } catch (error) {
        // Treat as a regular issue when the PR can't be read
        console.error(JSON.stringify({ code: 'claude-workflow.016' }))
      }
    } else {
      try {
        const { data: timeline } = await github.rest.issues.listEventsForTimeline({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueNumber,
          per_page: 100,
          headers: { accept: 'application/vnd.github.mockingbird-preview+json' },
        })
        console.log(JSON.stringify({ code: 'claude-workflow.017' }))
        hasLinkedPR = linkedPullRequests(timeline).length > 0
        console.log(JSON.stringify({ code: 'claude-workflow.018' }))
      } catch (error) {
        console.error(JSON.stringify({ code: 'claude-workflow.020' }))
      }
    }
  }

  const isFork = Boolean(pullRequest) && isForkHead(pullRequest, context.payload.repository.full_name)
  const proceed = shouldContinue({ isPR: ctx.isPR, hasLinkedPR, isFork })
  if (!proceed) {
    core.notice(isFork ? 'PR head is a fork; skipping run' : 'Issue already has a linked PR; skipping run')
  }

  core.exportVariable('CLAUDE_RUNNER_ISSUE_NUMBER', ctx.issueNumber)
  core.exportVariable('CLAUDE_RUNNER_PR_NUMBER', ctx.prNumber)
  core.exportVariable('CLAUDE_RUNNER_HEAD_REF', ctx.headRef)
  core.exportVariable('CLAUDE_RUNNER_BASE_REF', ctx.baseRef)
  core.exportVariable('CLAUDE_RUNNER_HEAD_SHA', ctx.headSha)
  core.exportVariable('CLAUDE_RUNNER_IS_PR', String(ctx.isPR))
  core.exportVariable('CLAUDE_RUNNER_HAS_LINKED_PR', String(hasLinkedPR))
  core.exportVariable('CLAUDE_RUNNER_TRIGGER_TEXT', ctx.triggerText)
  core.exportVariable('CLAUDE_RUNNER_SHOULD_CONTINUE', String(proceed))
  console.log(JSON.stringify({ code: 'claude-workflow.022' }))
}

module.exports = { ensureMention, contextFromPayload, linkedPullRequests, isForkHead, shouldContinue, run }
