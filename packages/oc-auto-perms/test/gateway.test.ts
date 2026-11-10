import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Plugin } from '@opencode/plugin'
import { APIConnectionError, APIError, APITimeoutError } from '@typesafe-ai/sdk'
import { apiKeyFor, gatewayFailureMessage } from '../src/gateway.js'

type Connections = Plugin.Context['integration']['connection']

const connections = (key?: string) => ({
  active: async () => key ? ({}) : undefined,
  resolve: async () => key ? ({ type: 'key', key }) : undefined,
}) as unknown as Connections

test('gateway credentials reuse connected OpenCode accounts', async () => {
  assert.equal(await apiKeyFor('openrouter', connections('connected-key'), { JEV_API_KEY: 'env-key' }), 'connected-key')
  assert.equal(await apiKeyFor('vercel', connections('vercel-key'), {}), 'vercel-key')
  assert.equal(await apiKeyFor('opencode', connections('zen-key'), {}), 'zen-key')
})

test('every gateway falls back to the shared environment variable', async () => {
  assert.equal(await apiKeyFor('typesafe', connections(), { JEV_API_KEY: 'typesafe-key' }), 'typesafe-key')
  assert.equal(await apiKeyFor('openrouter', connections(), { JEV_API_KEY: 'router-key' }), 'router-key')
  await assert.rejects(apiKeyFor('opencode', connections(), {}), /OpenCode Zen credential found.*set JEV_API_KEY/)
})

test('gateway credential resolution follows account changes', async () => {
  let key = 'first-key'
  const active = {
    active: async () => ({}),
    resolve: async () => ({ type: 'key', key }),
  } as unknown as Connections
  assert.equal(await apiKeyFor('openrouter', active, {}), 'first-key')
  key = 'second-key'
  assert.equal(await apiKeyFor('openrouter', active, {}), 'second-key')
})

test('runtime failures produce actionable confirmation messages', () => {
  const apiError = (status: number) => new APIError(status, {}, new Headers())
  assert.match(gatewayFailureMessage('openrouter', apiError(401)), /credential was rejected.*user confirmation/i)
  assert.match(gatewayFailureMessage('vercel', apiError(402)), /insufficient credits.*user confirmation/i)
  assert.match(gatewayFailureMessage('opencode', apiError(429)), /rate limit.*user confirmation/i)
  assert.match(gatewayFailureMessage('typesafe', apiError(503)), /temporarily unavailable.*user confirmation/i)
  assert.match(gatewayFailureMessage('typesafe', new APITimeoutError(10_000)), /timed out.*user confirmation/i)
  assert.match(gatewayFailureMessage('typesafe', new APIConnectionError()), /could not be reached.*user confirmation/i)
})
