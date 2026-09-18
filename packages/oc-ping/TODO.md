# TODO

## Support questions on standalone OpenCode servers

`oc-ping` currently creates a separate OpenCode client to inspect and reply to
forms because the V2 server-plugin context does not expose a form API. Without
an explicit `serverUrl`, this client uses `Service.discover()`, which can select
the shared background service even when the plugin is running inside a private
`serve --stdio` server.

The resulting form requests return `404`, so question notifications are not
sent and replies cannot be applied. This is independent of the notification
delay setting; a saved workspace delay of `0` correctly overrides the configured
default.

### Proper fix

- Add a form domain to the upstream OpenCode server-plugin context, alongside
  `ctx.session` and `ctx.permission`.
- Replace the `OpenCode.make()` / `Service.discover()` workaround in
  `src/index.ts` with that same-instance context API.
- Remove the `serverUrl` and `OC_PING_OPENCODE_TOKEN` workaround if it is no
  longer needed.
- Add coverage proving immediate and delayed question notifications, form-state
  checks, cancellation, and replies work on both shared and standalone servers.

Do not solve this by guessing or rediscovering the server endpoint: the plugin
must always operate on the server instance that loaded it.
