import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Changed, Pending } from './rpc.js'

// `lineage` is the requesting session followed by its ancestors, so a parent session can review and revoke what
// its subagents requested.
type Entry = { lineage: string[]; secret: string; timer: ReturnType<typeof setTimeout> }
type Waiting = { info: Pending; lineage: string[]; finish: (secret?: string, why?: keyof typeof ended) => void }

// What the agent is told when a request ends without a credential. Only a refusal by the user is final.
const ended = {
  denied: 'The user declined this Hush credential request. Do not request it again unless they ask you to.',
  expired: 'The Hush credential request expired before the user answered. Request it again if it is still needed.',
  interrupted: 'The Hush credential request was interrupted before the user could answer. Request it again.',
}

const REDACTED = '[redacted by Hush]'
// The secret as a command might print it. Short secrets only match exactly, to avoid redacting ordinary text.
const forms = (secret: string) => {
  const bytes = Buffer.from(secret)
  const encoded = secret.length < 8 ? [] : [
    bytes.toString('base64'), bytes.toString('base64').replace(/=+$/, ''), bytes.toString('base64url'),
    bytes.toString('hex'), bytes.toString('hex').toUpperCase(), encodeURIComponent(secret), [...secret].reverse().join(''),
  ]
  return [...new Set([secret, ...encoded])].sort((a, b) => b.length - a.length)
}

// Files of Hush instances whose process ended without cleaning up (killed, crashed). Directories are named after the pid.
const sweep = () => {
  for (const name of readdirSync(tmpdir())) {
    const pid = Number(/^oc-hush-(\d+)(-|$)/.exec(name)?.[1])
    if (!pid || pid === process.pid) continue
    try { process.kill(pid, 0) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') rmSync(join(tmpdir(), name), { recursive: true, force: true })
    }
  }
}

/** `ttlMs` is how long an approved credential is kept; 0 forgets it after its first use. */
export function createHush(onChange: (change: Changed) => void = () => {}, ttlMs = 15 * 60 * 1000) {
  const waiting = new Map<string, Waiting>()
  // Approved credentials by the path of their file.
  const entries = new Map<string, Entry>()
  let directory: string | undefined
  let files = 0
  const clear = () => { if (directory) rmSync(directory, { recursive: true, force: true }) }
  try { sweep() } catch {}

  const remove = (file: string) => {
    const entry = entries.get(file)
    if (!entry) return
    clearTimeout(entry.timer)
    rmSync(file, { force: true })
    entries.delete(file)
  }
  // Short paths (…/oc-hush-<pid>/1), because agents copy them into commands. The directory is created on first use,
  // readable only by this user; if the name is taken, by another instance or anyone else, a random one is used.
  const write = (secret: string) => {
    if (!directory) {
      const preferred = join(tmpdir(), `oc-hush-${process.pid}`)
      try { mkdirSync(preferred, { mode: 0o700 }); directory = preferred } catch {
        directory = mkdtempSync(`${preferred}-`)
      }
      process.once('exit', clear)
    }
    const file = join(directory, String(++files))
    writeFileSync(file, secret, { mode: 0o600, flag: 'wx' })
    return file
  }

  return {
    request(input: Omit<Pending, 'id'>, signal: AbortSignal, lineage = [input.sessionID]) {
      signal.throwIfAborted()
      return new Promise<{ file: string }>((resolve, reject) => {
        const id = randomUUID()
        const finish = (secret?: string, why: keyof typeof ended = 'denied') => {
          if (!waiting.delete(id)) return
          clearTimeout(timer)
          signal.removeEventListener('abort', cancel)
          onChange({ sessionIDs: lineage })
          if (!secret) {
            reject(new Error(ended[why]))
            return
          }
          const file = write(secret)
          // A single-use credential still expires if it is never used.
          const expiry = setTimeout(() => remove(file), ttlMs || 5 * 60 * 1000)
          expiry.unref?.()
          entries.set(file, { lineage, secret, timer: expiry })
          resolve({ file })
        }
        const cancel = () => finish(undefined, 'interrupted')
        const timer = setTimeout(() => finish(undefined, 'expired'), 5 * 60 * 1000)
        timer.unref?.()
        const info = { label: input.label, sessionID: input.sessionID, id }
        waiting.set(id, { info, lineage, finish })
        signal.addEventListener('abort', cancel, { once: true })
        onChange({ sessionIDs: lineage, added: info })
      })
    },
    pending(sessionID: string) {
      return [...waiting.values()].filter(item => item.lineage.includes(sessionID)).map(item => item.info)
    },
    reply(id: string, secret?: string) {
      const item = waiting.get(id)
      if (!item) return { accepted: false }
      item.finish(secret)
      return { accepted: true }
    },
    /** Replaces every live credential, and its common encodings, in any string inside `value`. */
    redact<T>(value: T): T {
      const patterns = [...entries.values()].flatMap(entry => forms(entry.secret))
      if (!patterns.length) return value
      const scrub = (item: unknown): unknown => {
        if (typeof item === 'string') return patterns.reduce((text, form) => text.split(form).join(REDACTED), item)
        if (Array.isArray(item)) return item.map(scrub)
        if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
          return Object.fromEntries(Object.entries(item).map(([key, field]) => [key, scrub(field)]))
        }
        return item
      }
      return scrub(value) as T
    },
    /** Single-use credentials are forgotten once a tool call has read their file. */
    used(input: string) {
      if (ttlMs) return
      for (const file of [...entries.keys()]) if (input.includes(file)) remove(file)
    },
    forget(sessionID: string) {
      const files = [...entries].filter(([, entry]) => entry.lineage.includes(sessionID)).map(([file]) => file)
      files.forEach(remove)
      ;[...waiting.values()].filter(item => item.lineage.includes(sessionID)).forEach(item => item.finish())
      return { forgotten: files.length }
    },
    dispose() {
      ;[...waiting.values()].forEach(item => item.finish(undefined, 'interrupted'))
      ;[...entries.keys()].forEach(remove)
      clear()
      process.off('exit', clear)
    },
  }
}
