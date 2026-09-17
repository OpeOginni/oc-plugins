import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decisionMessage, effectFrom } from '../src/decision.js'

test('confident decisions are applied', () => {
  assert.equal(effectFrom('allow', 0.8, 0.8), 'allow')
  assert.equal(effectFrom('deny', 0.95, 0.8), 'deny')
  assert.equal(effectFrom('ask', 0.99, 0.8), 'ask')
  assert.equal(effectFrom('allow', 0.99, 0.8, 'ask'), 'ask')
})

test('uncertain decisions require confirmation', () => {
  assert.equal(effectFrom('allow', 0.79, 0.8), 'ask')
  assert.equal(effectFrom('deny', 0.2, 0.8), 'ask')
  assert.match(decisionMessage('deny', 0.2, 'ask') ?? '', /uncertain/i)
})

test('denials identify Jev as the decision source', () => {
  assert.match(decisionMessage('deny', 0.95, 'deny') ?? '', /^Denied by Jev:/)
})
