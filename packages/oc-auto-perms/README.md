# oc-auto-perms

Intent-aware permissions for OpenCode V2, powered by TypeSafe AI's Jev decision model.

Unlike static permission rules, `oc-auto-perms` evaluates the policy, recent user requests, and full tool input together. A rule such as “only access google.com” therefore applies whether the agent uses `webfetch`, `curl`, or another tool.

## Setup

```sh
npm install oc-auto-perms
```

Set `TYPESAFE_API_KEY` in `.env` or the OpenCode server environment, then add the plugin to `opencode.jsonc`:

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
| `guardedTools` | `"all"` | `"all"` or the tool names Jev should evaluate |
| `permissions` | required | Ordered policy rules |
| `minConfidence` | `0.8` | Confidence required for an automatic decision |
| `historyLimit` | `3` | Recent user messages included as context |

OpenCode remains the outer permission layer: native `deny` is final, native `ask` always prompts, and Jev can narrow a native `allow`. Low-confidence decisions and API errors also fall back to `ask`.

> **Note:** Agents can use Code Mode `execute` to bypass these policies because OpenCode does not expose Code Mode programs to plugins. Use native OpenCode permissions to restrict Code Mode when needed.

Keep deterministic OpenCode rules for hard boundaries and use Jev for semantic policies. The policy, recent user messages, permission resources, and tool input are sent to TypeSafe for evaluation.
