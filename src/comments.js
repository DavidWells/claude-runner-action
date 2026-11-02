// Renders the sticky status comment a run leaves on its Issue/PR: in-progress,
// success (auto PR) or failure (WIP branch, rerun tips).
const STATUS_MARKER = '<!-- claude-run-status -->'

const EVENT_ICONS = {
  pull_request_target: '🔀',
  issue_comment: '💬',
  issues: '📋',
  pull_request_review_comment: '📝',
  pull_request_review: '👀',
}

/**
 * @typedef {Object} RunReport
 * @property {string} owner
 * @property {string} repo
 * @property {string} runId
 * @property {string} serverUrl
 * @property {string} eventName
 * @property {string} actor
 * @property {string} issueNumber
 * @property {boolean} isPR
 * @property {string} [headRef]
 * @property {string} [baseRef]
 * @property {string} [framework]
 * @property {string} [totalFiles]
 * @property {boolean} [hasChanges]
 * @property {string} [autoPrNumber]
 * @property {string} [autoPrUrl]
 * @property {string} [autoPrBranch]
 * @property {string} [wipBranch]
 * @property {string} [wipSha]
 */

/**
 * @param {RunReport} r
 * @returns {string}
 */
function successComment(r) {
  const contextType = r.isPR ? 'Pull Request' : 'Issue'
  const icon = EVENT_ICONS[/** @type {keyof typeof EVENT_ICONS} */ (r.eventName)] || '🤖'
  const framework = r.framework || 'Unknown'
  const totalFiles = r.totalFiles || '0'

  let message = `${icon} **Claude Code execution complete** ✅\n\n`

  let prFilesUrl = ''
  if (!r.isPR && r.hasChanges && r.autoPrNumber) {
    message += `🎉 **Automatic PR created successfully!**\n`
    message += `- PR: [#${r.autoPrNumber}](${r.autoPrUrl})\n`
    message += `- Branch: \`${r.autoPrBranch}\`\n`
    message += `- Next step: Review PR → Merge\n\n`
    prFilesUrl = `https://github.com/${r.owner}/${r.repo}/pull/${r.autoPrNumber}/files`
  } else if (!r.isPR && !r.hasChanges) {
    message += `ℹ️ **Analysis only** (no code changes)\n\n`
  }

  message += `**📊 Execution Info:** ${contextType} #${r.issueNumber} | ${framework} (${totalFiles} files) | @${r.actor}\n`
  if (r.isPR) {
    message += `**🌿 Branch:** \`${r.headRef}\` → \`${r.baseRef}\`\n`
  }
  message += `**ℹ️ Action Run:** https://github.com/${r.owner}/${r.repo}/actions/runs/${r.runId}\n`
  if (prFilesUrl) {
    message += `**📝 PR Changes:** [${prFilesUrl}](${prFilesUrl})\n`
  }

  message += `\n${STATUS_MARKER}`
  return message
}

/**
 * @param {RunReport} r
 * @returns {string}
 */
function failureComment(r) {
  const contextType = r.isPR ? 'Pull Request' : 'Issue'
  let message = `❌ **Claude Code execution failed**\n\n`
  message += `An error occurred while processing ${contextType} #${r.issueNumber}.\n\n`
  message += `**📊 Error Info:** ${contextType} | \`${r.eventName}\` | @${r.actor}\n`
  message += `**🔗 Detailed Log:** [Actions run log](${r.serverUrl}/${r.owner}/${r.repo}/actions/runs/${r.runId})\n\n`

  if (r.wipBranch) {
    message += `📦 **Unfinished work pushed:** \`${r.wipBranch}\` @ ${(r.wipSha || '').slice(0, 8)}. Mention \`@claude continue\` to resume the session from there.\n\n`
  }

  message += `**🤔 Possible Causes and Solutions:**\n\n`
  message += `**1. Temporary Issue** (most common)\n`
  message += `- Temporary limitations of the Claude API\n`
  message += `- → **Solution**: Rerun with \`claude\` after 5 minutes\n\n`
  message += `**2. Timeout** (50-minute limit)\n`
  message += `- The task may be too complex\n`
  message += `- → **Solution**: Break down the task with more specific instructions\n\n`
  message += `**3. Configuration Issue**\n`
  message += `- Expired or misconfigured tokens\n`
  message += `- → **Solution**: Check in Settings → Secrets → Actions\n`
  message += `  - \`CLAUDE_CODE_OAUTH_TOKEN\`\n\n`
  message += `**💡 Rerun Tips:**\n`
  message += `- Be specific: \`claude review src/components/Button.tsx\`\n`
  message += `- Step by step: Start with one file\n`
  message += `- Be clear: State the expected outcome\n\n`
  message += `---\n`
  message += `🔄 **Rerun**: Please try again with \`claude [specific instructions]\`\n`
  message += `📞 **Support**: If the problem persists, please contact an administrator`
  message += `\n${STATUS_MARKER}`
  return message
}

/**
 * Builds a RunReport from the CLAUDE_RUNNER_* env the main action exported.
 * @param {NodeJS.ProcessEnv} env
 * @param {any} context github-script context
 * @param {{ wipBranch?: string, wipSha?: string }} wip
 * @returns {RunReport}
 */
function reportFromEnv(env, context, wip) {
  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    runId: String(context.runId),
    serverUrl: context.serverUrl,
    eventName: context.eventName,
    actor: context.actor,
    issueNumber: env.CLAUDE_RUNNER_ISSUE_NUMBER || '',
    isPR: env.CLAUDE_RUNNER_IS_PR === 'true',
    headRef: env.CLAUDE_RUNNER_HEAD_REF,
    baseRef: env.CLAUDE_RUNNER_BASE_REF,
    framework: env.CLAUDE_RUNNER_FRAMEWORK,
    totalFiles: env.CLAUDE_RUNNER_TOTAL_FILES,
    hasChanges: env.CLAUDE_RUNNER_HAS_CHANGES === 'true',
    autoPrNumber: env.CLAUDE_RUNNER_AUTO_PR_NUMBER,
    autoPrUrl: env.CLAUDE_RUNNER_AUTO_PR_URL,
    autoPrBranch: env.CLAUDE_RUNNER_AUTO_PR_BRANCH,
    wipBranch: wip.wipBranch,
    wipSha: wip.wipSha,
  }
}

/**
 * github-script entry for finalize: outputs the final status comment body.
 * @param {{ context: any, core: any, outcome: string, wipBranch: string, wipSha: string }} params
 */
function run({ context, core, outcome, wipBranch, wipSha }) {
  const report = reportFromEnv(process.env, context, { wipBranch, wipSha })
  if (outcome === 'success') {
    core.setOutput('comment-body', successComment(report))
  } else if (outcome === 'failure') {
    core.setOutput('comment-body', failureComment(report))
  }
}

module.exports = { STATUS_MARKER, successComment, failureComment, run }
