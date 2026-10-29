// Post-run repository housekeeping on the triggering Issue/PR: ensures labels and
// a monthly milestone, applies keyword labels, and reports projects/security/wiki/pages/actions state.

const REQUIRED_LABELS = [
  { name: 'claude-code', color: '7B68EE', description: 'Items created or modified by Claude Code' },
  { name: 'auto-generated', color: '00D084', description: 'Automatically generated content' },
  { name: 'security-fix', color: 'FF4444', description: 'Security-related fixes' },
  { name: 'performance', color: 'FFA500', description: 'Performance improvements' },
  { name: 'technical-debt', color: '8B4513', description: 'Resolving technical debt' },
  { name: 'documentation', color: '0366D6', description: 'Documentation related' },
  { name: 'ci-cd', color: '28A745', description: 'CI/CD improvements' },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Labels to apply for a lowercased trigger text.
 * @param {string} triggerText
 * @returns {string[]}
 */
function autoLabels(triggerText) {
  const text = triggerText.toLowerCase()
  const labels = ['claude-code', 'auto-generated']
  if (text.includes('security')) labels.push('security-fix')
  if (text.includes('performance')) labels.push('performance')
  if (text.includes('technical debt')) labels.push('technical-debt')
  if (text.includes('document')) labels.push('documentation')
  if (text.includes('ci') || text.includes('cd') || text.includes('deploy')) labels.push('ci-cd')
  return labels
}

/**
 * @param {Date} now
 * @returns {{ title: string, dueOn: string }}
 */
function currentMilestone(now) {
  return {
    title: `${now.getFullYear()}-${MONTH_NAMES[now.getMonth()]}`,
    dueOn: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString(),
  }
}

/**
 * @param {any} error
 * @returns {string}
 */
function message(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * github-script entry. Exports CLAUDE_RUNNER_MANAGEMENT_* env vars.
 * @param {{ github: any, context: any, core: any }} params
 */
async function run({ github, context, core }) {
  const issueNumber = Number(process.env.CLAUDE_RUNNER_ISSUE_NUMBER)
  const triggerText = (process.env.CLAUDE_RUNNER_TRIGGER_TEXT || '').toLowerCase()
  const { owner, repo } = context.repo

  console.log(JSON.stringify({ code: 'claude-workflow.028' }))

  /** @type {Record<string, string[]>} */
  const results = { labels: [], milestones: [], projects: [], releases: [], security: [], wiki: [], pages: [], actions: [] }

  try {
    console.log(JSON.stringify({ code: 'claude-workflow.029' }))
    for (const label of REQUIRED_LABELS) {
      try {
        await github.rest.issues.createLabel({ owner, repo, ...label })
        results.labels.push(`✅ Created: ${label.name}`)
      } catch (error) {
        if (/** @type {any} */ (error).status === 422) {
          results.labels.push(`📋 Exists: ${label.name}`)
        } else {
          results.labels.push(`❌ Error: ${label.name} - ${message(error)}`)
        }
      }
    }

    const labels = autoLabels(triggerText)
    await github.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels })
    results.labels.push(`🏷️ Applied: ${labels.join(', ')}`)

    console.log(JSON.stringify({ code: 'claude-workflow.030' }))
    const milestone = currentMilestone(new Date())
    try {
      await github.rest.issues.createMilestone({
        owner,
        repo,
        title: milestone.title,
        description: `Tasks and improvements for ${milestone.title}`,
        due_on: milestone.dueOn,
      })
      results.milestones.push(`✅ Created: ${milestone.title}`)
    } catch (error) {
      if (/** @type {any} */ (error).status === 422) {
        results.milestones.push(`📅 Exists: ${milestone.title}`)
      } else {
        results.milestones.push(`❌ Error: ${message(error)}`)
      }
    }

    console.log(JSON.stringify({ code: 'claude-workflow.031' }))
    try {
      const projects = await github.rest.projects.listForRepo({ owner, repo })
      if (projects.data.length > 0) {
        const project = projects.data[0]
        results.projects.push(`📊 Project detected: ${project.name}`)
        const columns = await github.rest.projects.listColumns({ project_id: project.id })
        const todoColumn = columns.data.find((/** @type {any} */ col) =>
          col.name.toLowerCase().includes('todo') || col.name.toLowerCase().includes('backlog'))
        if (todoColumn) {
          await github.rest.projects.createCard({
            column_id: todoColumn.id,
            content_id: context.payload.issue.id,
            content_type: 'Issue',
          })
          results.projects.push(`📋 Card added: ${project.name}`)
        }
      } else {
        results.projects.push(`ℹ️ Project board not found`)
      }
    } catch (error) {
      results.projects.push(`❌ Project management error: ${message(error)}`)
    }

    console.log(JSON.stringify({ code: 'claude-workflow.032' }))
    if (triggerText.includes('security') || triggerText.includes('vulnerability')) {
      try {
        const alerts = await github.rest.secretScanning.listAlertsForRepo({ owner, repo, state: 'open' })
        results.security.push(`🔍 Open security alerts: ${alerts.data.length}`)
        if (alerts.data.length > 0) {
          results.security.push(`⚠️ Security alert confirmation required`)
        }
      } catch (error) {
        results.security.push(`ℹ️ Security alert check: Access restricted or feature disabled`)
      }
    } else {
      results.security.push(`ℹ️ Security check: Skipped`)
    }

    console.log(JSON.stringify({ code: 'claude-workflow.033' }))
    if (triggerText.includes('wiki') || triggerText.includes('document')) {
      try {
        const repoInfo = await github.rest.repos.get({ owner, repo })
        results.wiki.push(repoInfo.data.has_wiki
          ? `📚 Wiki enabled: Updatable`
          : `📚 Wiki disabled: Needs to be enabled in settings`)
      } catch (error) {
        results.wiki.push(`❌ Wiki check error: ${message(error)}`)
      }
    } else {
      results.wiki.push(`ℹ️ Wiki update: Skipped`)
    }

    console.log(JSON.stringify({ code: 'claude-workflow.034' }))
    if (triggerText.includes('pages') || triggerText.includes('deploy') || triggerText.includes('site')) {
      try {
        const pages = await github.rest.repos.getPages({ owner, repo })
        results.pages.push(`🌐 Pages enabled: ${pages.data.html_url}`)
        await github.rest.repos.requestPagesBuild({ owner, repo })
        results.pages.push(`🔄 Triggered Pages rebuild`)
      } catch (error) {
        results.pages.push(/** @type {any} */ (error).status === 404
          ? `🌐 Pages disabled: Needs to be enabled in settings`
          : `❌ Pages management error: ${message(error)}`)
      }
    } else {
      results.pages.push(`ℹ️ Pages management: Skipped`)
    }

    console.log(JSON.stringify({ code: 'claude-workflow.035' }))
    try {
      if (triggerText.includes('workflow') || triggerText.includes('action') || triggerText.includes('ci') || triggerText.includes('cd')) {
        const workflows = await github.rest.actions.listRepoWorkflows({ owner, repo })
        results.actions.push(`⚙️ Number of workflows: ${workflows.data.total_count}`)
        const disabled = workflows.data.workflows.filter((/** @type {any} */ w) => w.state === 'disabled_manually')
        if (disabled.length > 0) {
          results.actions.push(`⚠️ Disabled workflows: ${disabled.length}`)
        }
      } else {
        results.actions.push(`ℹ️ Actions management: Skipped`)
      }
    } catch (error) {
      results.actions.push(`❌ Actions management error: ${message(error)}`)
    }

    console.log(JSON.stringify({ code: 'claude-workflow.036' }))
    core.exportVariable('CLAUDE_RUNNER_MANAGEMENT_RESULTS', JSON.stringify(results))
    core.exportVariable('CLAUDE_RUNNER_MANAGEMENT_SUCCESS', 'true')
  } catch (error) {
    console.error(JSON.stringify({ code: 'claude-workflow.037' }))
    core.exportVariable('CLAUDE_RUNNER_MANAGEMENT_ERROR', message(error))
    core.exportVariable('CLAUDE_RUNNER_MANAGEMENT_SUCCESS', 'false')
  }
}

module.exports = { autoLabels, currentMilestone, run }
