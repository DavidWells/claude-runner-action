// Opens a PR from the branch Claude pushed for an Issue (or comments on the
// existing one) and publishes a claude.job.* event for the result.
const { publish } = require('./event-bus')

/**
 * @param {{ issueNumber: string, actor: string, claudeCommentBody: string, owner: string, repo: string, runId: string }} params
 * @returns {string}
 */
function pullRequestBody({ issueNumber, actor, claudeCommentBody, owner, repo, runId }) {
  return `## 🤖 Automated fix by Claude Code

**Related Issue:** #${issueNumber}
**Executed by:** @${actor}

---

${claudeCommentBody}

**If additional fixes are needed:** Mention \`@ claude\` in a comment on this PR.

*resolves #${issueNumber}*

Please review @copilot

<!-- CLAUDE_ISSUE_RESPONSE start -->
<!-- CLAUDE_ISSUE_RESPONSE end -->

---
*Automated PR by [Claude Code Action - Run #${runId}](https://github.com/${owner}/${repo}/actions/runs/${runId})*
`
}

/**
 * @param {{ status: 'completed'|'failed', owner: string, repo: string, issueNumber: string, branch: string, commit: string, actor: string, eventName: string, pr: { number: number, html_url: string }|null, results: object, error?: string, now?: number }} params
 */
function jobEvent({ status, owner, repo, issueNumber, branch, commit, actor, eventName, pr, results, error, now = Date.now() }) {
  const detail = {
    jobId: `claude-${owner}-${repo}-${issueNumber}-${now}`,
    status,
    repository: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
    branch,
    commit,
    results: {
      prCreated: Boolean(pr),
      prNumber: pr ? pr.number : null,
      prUrl: pr ? pr.html_url : null,
      issueNumber: Number(issueNumber),
      actor,
      event: eventName,
      ...results,
      ...(error === undefined ? {} : { error }),
    },
  }
  return { type: `claude.job.${status}`, detail }
}

/**
 * github-script entry. Exports CLAUDE_RUNNER_AUTO_PR_* env vars.
 * @param {{ github: any, context: any, core: any, branchName: string, eventBusUrl: string, eventBusApiKey: string }} params
 */
async function run({ github, context, core, branchName, eventBusUrl, eventBusApiKey }) {
  const env = process.env
  const issueNumber = env.CLAUDE_RUNNER_ISSUE_NUMBER || ''
  const defaultBranch = context.payload.repository.default_branch
  const { owner, repo } = context.repo
  const runId = String(context.runId)
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`
  const eventBase = {
    owner,
    repo,
    issueNumber,
    branch: branchName || defaultBranch || 'main',
    commit: context.sha,
    actor: context.actor,
    eventName: context.eventName,
    results: {
      framework: env.CLAUDE_RUNNER_FRAMEWORK || '',
      totalFiles: env.CLAUDE_RUNNER_TOTAL_FILES || '',
      hasChanges: env.CLAUDE_RUNNER_HAS_CHANGES || '',
    },
  }

  try {
    console.log(JSON.stringify({ code: 'claude-workflow.038' }))
    let existingPr = null
    try {
      const { data: pulls } = await github.rest.pulls.list({ owner, repo, head: `${owner}:${branchName}`, state: 'open', per_page: 1 })
      existingPr = pulls.length > 0 ? pulls[0] : null
    } catch (error) {
      existingPr = null
    }

    let pr
    if (existingPr) {
      pr = existingPr
      console.log(JSON.stringify({ code: 'claude-workflow.039' }))
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `🔄 **Claude Code has updated this branch** with new changes.\n\n[View the latest workflow run](${runUrl})`,
      })
    } else {
      console.log(JSON.stringify({ code: 'claude-workflow.040' }))
      const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: Number(issueNumber) })
      const { data: comments } = await github.rest.issues.listComments({ owner, repo, issue_number: Number(issueNumber) })
      const claudeComment = comments.find((/** @type {any} */ c) => c.user.login === 'claude[bot]' && c.body.includes('Claude'))
      const claudeCommentBody = claudeComment ? claudeComment.body.replace(/\[Create PR ➔\]\([^)]+\)/, '') : ''

      const { data: newPr } = await github.rest.pulls.create({
        owner,
        repo,
        title: `🤖 Claude Code: ${issue.title}`,
        head: branchName,
        base: defaultBranch,
        body: pullRequestBody({ issueNumber, actor: context.actor, claudeCommentBody, owner, repo, runId }),
        draft: false,
      })
      pr = newPr
      console.log(JSON.stringify({ code: 'claude-workflow.041' }))

      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: pr.number,
        body: `**ℹ️ Action Run:** ${runUrl}\n\n<!-- claude-run-status -->\n`,
      })
    }

    core.exportVariable('CLAUDE_RUNNER_AUTO_PR_NUMBER', String(pr.number))
    core.exportVariable('CLAUDE_RUNNER_AUTO_PR_URL', pr.html_url)
    core.exportVariable('CLAUDE_RUNNER_AUTO_PR_BRANCH', branchName)

    console.log(JSON.stringify({ code: 'claude-workflow.042' }))
    await publish({ url: eventBusUrl, apiKey: eventBusApiKey, event: jobEvent({ ...eventBase, status: 'completed', pr }) })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(JSON.stringify({ code: 'claude-workflow.048' }))
    core.exportVariable('CLAUDE_RUNNER_AUTO_PR_ERROR', errorMessage)

    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: Number(issueNumber),
      body: `❌ **Automatic PR creation failed**\n\n**Error:** \`${errorMessage}\`\n\n**Solution**: A branch named \`${branchName}\` was created with the changes. Please create a PR from it manually or rerun the job.\n**Details**: [Actions run log](${context.serverUrl}/${owner}/${repo}/actions/runs/${runId})`,
    })

    console.log(JSON.stringify({ code: 'claude-workflow.049' }))
    await publish({ url: eventBusUrl, apiKey: eventBusApiKey, event: jobEvent({ ...eventBase, status: 'failed', pr: null, error: errorMessage }) })
  }
}

module.exports = { pullRequestBody, jobEvent, run }
