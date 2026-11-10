import { expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { createHush } from '../src/hush.js'

const input = { sessionID: 's', label: 'GitHub token' }

test('an approved credential is written to a private file and never returned', async () => {
  const hush = createHush()
  const secret = 'ghp_testOnlySecretValue123'
  try {
    const requested = hush.request(input, new AbortController().signal)
    expect(hush.pending('s')).toEqual([{ label: 'GitHub token', sessionID: 's', id: expect.any(String) }])
    expect(hush.pending('other')).toEqual([])
    const [item] = hush.pending('s')
    expect(hush.reply(item.id, secret)).toEqual({ accepted: true })
    const result = await requested
    expect(Object.keys(result)).toEqual(['file'])
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(readFileSync(result.file, 'utf8')).toBe(secret)
    expect(statSync(result.file).mode & 0o777).toBe(0o600)
    expect(statSync(dirname(result.file)).mode & 0o777).toBe(0o700)
    expect(hush.pending('s')).toEqual([])
    expect(hush.reply(item.id, 'replacement')).toEqual({ accepted: false })
  } finally { hush.dispose() }
})

test('tool output is redacted while the credential lives', async () => {
  const hush = createHush()
  const secret = 'ghp_testOnlySecretValue123'
  try {
    const requested = hush.request(input, new AbortController().signal)
    hush.reply(hush.pending('s')[0].id, secret)
    const { file } = await requested
    const printed = {
      content: [{ type: 'text', text: `token=${secret} b64=${Buffer.from(secret).toString('base64')} hex=${Buffer.from(secret).toString('hex')} rev=${[...secret].reverse().join('')}` }],
      metadata: { output: `export GH_TOKEN=${secret}` },
    }
    const clean = JSON.stringify(hush.redact(printed))
    expect(clean).not.toContain(secret)
    expect(clean).not.toContain(Buffer.from(secret).toString('base64'))
    expect(clean).not.toContain(Buffer.from(secret).toString('hex'))
    expect(clean).toContain('token=[redacted by Hush]')
    expect(hush.redact('nothing to hide')).toBe('nothing to hide')

    expect(hush.forget('s')).toEqual({ forgotten: 1 })
    expect(existsSync(file)).toBe(false)
    expect(hush.redact(printed)).toEqual(printed)
  } finally { hush.dispose() }
})

test('subagent requests surface in ancestor sessions, which can revoke them', async () => {
  const changes: unknown[] = []
  const hush = createHush(change => changes.push(change))
  try {
    const requested = hush.request({ sessionID: 'child', label: 'Token' }, new AbortController().signal, ['child', 'parent', 'root'])
    const [item] = hush.pending('root')
    expect(hush.pending('parent')).toEqual([item])
    expect(hush.pending('sibling')).toEqual([])
    expect(changes).toEqual([{ sessionIDs: ['child', 'parent', 'root'], added: item }])

    hush.reply(item.id, 'test-only-secret')
    const { file } = await requested
    expect(changes.at(-1)).toEqual({ sessionIDs: ['child', 'parent', 'root'] })
    expect(JSON.stringify(changes)).not.toContain('test-only-secret')
    expect(hush.forget('sibling')).toEqual({ forgotten: 0 })
    expect(hush.forget('root')).toEqual({ forgotten: 1 })
    expect(existsSync(file)).toBe(false)
  } finally { hush.dispose() }
})

test('the agent is told to ask again unless the user declined', async () => {
  const controller = new AbortController()
  const hush = createHush()
  const denied = hush.request(input, controller.signal)
  hush.reply(hush.pending('s')[0].id)
  await expect(denied).rejects.toThrow('declined')
  const cancelled = hush.request(input, controller.signal)
  controller.abort()
  await expect(cancelled).rejects.toThrow('interrupted')
  const reloaded = hush.request(input, new AbortController().signal)
  hush.dispose()
  await expect(reloaded).rejects.toThrow('Request it again')
})

test('credentials expire after the configured time', async () => {
  const hush = createHush(() => {}, 30)
  try {
    const requested = hush.request(input, new AbortController().signal)
    hush.reply(hush.pending('s')[0].id, 'test-only-secret')
    const { file } = await requested
    expect(existsSync(file)).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(existsSync(file)).toBe(false)
    expect(hush.redact('test-only-secret')).toBe('test-only-secret')
  } finally { hush.dispose() }
})

test('single-use credentials are deleted after the first tool call that reads them', async () => {
  const hush = createHush(() => {}, 0)
  const requested = hush.request(input, new AbortController().signal)
  hush.reply(hush.pending('s')[0].id, 'test-only-secret')
  const { file } = await requested
  hush.used(JSON.stringify({ command: 'ls' }))
  expect(existsSync(file)).toBe(true)
  hush.used(JSON.stringify({ command: `TOKEN="$(cat '${file}')" gh auth status` }))
  expect(existsSync(file)).toBe(false)
  hush.dispose()
  expect(existsSync(dirname(file))).toBe(false)
})
