import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluatesTool, settingsFrom } from '../src/config.js'

test('settings use conservative defaults', () => {
  assert.deepEqual(settingsFrom({ permissions: [{ effect: 'deny', when: 'Only access google.com.' }] }), {
    guardedTools: 'all',
    permissions: [{ effect: 'deny', when: 'Only access google.com.' }],
    minConfidence: 0.8,
    historyLimit: 8,
  })
})

test('permissions are required and bounds are validated', () => {
  const permissions = [{ effect: 'ask', when: 'The action needs confirmation.' }]
  assert.throws(() => settingsFrom({}), /permissions must be/)
  assert.throws(() => settingsFrom({ permissions, minConfidence: 2 }), /between 0 and 1/)
  assert.throws(() => settingsFrom({ permissions, historyLimit: 0 }), /between 1 and 50/)
  assert.throws(() => settingsFrom({ permissions, guardedTools: [] }), /non-empty array/)
  assert.throws(() => settingsFrom({ permissions, tools: ['shell'] }), /guardedTools/)
  assert.throws(() => settingsFrom({ permissions, model: 'something' }), /not configurable/)
  assert.throws(() => settingsFrom({ permissions, guardedTools: ['execute'] }), /cannot include execute/)
  assert.throws(() => settingsFrom({ permissions: [{ tools: ['execute'], effect: 'deny', when: 'Network access.' }] }), /cannot include execute/)
  assert.throws(() => settingsFrom({ permissions: [{ effect: 'ask' }] }), /when is required/)
  assert.throws(() => settingsFrom({ permissions: [{ effect: 'ask', when: 'Needed.', examples: 'example' }] }), /array of strings/)
  assert.throws(() => settingsFrom({ permissions: [{ effect: 'ask', when: 'Needed.', tool: ['shell'] }] }), /not supported/)
})

test('permissions accept examples and natural-language-only rules', () => {
  assert.deepEqual(settingsFrom({ permissions: [
    { tools: ['shell'], effect: 'allow', examples: ['curl https://google.com', '!curl https://example.com'], when: 'The destination is google.com.' },
    { effect: 'deny', when: 'Never transmit secrets.' },
  ] }).permissions, [
    { tools: ['shell'], effect: 'allow', examples: ['curl https://google.com', '!curl https://example.com'], when: 'The destination is google.com.' },
    { effect: 'deny', when: 'Never transmit secrets.' },
  ])
})

test('tool selection limits which calls are evaluated', () => {
  assert.equal(evaluatesTool('all', 'webfetch'), true)
  assert.equal(evaluatesTool(['shell', 'webfetch'], 'shell'), true)
  assert.equal(evaluatesTool(['shell', 'webfetch'], 'websearch'), false)
})
