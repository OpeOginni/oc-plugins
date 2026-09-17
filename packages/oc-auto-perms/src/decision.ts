export type Effect = 'allow' | 'ask' | 'deny'

export const effectFrom = (choice: Effect, confidence: number, minConfidence: number, existing: Effect = 'allow'): Effect =>
  existing === 'ask' ? 'ask' : confidence < minConfidence ? 'ask' : choice

export const decisionMessage = (choice: Effect, confidence: number, effect: Effect, existing: Effect = 'allow') => {
  const certainty = `${Math.round(confidence * 100)}% confidence`
  if (existing === 'ask') return undefined
  if (effect === 'ask' && choice !== 'ask') return `Jev was uncertain (${certainty}); user confirmation is required.`
  if (effect === 'ask') return `Jev recommends user confirmation (${certainty}).`
  if (effect === 'deny') return `Denied by Jev: this action conflicts with an oc-auto-perms rule (${certainty}).`
  return undefined
}
