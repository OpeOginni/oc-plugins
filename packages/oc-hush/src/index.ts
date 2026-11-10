import { Plugin } from '@opencode/plugin'
import { z } from 'zod'
import { createHush } from './hush.js'
import { Hush, request } from './rpc.js'

export default Plugin.define({
  id: 'oc-hush',
  async setup(ctx) {
    const minutes = ctx.options.ttlMinutes ?? 15
    if (typeof minutes !== 'number' || !(minutes >= 0 && minutes <= 1440)) throw new Error('oc-hush: ttlMinutes must be a number from 0 to 1440.')
    const lifetime = minutes ? `valid for ${minutes} minute${minutes === 1 ? '' : 's'}` : 'valid for one use'
    let registration: Awaited<ReturnType<typeof ctx.rpc.register<typeof Hush>>> | undefined
    const hush = createHush(change => void registration?.events.emit('changed', change).catch(() => {}), minutes * 60_000)
    // The session and its ancestors, so requests made by subagents surface in the session the user is looking at.
    const lineage = async (sessionID: string) => {
      const ids = [sessionID]
      while (ids.length < 16) {
        const parent = await ctx.session.get({ sessionID: ids[ids.length - 1] }).then(info => info.parentID, () => undefined)
        if (!parent || ids.includes(parent)) break
        ids.push(parent)
      }
      return ids
    }
    registration = await ctx.rpc.register(Hush, {
      pending: async input => hush.pending(input.sessionID),
      reply: async input => hush.reply(input.id, input.secret),
      forget: async input => hush.forget(input.sessionID),
    })
    // Every tool result passes through here before the model sees it, so a command that prints a credential, or an
    // encoding of it, shows the model a placeholder instead.
    await ctx.tool.hook('execute.after', call => {
      if (call.status === 'completed') call.result = hush.redact(call.result)
      if (call.status === 'error') {
        const error = call.error
        const message = hush.redact(error.message)
        // Tool errors are schema classes; rebuild one with the redacted message.
        if (message !== error.message) call.error = new (error.constructor as new (fields: { message: string }) => typeof error)({ message })
      }
      hush.used(JSON.stringify(call.input ?? ''))
    })
    await ctx.tool.transform(editor => {
      editor.namespace({ name: 'hush', description: 'Request credentials privately for shell commands. Never ask for credentials in chat.' })
      editor.add({
        name: 'request_secret',
        options: { namespace: 'hush' },
        description: [
          'Ask the user for a credential through a private prompt OpenCode shows them; wait for the result, and do not tell them to run a command. Never ask the user to paste a credential into chat.',
          `Returns { file }: a private file holding the credential. Read it inside the command that needs it, e.g. GH_TOKEN="$(cat '<file>')" gh repo list, or curl -H "Authorization: Bearer $(cat '<file>')" <url>. Never print, copy, or move the file; command output is redacted anyway.`,
          `The credential is ${lifetime}; request it again after that. Available in Code Mode and as a normal tool.`,
        ].join(' '),
        input: request,
        output: z.object({ file: z.string() }),
        execute: async (input, context) => {
          const output = await hush.request({ ...input, sessionID: context.sessionID }, context.signal, await lineage(context.sessionID))
          return { output, content: JSON.stringify(output) }
        },
      })
    })
    return () => hush.dispose()
  },
})
