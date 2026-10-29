// Tests for event context extraction: issue/PR numbers, refs, trigger text,
// linked-PR detection and the dispatch permission helpers.
const { test } = require('uvu')
const assert = require('uvu/assert')
const { ensureMention, contextFromPayload, linkedPullRequests, shouldContinue } = require('../src/context')
const { parseAllowedUsers, hasWriteAccess } = require('../src/permissions')
const { selectModel } = require('../src/model')

const prPayload = {
  pull_request: { number: 7, head: { ref: 'feat', sha: 'abc' }, base: { ref: 'main' }, body: 'pr body' },
}

test('ensureMention prefixes @claude only when missing', () => {
  assert.is(ensureMention('fix it'), '@claude fix it')
  assert.is(ensureMention('@claude fix it'), '@claude fix it')
})

test('workflow_dispatch uses trigger_text with mention', () => {
  const ctx = contextFromPayload('workflow_dispatch', { inputs: { trigger_text: 'do x' } })
  assert.equal(ctx, { issueNumber: '', prNumber: '', headRef: '', baseRef: '', headSha: '', isPR: false, triggerText: '@claude do x' })
})

test('pull_request_target reads PR fields and body', () => {
  const ctx = contextFromPayload('pull_request_target', prPayload)
  assert.equal(ctx, { issueNumber: '7', prNumber: '7', headRef: 'feat', baseRef: 'main', headSha: 'abc', isPR: true, triggerText: 'pr body' })
})

test('issues joins title and body', () => {
  const ctx = contextFromPayload('issues', { issue: { number: 3, title: 'T', body: 'B' } })
  assert.is(ctx.triggerText, 'T B')
  assert.is(ctx.issueNumber, '3')
  assert.is(ctx.isPR, false)
})

test('review events read comment or review body', () => {
  assert.is(contextFromPayload('pull_request_review_comment', { ...prPayload, comment: { body: 'c' } }).triggerText, 'c')
  assert.is(contextFromPayload('pull_request_review', { ...prPayload, review: { body: 'r' } }).triggerText, 'r')
  assert.is(contextFromPayload('pull_request_review', { ...prPayload, review: { body: 'r' } }).isPR, true)
})

test('issue_comment base context is the issue and comment', () => {
  const ctx = contextFromPayload('issue_comment', { issue: { number: 9 }, comment: { body: '@claude hi' } })
  assert.is(ctx.issueNumber, '9')
  assert.is(ctx.triggerText, '@claude hi')
  assert.is(ctx.isPR, false)
})

test('linkedPullRequests keeps cross-referenced PRs only', () => {
  const timeline = [
    { event: 'labeled' },
    { event: 'cross-referenced', source: { issue: { number: 2, title: 'issue' } } },
    { event: 'cross-referenced', actor: { login: 'a' }, source: { issue: { number: 4, title: 'pr', body: 'b', pull_request: { url: 'u' } } } },
  ]
  assert.equal(linkedPullRequests(timeline), [{ issueNumber: 4, actor: 'a', url: 'u', title: 'pr', body: 'b' }])
})

test('shouldContinue stops only issues that already have a linked PR', () => {
  assert.is(shouldContinue({ isPR: false, hasLinkedPR: true }), false)
  assert.is(shouldContinue({ isPR: false, hasLinkedPR: false }), true)
  assert.is(shouldContinue({ isPR: true, hasLinkedPR: true }), true)
})

test('parseAllowedUsers splits and trims', () => {
  assert.equal(parseAllowedUsers(' a, b ,,c '), ['a', 'b', 'c'])
  assert.equal(parseAllowedUsers(''), [])
  assert.equal(parseAllowedUsers(undefined), [])
})

test('hasWriteAccess for write/maintain/admin', () => {
  assert.is(hasWriteAccess('write'), true)
  assert.is(hasWriteAccess('maintain'), true)
  assert.is(hasWriteAccess('admin'), true)
  assert.is(hasWriteAccess('read'), false)
  assert.is(hasWriteAccess('triage'), false)
})

test('selectModel picks keyword model, default opus', () => {
  assert.is(selectModel('@claude fable please'), 'claude-fable-5')
  assert.is(selectModel('@claude use OPUS'), 'opus')
  assert.is(selectModel('@claude haiku'), 'haiku')
  assert.is(selectModel('@claude sonnet'), 'sonnet')
  assert.is(selectModel('@claude fix'), 'opus')
  assert.is(selectModel('@claude fabled'), 'opus')
  assert.is(selectModel('fable and haiku'), 'claude-fable-5')
})

test.run()
