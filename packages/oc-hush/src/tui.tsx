import { Plugin } from '@opencode/plugin/tui'
import type { InputRenderable } from '@opentui/core'
import { createEffect, createSignal, on, Show } from 'solid-js'
import { Hush, type Pending } from './rpc.js'

// OpenCode's prompt bar: only the left side is drawn, as a heavy vertical line.
const bar = { topLeft: '┃', topRight: ' ', bottomLeft: '┃', bottomRight: ' ', horizontal: ' ', vertical: '┃', topT: ' ', bottomT: ' ', leftT: ' ', rightT: ' ', cross: ' ' }

export default Plugin.define({
  id: 'oc-hush.tui',
  setup(ctx) {
    const controller = new AbortController()
    const options = () => ({ location: ctx.location ?? ctx.data.location.default(), signal: controller.signal })
    const session = () => {
      const route = ctx.ui.router.current()
      return route.type === 'session' ? route.sessionID : undefined
    }
    const report = () => ctx.ui.toast.show({ title: 'oc-hush', message: 'Could not reach Hush. Check that its server plugin is loaded.', variant: 'error' })
    // The request whose dialog is open, and a way to close it when the plugin goes away.
    let open: { id: string; close: () => void } | undefined

    const reply = async (id: string, secret?: string) => {
      try {
        const result = await ctx.client.rpc(Hush).reply({ id, secret }, options())
        if (!result.accepted) ctx.ui.toast.show({ title: 'oc-hush', message: 'This credential request has expired.', variant: 'warning' })
      } catch { if (!controller.signal.aborted) report() }
    }

    // Asks as soon as the agent does. Typing goes to a focused input whose text is invisible; the dialog draws a mask
    // from its length. Nothing reaches the prompt or its history. Enter approves; closing the dialog denies.
    const ask = (item: Pending) => {
      let answered = false
      // `send: false` only closes the dialog: the request keeps waiting and is asked again.
      const answer = (secret?: string, send = true) => {
        if (answered) return
        answered = true
        open = undefined
        if (send) void reply(item.id, secret).then(refresh)
      }
      const Dialog = () => {
        const [value, setValue] = createSignal('')
        const length = () => value().length
        // Tab shows what was typed until it is pressed again. Each dialog starts hidden.
        const [shown, setShown] = createSignal(false)
        const [error, setError] = createSignal('')
        let field: InputRenderable | undefined
        // Credentials are header values: printable ASCII without spaces.
        const invalid = (value: string) => !/^[\x21-\x7e]*$/.test(value) || value.length > 8192
        const input = (text: string) => {
          setValue(text)
          setError(invalid(text.trim()) ? 'Credentials cannot contain spaces or line breaks.' : '')
        }
        const submit = () => {
          const secret = (field?.value ?? '').trim()
          if (!secret || invalid(secret)) return
          answer(secret)
          ctx.ui.dialog.clear()
        }
        // Laid out like OpenCode's own dialogs: bold title with `esc` opposite, muted detail, field, key hints.
        const Space = () => <box height={1} flexShrink={0} />
        return <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <text fg={ctx.theme.text.base}><b>Temporary Credential</b></text>
            <text fg={ctx.theme.text.muted}>esc</text>
          </box>
          <Space />
          <text fg={ctx.theme.text.muted} flexShrink={0}>{item.label}</text>
          <Space />
          {/* A field like OpenCode's own prompt: raised background behind a heavy bar, red while the value is invalid. */}
          <box
            flexDirection="row"
            flexShrink={0}
            border={['left']}
            customBorderChars={bar}
            borderColor={error() ? ctx.theme.text.feedback.error.base : ctx.theme.background.action.primary.focused}
            backgroundColor={ctx.theme.background.raised.high}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            paddingBottom={1}
            overflow="hidden"
          >
            {/* One line of dots, or the text while shown, that fills the field and is clipped at its edge. While typing,
                the input is one cell wide, so its cursor sits right after them; empty, it spans the row to show the
                placeholder. */}
            <Show when={length()}><text fg={ctx.theme.text.base} flexShrink={1} minWidth={0} wrapMode="none">{shown() ? value() : '•'.repeat(Math.min(length(), 200))}</text></Show>
            <input
              ref={element => { field = element }}
              focused
              flexGrow={length() ? 0 : 1}
              width={length() ? 1 : undefined}
              flexShrink={0}
              placeholder="Paste or type credential"
              placeholderColor={ctx.theme.text.muted}
              textColor="transparent"
              focusedTextColor="transparent"
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              onInput={input}
              onSubmit={submit}
              onKeyDown={key => {
                if (key.name !== 'tab') return
                key.preventDefault()
                setShown(!shown())
              }}
            />
          </box>
          <Show when={error()}><text fg={ctx.theme.text.feedback.error.base} flexShrink={0}>{error()}</text></Show>
          <Space />
          <box flexDirection="row" gap={3} flexShrink={0}>
            <text fg={ctx.theme.text.muted}><span style={{ fg: ctx.theme.text.base }}>enter</span> approve</text>
            <text fg={ctx.theme.text.muted}><span style={{ fg: ctx.theme.text.base }}>esc</span> deny</text>
            <text fg={ctx.theme.text.muted}><span style={{ fg: ctx.theme.text.base }}>tab</span> {shown() ? 'hide' : 'show'}</text>
          </box>
        </box>
      }
      open = { id: item.id, close: () => { answer(undefined, false); ctx.ui.dialog.clear() } }
      ctx.ui.dialog.show(Dialog, () => answer())
    }

    const refresh = async () => {
      const sessionID = session()
      if (!sessionID) return
      try {
        const items = await ctx.client.rpc(Hush).pending({ sessionID }, options())
        if (session() !== sessionID || controller.signal.aborted) return
        // The request on screen expired, was interrupted, or was answered elsewhere: its dialog can no longer answer it.
        if (open && !items.some(item => item.id === open?.id)) open.close()
        if (!open && items.length) ask(items[0])
      } catch { if (!controller.signal.aborted) report() }
    }

    ctx.keymap.layer(() => ({
      mode: 'global',
      commands: [
        { id: 'oc-hush.forget', title: 'Forget Hush credentials for this session', group: 'oc-hush', palette: true, slash: { name: 'hush-forget' }, run: async () => {
          const sessionID = session()
          if (!sessionID) return
          try {
            await ctx.client.rpc(Hush).forget({ sessionID }, options())
            ctx.ui.toast.show({ title: 'oc-hush', message: 'Session credentials forgotten.', variant: 'success' })
          } catch { report() }
        } },
      ],
    }))

    let stopEvents = () => {}
    const subscribe = () => {
      stopEvents()
      stopEvents = ctx.client.rpc(Hush).events.on('changed', event => {
        if (event.location.directory !== options().location.directory) return
        const current = session()
        const here = !!current && event.data.sessionIDs.includes(current)
        if (here) void refresh()
        const added = event.data.added
        if (!added) return
        const message = added.label
        // On screen, the dialog is the alert. Elsewhere, the toast offers to open the top-level session.
        if (!here) {
          const root = event.data.sessionIDs[event.data.sessionIDs.length - 1]
          ctx.ui.toast.show({ title: 'Hush needs a credential', message, variant: 'warning', duration: 10_000, sessionID: root })
        }
        void ctx.attention.notify({ title: 'Hush needs a credential', message, notification: { when: 'blurred' }, sound: { name: 'question', when: 'blurred' } })
      }, { signal: controller.signal })
      void refresh()
    }
    const stopReconnect = ctx.data.on('server.connected', subscribe)
    subscribe()
    createEffect(on(session, () => void refresh(), { defer: true }))
    return () => {
      controller.abort()
      stopEvents()
      stopReconnect()
      open?.close()
    }
  },
})
