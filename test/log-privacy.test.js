// Tests that src/ log lines stay safe for public run logs: every log code is
// registered, and event bus failures never print the exception's value.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const codes = require('../src/log-codes.json')
const { publish } = require('../src/event-bus')

const SRC = path.join(__dirname, '../src')
const SECRET = 'SYNTHETIC-TRANSPORT-ERROR'

test('log codes used in src/ and registered in log-codes.json match', () => {
  const used = new Set()
  for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(SRC, file), 'utf8')
    for (const match of source.matchAll(/code: '(claude-workflow\.\d+)'/g)) used.add(match[1])
  }
  assert.equal([...used].sort(), codes.map((row) => row.code).sort())
  for (const row of codes) assert.ok(row.message, row.code)
})

test('event bus failure does not log the exception value', async () => {
  /** @type {string[]} */
  const output = []
  const warn = console.warn
  const fetch = globalThis.fetch
  console.warn = (...args) => output.push(args.join(' '))
  globalThis.fetch = async () => { throw new Error(SECRET) }
  try {
    assert.is(await publish({ url: 'https://fixture.invalid', apiKey: 'k', event: {} }), false)
  } finally {
    console.warn = warn
    globalThis.fetch = fetch
  }
  assert.is(output.length, 1)
  assert.not.ok(output[0].includes(SECRET))
})

test.run()
