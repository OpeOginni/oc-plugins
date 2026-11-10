import { Command, ComposerPill, Plugin, createKeyed, type ServerRef, type SessionRef } from '@opencode/plugin/gui'
import { createMemo, createSignal, mapArray, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { Hush, type Changed, type Pending } from './rpc.js'

/** Where a request lives: the server and the project directory its Hush instance runs in. */
type Target = { readonly server: ServerRef; readonly directory: string }

export default Plugin.define({
  setup(ctx) {
    // Pending request metadata by `SessionRef.key`. Credentials never enter this store.
    const [pending, setPending] = createStore<Record<string, Pending[]>>({})
    const reviewing = new Set<string>()
    // Requests whose dialog already opened by itself. Dismissed ones wait in the composer pill instead of reopening.
    const prompted = new Set<string>()

    const target = (session: SessionRef): Target | undefined => {
      const directory = 'directory' in session && typeof session.directory === 'string' ? session.directory : session.location?.directory
      return directory ? { server: session.server, directory } : undefined
    }
    const rpc = (at: Target) => at.server.client.rpc(Hush)
    const call = (at: Target) => ({ location: { directory: at.directory }, signal: ctx.signal })
    const unreachable = () => ctx.toast.show({ title: 'Could not reach Hush', description: 'Check that its server plugin is loaded.', variant: 'error' })

    const load = async (session: SessionRef) => {
      const at = target(session)
      if (!at) return
      try {
        const items = await rpc(at).pending({ sessionID: session.id }, call(at))
        if (ctx.signal.aborted) return
        setPending(session.key, reconcile(items))
        // Ask right away in the session on screen, one request at a time, as the app asks its own questions.
        const next = items.find(item => !prompted.has(item.id))
        if (next && !reviewing.size && ctx.sessions.current()?.key === session.key) {
          prompted.add(next.id)
          review(at, next)
        }
      } catch {
        if (!ctx.signal.aborted) setPending(session.key, [])
      }
    }

    const Review = (props: { at: Target; item: Pending; close: () => void }) => {
      const [secret, setSecret] = createSignal('')
      const [busy, setBusy] = createSignal(false)
      // The eye shows what was typed until it is clicked again. Each dialog starts hidden.
      const [shown, setShown] = createSignal(false)
      // Credentials are header values: printable ASCII without spaces.
      const invalid = () => !/^[\x21-\x7e]*$/.test(secret().trim()) || secret().length > 8192
      onCleanup(() => {
        setSecret('')
        reviewing.delete(props.item.id)
      })
      const reply = async (value?: string) => {
        setBusy(true)
        try {
          const result = await rpc(props.at).reply({ id: props.item.id, secret: value }, call(props.at))
          if (!result.accepted) ctx.toast.show({ title: 'This credential request has expired.' })
          props.close()
        } catch {
          if (!ctx.signal.aborted) unreachable()
          setBusy(false)
        }
      }
      const approve = () => {
        const value = secret().trim()
        if (value && !invalid() && !busy()) void reply(value)
      }
      const muted = { opacity: 0.7 }
      return <ctx.ui.Dialog
        title="Temporary Credential"
        footer={<>
          <ctx.ui.Button variant="ghost" disabled={busy()} onClick={() => void reply()}>Deny</ctx.ui.Button>
          <ctx.ui.Button variant="contrast" busy={busy()} disabled={!secret().trim() || invalid()} onClick={approve}>Approve</ctx.ui.Button>
        </>}
      >
        {/* The app's field is 280px wide; this one spans the dialog, beside the eye button. */}
        <style>{'.oc-hush-field[data-component]{width:auto;flex:1;min-width:0}'}</style>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px', 'padding-bottom': '16px' }}>
          <span style={muted}>{props.item.label}</span>
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <ctx.ui.TextInput
              class="oc-hush-field"
              type={shown() ? 'text' : 'password'}
              size="large"
              label="Credential"
              placeholder="Credential"
              value={secret()}
              onInput={setSecret}
              onSubmit={approve}
              invalid={invalid()}
              autofocus
            />
            <ctx.ui.IconButton
              icon={shown() ? 'outline-eye-slash' : 'outline-eye'}
              label={shown() ? 'Hide credential' : 'Show credential'}
              size="large"
              pressed={shown()}
              onClick={() => setShown(!shown())}
            />
          </div>
          {invalid() && <span style={muted}>Credentials cannot contain spaces or line breaks.</span>}
        </div>
      </ctx.ui.Dialog>
    }

    const review = (at: Target, item: Pending) => {
      if (reviewing.has(item.id)) return
      reviewing.add(item.id)
      // Escape or a click outside only dismisses the dialog; the request keeps waiting. Deny rejects it.
      ctx.dialogs.open(dialog => <Review at={at} item={item} close={dialog.close} />)
    }

    const changed = (server: ServerRef, change: Changed, directory: string) => {
      const open = ctx.sessions.list().filter(session => session.server.id === server.id && change.sessionIDs.includes(session.id))
      open.forEach(session => void load(session))
      const added = change.added
      if (!added) return
      const title = 'Hush needs a credential'
      const description = added.label
      const root = change.sessionIDs[change.sessionIDs.length - 1]
      // Sent once across windows, only while no app window has focus. Clicking it opens the top-level session.
      void ctx.attention.notify({ title, message: description, session: { server: server.id, id: root }, id: added.id })
      if (open.length && !open.some(session => session.key === ctx.sessions.current()?.key)) {
        ctx.toast.show({ title, description, icon: 'lock', duration: 10_000, actions: [{ label: 'Review', run: () => review({ server, directory }, added) }] })
      }
    }

    // One subscription per connected server; it restarts when the server reconnects.
    const servers = createMemo(mapArray(() => ctx.servers.list(), id => {
      createKeyed(() => {
        const server = ctx.servers.get(id)
        return server?.connected ? server : undefined
      }, server => {
        onCleanup(server.client.rpc(Hush).events.on('changed', event => changed(server, event.data, event.location.directory), { signal: ctx.signal }))
        ctx.sessions.list().filter(session => session.server.id === server.id).forEach(session => void load(session))
      })
    }))
    void servers()
    createKeyed(() => ctx.sessions.current(), session => void load(session))

    ctx.add(ComposerPill, {
      id: 'requests',
      show: input => {
        const items = pending[input.session.key] ?? []
        const at = target(input.session)
        if (!items.length || !at) return
        return {
          icon: 'lock',
          tone: 'warning',
          label: items.length === 1 ? `Hush · ${items[0].label}` : `Hush · ${items.length} waiting`,
          title: 'Credential requests',
          rows: items.map(item => ({ id: item.id, label: item.label, icon: 'lock', run: () => review(at, item) })),
        }
      },
    })

    ctx.add(Command, {
      id: 'forget',
      title: 'Forget Hush credentials for this session',
      group: 'Hush',
      section: 'session',
      slash: { name: 'hush-forget' },
      run: async () => {
        const session = ctx.sessions.current()
        const at = session && target(session)
        if (!session || !at) return
        try {
          await rpc(at).forget({ sessionID: session.id }, call(at))
          ctx.toast.show({ title: 'Session credentials forgotten.', variant: 'success' })
        } catch {
          if (!ctx.signal.aborted) unreachable()
        }
      },
    })
  },
})
