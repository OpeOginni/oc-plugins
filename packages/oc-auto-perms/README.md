# oc-auto-perms

Intent-aware permissions for OpenCode V2, powered by TypeSafe AI's Jev decision model.

Requires OpenCode 2.2.6 or newer.

Unlike static permission rules, `oc-auto-perms` evaluates the policy, recent user requests, and full tool input together. A rule such as “only access google.com” therefore applies whether the agent uses `webfetch`, `curl`, or another tool.

## Setup

```sh
npm install oc-auto-perms
```

By default the plugin uses TypeSafe directly. Set `JEV_API_KEY` in `.env` or the OpenCode server environment, then add the plugin to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "oc-auto-perms",
      "options": {
        "guardedTools": ["shell", "webfetch", "websearch"],
        "permissions": [
          {
            "tools": ["shell"],
            "effect": "allow",
            "examples": ["git status", "git diff --stat"],
            "when": "Only inspects repository status."
          },
          {
            "effect": "allow",
            "examples": ["curl https://google.com", "!curl https://example.com"],
            "when": "Only accesses web content from google.com or its subdomains."
          },
          { "effect": "deny", "when": "Sends secrets or credentials over the network." }
        ]
      }
    }
  ]
}
```

## Jev gateways

The plugin supports TypeSafe, OpenRouter, Vercel AI Gateway, and OpenCode Zen through their native System One endpoints. Gateway accounts already connected through OpenCode are reused automatically, so their keys do not need to be duplicated in plugin configuration.

```jsonc
{
  "plugins": [
    {
      "package": "oc-auto-perms",
      "options": {
        "gateway": "opencode",
        "permissions": [
          { "effect": "allow", "when": "Only inspects the current repository." }
        ]
      }
    }
  ]
}
```

| Gateway | `gateway` | Default model | Authentication |
| --- | --- | --- | --- |
| TypeSafe | `"typesafe"` | `jev-latest` | `JEV_API_KEY` |
| OpenRouter | `"openrouter"` | `jev-latest` | Connected OpenRouter account, then `JEV_API_KEY` |
| Vercel AI Gateway | `"vercel"` | `typesafe-ai/jev` | Connected Vercel account, then `JEV_API_KEY` |
| OpenCode Zen | `"opencode"` | `jev-1.13` | Connected OpenCode account, then `JEV_API_KEY` |

For OpenRouter, Vercel, and Zen, the plugin first tries the active account configured through OpenCode's `/connect`. If none is available, every gateway falls back to the same `JEV_API_KEY` environment variable. TypeSafe uses `JEV_API_KEY` directly because it is not an OpenCode provider.

The plugin resolves the active gateway credential for each evaluation, so account switches and reconnects take effect without reloading it. Missing credentials, rejected credentials, insufficient credits, rate limits, unavailable models, timeouts, and provider outages fall back to user confirmation with an actionable error message. Existing native OpenCode `ask` and `deny` decisions remain unchanged.

Calls still go directly to each gateway's typed System One endpoint rather than OpenCode's text-generation route. This preserves Jev's choice and confidence response.

## Policy rules

- `effect` and `when` are required.
- `tools` is optional and defaults to every guarded tool. It accepts `"all"` or a list of tool names.
- `examples` are optional hints, not an exhaustive allowlist. Prefix counterexamples with `!`.
- Rules are ordered; the last applicable rule wins.
- If no `allow` rule matches, the action is denied.

Jev judges intent across tools, so switching from `webfetch` to `curl` does not bypass a rule.

## Supported tools

`oc-auto-perms` supports the following permission-exposed OpenCode tools:

- `read`
- `edit`, `write`, and `patch`
- `glob` and `grep`
- `shell`
- `subagent`
- `skill`
- `question`
- `webfetch` and `websearch`
- MCP and custom plugin tools

External-directory checks made by these tools are evaluated too. Use `guardedTools: "all"` to cover every supported tool, including tools added by plugins or MCP servers.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `gateway` | `"typesafe"` | `"typesafe"`, `"openrouter"`, `"vercel"`, or `"opencode"` |
| `model` | gateway-specific | Jev model sent to the gateway |
| `guardedTools` | `"all"` | `"all"` or the tool names Jev should evaluate |
| `permissions` | required | Ordered policy rules |
| `minConfidence` | `0.8` | Confidence required for an automatic decision |
| `historyLimit` | `3` | Recent user messages included as context |

OpenCode remains the outer permission layer: native `deny` is final, native `ask` always prompts, and Jev can narrow a native `allow`. Low-confidence decisions and API errors also fall back to `ask`.

> **Note:** Agents can use Code Mode `execute` to bypass these policies because OpenCode does not expose Code Mode programs to plugins. Use native OpenCode permissions to restrict Code Mode when needed.

Keep deterministic OpenCode rules for hard boundaries and use Jev for semantic policies. The policy, recent user messages, permission resources, and tool input are sent to the selected gateway for evaluation.
