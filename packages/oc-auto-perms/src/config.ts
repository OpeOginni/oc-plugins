export type Settings = {
  guardedTools: 'all' | string[]
  permissions: PermissionPolicy
  minConfidence: number
  historyLimit: number
}

export type PermissionRule = {
  tools?: 'all' | string[]
  examples?: string[]
  effect: 'allow' | 'ask' | 'deny'
  when: string
}

export type PermissionPolicy = PermissionRule[]

const optionalString = (value: unknown, name: string) => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new Error(`oc-auto-perms: ${name} must be a non-empty string.`)
  return value.trim()
}

const toolSelection = (value: unknown, name: string, fallback?: 'all'): 'all' | string[] => {
  if (value === undefined && fallback) return fallback
  if (value === 'all') return 'all'
  if (!Array.isArray(value) || value.length === 0 || !value.every(item => typeof item === 'string' && item.trim())) {
    throw new Error(`oc-auto-perms: ${name} must be "all" or a non-empty array of tool names.`)
  }
  const tools = value.map(item => item.trim())
  if (tools.includes('execute')) throw new Error(`oc-auto-perms: ${name} cannot include execute; OpenCode does not expose its permission evaluation to plugins yet.`)
  return tools
}

const examplesFrom = (value: unknown, name: string): string[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || !value.every(item => typeof item === 'string' && item.trim())) {
    throw new Error(`oc-auto-perms: ${name} must be a non-empty array of strings.`)
  }
  return value.map(item => item.trim())
}

const permissionRule = (value: unknown, index: number): PermissionRule => {
  const name = `options.permissions[${index}]`
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`oc-auto-perms: ${name} must be a rule object.`)
  const rule = value as Record<string, unknown>
  const unknown = Object.keys(rule).find(key => !['tools', 'effect', 'examples', 'when'].includes(key))
  if (unknown) throw new Error(`oc-auto-perms: ${name}.${unknown} is not supported.`)
  const effect = rule.effect
  if (effect !== 'allow' && effect !== 'ask' && effect !== 'deny') throw new Error(`oc-auto-perms: ${name}.effect must be allow, ask, or deny.`)
  const tools = rule.tools === undefined ? undefined : toolSelection(rule.tools, `${name}.tools`)
  const examples = examplesFrom(rule.examples, `${name}.examples`)
  const when = optionalString(rule.when, `${name}.when`)
  if (!when) throw new Error(`oc-auto-perms: ${name}.when is required.`)
  return { ...(tools ? { tools } : {}), effect, ...(examples ? { examples } : {}), when }
}

const permissionsFrom = (value: unknown): PermissionPolicy => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('oc-auto-perms: options.permissions must be a non-empty array of rules.')
  return value.map(permissionRule)
}

export const evaluatesTool = (selection: Settings['guardedTools'], ...candidates: Array<string | undefined>) =>
  selection === 'all' || candidates.some(candidate => candidate !== undefined && selection.includes(candidate))

export const settingsFrom = (options: Record<string, unknown>): Settings => {
  if (options.tools !== undefined) throw new Error('oc-auto-perms: use options.guardedTools for the plugin-level tool selection.')
  if (options.model !== undefined) throw new Error('oc-auto-perms: model is not configurable; Jev uses jev-latest.')
  const guardedTools = toolSelection(options.guardedTools, 'options.guardedTools', 'all')
  const permissions = permissionsFrom(options.permissions)

  const minConfidence = options.minConfidence ?? 0.8
  if (typeof minConfidence !== 'number' || !Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error('oc-auto-perms: options.minConfidence must be between 0 and 1.')
  }

  const historyLimit = options.historyLimit ?? 3
  if (!Number.isInteger(historyLimit) || typeof historyLimit !== 'number' || historyLimit < 1 || historyLimit > 50) {
    throw new Error('oc-auto-perms: options.historyLimit must be an integer between 1 and 50.')
  }

  return { guardedTools, permissions, minConfidence, historyLimit }
}
