// Checks that the account behind a workflow_dispatch run may start Claude:
// allowed-users list, then repo write access, then active org membership.

/**
 * @param {string|undefined} input Comma-separated GitHub usernames
 * @returns {string[]}
 */
function parseAllowedUsers(input) {
  return String(input || '').split(',').map((u) => u.trim()).filter(Boolean)
}

/**
 * @param {string} permission Collaborator permission level
 * @returns {boolean}
 */
function hasWriteAccess(permission) {
  return ['write', 'maintain', 'admin'].includes(permission)
}

/**
 * github-script entry. Fails the step when the dispatcher is not allowed.
 * The actor is the account that dispatched the run (context.actor), never the
 * free-text `actor` input.
 * @param {{ github: any, context: any, core: any, allowedUsers: string }} params
 */
async function run({ github, context, core, allowedUsers: allowedUsersInput }) {
  const allowedUsers = parseAllowedUsers(allowedUsersInput)
  if (allowedUsers.length === 0) {
    console.log(JSON.stringify({ code: 'claude-workflow.001' }))
    return
  }

  const actor = context.actor
  console.log(JSON.stringify({ code: 'claude-workflow.003' }))

  if (allowedUsers.includes(actor)) {
    console.log(JSON.stringify({ code: 'claude-workflow.005' }))
    return
  }

  const denied = `User ${actor} does not have permission to run this workflow`
  try {
    const collaboration = await github.rest.repos.getCollaboratorPermissionLevel({
      owner: context.repo.owner,
      repo: context.repo.repo,
      username: actor,
    })
    console.log(JSON.stringify({ code: 'claude-workflow.007' }))
    if (!hasWriteAccess(collaboration.data.permission)) {
      core.setFailed(denied)
    }
  } catch (error) {
    console.log(JSON.stringify({ code: 'claude-workflow.008' }))
    try {
      const membership = await github.rest.orgs.getMembershipForUser({
        org: context.repo.owner,
        username: actor,
      })
      if (membership.data.state !== 'active') {
        core.setFailed(denied)
      }
    } catch (membershipError) {
      console.log(JSON.stringify({ code: 'claude-workflow.009' }))
      core.setFailed(denied)
    }
  }
}

module.exports = { parseAllowedUsers, hasWriteAccess, run }
