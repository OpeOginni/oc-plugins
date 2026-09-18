# oc-invaders

An OpenCode V2 CLI plugin that embeds
[`tui-invaders`](https://github.com/OpeOginni/tui-invaders) in the active
session so you can play while an agent works.

## Setup

Add the plugin to your OpenCode configuration:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["oc-invaders"]
}
```

## Usage

Open a session and run `/invaders`, or choose **Play TUI Invaders** from the
command palette. The game opens full-screen while the agent continues on the
OpenCode server.

When the current session finishes, the game pauses and displays a notification.
Press `Esc` to return to OpenCode.

| Key | Action |
| --- | --- |
| `←` / `A` | Move |
| `→` / `D` | Move |
| `Space` | Shoot |
| `P` | Pause or resume |
| `R` | Restart after game over |
| `Ctrl+F` | Toggle full-screen presentation |
| `Esc` | Return to OpenCode |

To keep playing when the agent finishes:

```jsonc
{
  "plugins": [
    {
      "package": "oc-invaders",
      "options": { "pauseOnCompletion": false }
    }
  ]
}
```

## Local development

The monorepo uses the adjacent `tui-invaders` checkout during development:

```sh
bun install
bun run --filter oc-invaders check
bun run --filter oc-invaders test
bun run --filter oc-invaders build
```

To load the local build, enter `packages/oc-invaders`, copy
`opencode.example.jsonc` to `opencode.jsonc`, and run `opencode2 --standalone`.
