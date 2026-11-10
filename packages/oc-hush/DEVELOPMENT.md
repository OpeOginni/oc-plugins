# Developing oc-hush

An OpenCode V2 plugin with three parts:

- **Server** (`src/index.ts`, `src/hush.ts`): the agent tool, credential storage, output redaction and the RPC.
- **TUI** (`src/tui.tsx`): the dialog and `/hush-forget` in the terminal.
- **Desktop** (`src/gui.tsx`, published as `./gui-experimental`): the dialog, composer pill and `/hush-forget` in the desktop app. It uses the app’s experimental plugin GUI API and runs only in the desktop app, not on the web.

## Commands

```sh
bun run check
bun run test
bun run build
bun run publish:dry-run
```

`bun run build` runs tsup for the server and TUI parts and Vite for `dist/gui-experimental.cjs`. `src/gui.tsx` compiles Solid for the DOM, so it has its own `tsconfig.gui.json`.

## Running it locally

From this package:

```sh
bun run build
cp opencode.example.jsonc opencode.jsonc
opencode --standalone
```

For another project, add this package’s absolute `dist` directory to `plugins` in its `opencode.jsonc`. Build before loading it.

The desktop app loads plugin GUIs only from the global config (`~/.config/opencode/opencode.jsonc`), not from a project’s `opencode.jsonc`. Add the absolute `dist` path to the global `plugins` list and restart the app. Rebuilding while a request is waiting interrupts it.

## Agent tool

- `hush_request_secret` with `{ label }`: asks the user for a credential and returns `{ file }`, a private file holding it. The agent reads the file inside the command that needs it, with OpenCode’s normal shell tool: `GH_TOKEN="$(cat <file>)" gh repo list`. The credential itself is never returned.

It works as a native tool call when Code Mode is off and through the Code Mode catalog when it is on, where programs use the file through the shell tool.

## RPC

The `./rpc` export exposes the typed UI contract for other trusted clients. It contains pending request metadata, reply, and session revocation methods, and a `changed` event with the affected session IDs and any new request’s metadata. Events never carry credentials or file paths.

The reply method accepts credentials but never returns them. There is no credential-read RPC or tool. Custom clients must submit replies directly, not through an agent tool call.

## Security details

- Credentials are kept in the server plugin’s memory and written to `<tmp>/oc-hush-<pid>/<n>` (directory mode 700, file mode 600). The file is deleted when the credential expires, on `/hush-forget`, on plugin reload, and when OpenCode exits. If the process is killed, the next start removes the leftover directory. The plugin creates no conversation messages or form answers.
- The `execute.after` hook redacts every tool result before the model sees it: each live credential and its base64, hex, URL-encoded and reversed forms become `[redacted by Hush]`. This covers all tools, including the shell and Code Mode, and what OpenCode saves in the session. Credentials shorter than 8 characters are only matched exactly.
- With `ttlMinutes: 0`, a credential is deleted after the first tool call whose input contains its file path, or after five minutes if never used.
- The TUI reads the credential through a focused input whose text is invisible and renders only a mask (or the text, while Tab shows it). Nothing reaches the prompt or its history. Both dialogs start hidden every time, and the shown state is never stored.
- This protects the conversation boundary, not a compromised machine, malicious plugin, terminal recorder, HTTP proxy, debugger, or hostile process running as the user. JavaScript strings are garbage-collected, not securely zeroized. OpenCode’s authenticated client/server transport is trusted; use an encrypted connection for remote servers. Do not enable request-body capture on that transport.
