// Tests for what a run reports back: status comments, the auto-PR body, event
// bus payloads and repository-management label/milestone choices.
const { test } = require('uvu')
const assert = require('uvu/assert')
const { successComment, failureComment, STATUS_MARKER } = require('../src/comments')
const { pullRequestBody, jobEvent } = require('../src/auto-pr')
const { dispatchResultEvent } = require('../src/publish-dispatch')
const { autoLabels, currentMilestone } = require('../src/repo-management')

const base = {
  owner: 'o',
  repo: 'r',
  runId: '42',
  serverUrl: 'https://github.com',
  eventName: 'issue_comment',
  actor: 'david',
  issueNumber: '5',
  isPR: false,
}

test('successComment with auto PR', () => {
  const body = successComment({
    ...base,
    framework: 'React',
    totalFiles: '12',
    hasChanges: true,
    autoPrNumber: '8',
    autoPrUrl: 'https://github.com/o/r/pull/8',
    autoPrBranch: 'claude/issue-5',
  })
  assert.ok(body.startsWith('💬 **Claude Code execution complete** ✅'))
  assert.ok(body.includes('- PR: [#8](https://github.com/o/r/pull/8)'))
  assert.ok(body.includes('- Branch: `claude/issue-5`'))
  assert.ok(body.includes('**📊 Execution Info:** Issue #5 | React (12 files) | @david'))
  assert.ok(body.includes('**📝 PR Changes:** [https://github.com/o/r/pull/8/files](https://github.com/o/r/pull/8/files)'))
  assert.ok(body.endsWith(STATUS_MARKER))
})

test('successComment analysis-only and PR branch line', () => {
  const issue = successComment({ ...base, hasChanges: false })
  assert.ok(issue.includes('ℹ️ **Analysis only** (no code changes)'))
  assert.ok(issue.includes('Unknown (0 files)'))
  const pr = successComment({ ...base, isPR: true, eventName: 'pull_request_review', headRef: 'feat', baseRef: 'main' })
  assert.ok(pr.startsWith('👀'))
  assert.ok(pr.includes('**🌿 Branch:** `feat` → `main`'))
  assert.not.ok(pr.includes('Analysis only'))
})

test('successComment lists created/warning management results only', () => {
  const managementResults = JSON.stringify({ labels: ['✅ Created: a', '📋 Exists: b', '✅ Created: c', '✅ Created: d'], pages: ['ℹ️ skipped'], security: ['⚠️ alert'] })
  const body = successComment({ ...base, managementSuccess: true, managementResults })
  assert.ok(body.includes('**🚀 Automated management executed:**\n- ✅ Created: a\n- ✅ Created: c\n- ⚠️ alert\n'))
  assert.not.ok(successComment({ ...base, managementSuccess: true, managementResults: '{bad' }).includes('Automated management'))
})

test('failureComment mentions WIP branch and management error', () => {
  const body = failureComment({ ...base, wipBranch: 'claude/wip-42', wipSha: '0123456789abcdef', managementError: 'boom' })
  assert.ok(body.startsWith('❌ **Claude Code execution failed**'))
  assert.ok(body.includes('An error occurred while processing Issue #5.'))
  assert.ok(body.includes('[Actions run log](https://github.com/o/r/actions/runs/42)'))
  assert.ok(body.includes('`claude/wip-42` @ 01234567'))
  assert.ok(body.includes('⚠️ **Repository Management Error:** `boom`'))
  assert.ok(body.endsWith(STATUS_MARKER))
  assert.not.ok(failureComment(base).includes('Unfinished work'))
})

test('pullRequestBody links issue, actor and run', () => {
  const body = pullRequestBody({ ...base, claudeCommentBody: 'summary' })
  assert.ok(body.includes('**Related Issue:** #5'))
  assert.ok(body.includes('**Executed by:** @david'))
  assert.ok(body.includes('summary'))
  assert.ok(body.includes('*resolves #5*'))
  assert.ok(body.includes('[Claude Code Action - Run #42](https://github.com/o/r/actions/runs/42)'))
  assert.not.ok(body.includes('@claude'))
})

test('jobEvent shapes claude.job.* events', () => {
  const ev = jobEvent({ ...base, status: 'failed', branch: 'b', commit: 'sha', pr: null, results: { framework: 'Go' }, error: 'x', now: 1000 })
  assert.is(ev.type, 'claude.job.failed')
  assert.is(ev.detail.jobId, 'claude-o-r-5-1000')
  assert.is(ev.detail.url, 'https://github.com/o/r/issues/5')
  assert.equal(ev.detail.results, { prCreated: false, prNumber: null, prUrl: null, issueNumber: 5, actor: 'david', event: 'issue_comment', framework: 'Go', error: 'x' })
  const ok = jobEvent({ ...base, status: 'completed', branch: 'b', commit: 'sha', pr: { number: 9, html_url: 'u' }, results: {}, now: 1 })
  assert.equal([ok.detail.results.prCreated, ok.detail.results.prNumber, ok.detail.results.prUrl], [true, 9, 'u'])
  assert.not.ok('error' in ok.detail.results)
})

test('dispatchResultEvent maps outcome to completed/failed', () => {
  const ev = dispatchResultEvent({ outcome: 'success', repository: 'o/r', branch: 'claude/dispatch-1', runUrl: 'run', prUrl: '', email: 'a@b.c', inReplyTo: '<m>', subject: 's' })
  assert.equal(ev, {
    type: 'claude.job.completed',
    detail: {
      status: 'completed',
      repository: 'o/r',
      event: 'workflow_dispatch',
      branch: 'claude/dispatch-1',
      results: { runUrl: 'run', prUrl: '', prCreated: false, claudeOutcome: 'success' },
      notify: { email: 'a@b.c', inReplyTo: '<m>', subject: 's' },
    },
  })
  assert.is(dispatchResultEvent({ outcome: 'failure', prUrl: 'p' }).type, 'claude.job.failed')
  assert.is(dispatchResultEvent({ outcome: 'failure', prUrl: 'p' }).detail.results.prCreated, true)
})

test('autoLabels from trigger keywords', () => {
  assert.equal(autoLabels('fix the thing'), ['claude-code', 'auto-generated'])
  assert.equal(autoLabels('security performance technical debt document deploy'), ['claude-code', 'auto-generated', 'security-fix', 'performance', 'technical-debt', 'documentation', 'ci-cd'])
})

test('currentMilestone is YYYY-Mon due at month end', () => {
  const m = currentMilestone(new Date(2026, 9, 29))
  assert.is(m.title, '2026-Oct')
  assert.is(m.dueOn, new Date(2026, 10, 0).toISOString())
})

test.run()
