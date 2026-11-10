import { Rpc } from '@opencode/plugin/rpc'
import { z } from 'zod'

export const request = z.object({
  label: z.string().min(1).max(80).describe('A short name for the credential, such as "GitHub token" or "Stripe API key". The user sees it when asked.'),
}).strict()

export const pending = request.extend({ id: z.string(), sessionID: z.string() })
export type Pending = z.infer<typeof pending>

const session = z.object({ sessionID: z.string().min(1) }).strict()

// Metadata only: never add the credential or a reference to an event, since every client of the server receives it.
export const changed = z.object({
  /** The requesting session and its ancestors, so a parent session sees its subagents' requests. */
  sessionIDs: z.array(z.string()),
  /** Set when this change added a request. */
  added: pending.optional(),
})
export type Changed = z.infer<typeof changed>

export const Hush = Rpc.define({
  id: 'oc-hush',
  events: { changed: { schema: changed } },
  methods: {
    pending: { input: session, output: z.array(pending) },
    reply: {
      input: z.object({
        id: z.string(),
        secret: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/).optional(),
      }).strict(),
      output: z.object({ accepted: z.boolean() }),
    },
    forget: { input: session, output: z.object({ forgotten: z.number() }) },
  },
})
