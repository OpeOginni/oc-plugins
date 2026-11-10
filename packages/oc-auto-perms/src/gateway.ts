import { Plugin } from '@opencode/plugin'
import { APIConnectionError, APIError, APITimeoutError, TypeSafeClient } from '@typesafe-ai/sdk'
import type { Gateway, Settings } from './config.js'

type Connections = Plugin.Context['integration']['connection']

const gateways: Record<Gateway, {
  name: string
  baseURL: string
  integrationID?: string
}> = {
  typesafe: {
    name: 'TypeSafe',
    baseURL: 'https://api.typesafe.ai',
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api',
    integrationID: 'openrouter',
  },
  vercel: {
    name: 'Vercel AI Gateway',
    baseURL: 'https://ai-gateway.vercel.sh/typesafe',
    integrationID: 'vercel',
  },
  opencode: {
    name: 'OpenCode Zen',
    baseURL: 'https://opencode.ai/zen',
    integrationID: 'opencode',
  },
}

const connectedKey = async (connections: Connections, integrationID: string) => {
  const connection = await connections.active(integrationID)
  if (!connection) return
  const credential = await connections.resolve(connection)
  if (credential?.type === 'key') return credential.key.trim() || undefined
  if (credential?.type === 'oauth') return credential.access.trim() || undefined
}

export const apiKeyFor = async (
  gateway: Gateway,
  connections: Connections,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const definition = gateways[gateway]
  if (definition.integrationID) {
    const key = await connectedKey(connections, definition.integrationID)
    if (key) return key
  }

  const key = env.JEV_API_KEY?.trim()
  if (key) return key
  const connectionHint = definition.integrationID ? `connect ${definition.name} in OpenCode or ` : ''
  throw new Error(`oc-auto-perms: no ${definition.name} credential found; ${connectionHint}set JEV_API_KEY.`)
}

const unexpectedError = (error: unknown) => {
  if (!(error instanceof Error) || !error.message.trim()) return 'an unexpected client error occurred'
  const safe = error.message
    .replace(/(bearer\s+)[^\s"']+/gi, '$1[redacted]')
    .replace(/\b(sk-[a-z0-9_-]{8})[a-z0-9_-]+/gi, '$1…')
    .slice(0, 200)
  return `an unexpected client error occurred: ${safe}`
}

export const gatewayFailureMessage = (gateway: Gateway, error: unknown) => {
  const name = gateways[gateway].name
  let reason: string
  if (error instanceof APITimeoutError) reason = 'the request timed out'
  else if (error instanceof APIError) {
    if (error.status === 401 || error.status === 403) reason = 'the credential was rejected; reconnect the gateway or update JEV_API_KEY'
    else if (error.status === 402) reason = 'the gateway account has insufficient credits'
    else if (error.status === 404) reason = 'the configured Jev model is not available'
    else if (error.status === 429) reason = 'the gateway rate limit was reached'
    else if (error.status === 400 || error.status === 422) reason = 'the gateway rejected the evaluation request or model configuration'
    else if (error.status >= 500) reason = 'the gateway or its Jev provider is temporarily unavailable'
    else reason = `the gateway returned HTTP ${error.status}`
  } else if (error instanceof APIConnectionError) reason = 'the gateway could not be reached'
  else reason = unexpectedError(error)
  return `Jev evaluation through ${name} failed because ${reason}; user confirmation is required.`
}

export const jevClient = async (settings: Settings, connections: Connections) => new TypeSafeClient({
  apiKey: await apiKeyFor(settings.gateway, connections),
  baseURL: gateways[settings.gateway].baseURL,
  defaultModel: settings.model,
})
