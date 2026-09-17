# oc-auto-perms

Universal, intent-aware permissions for OpenCode V2, powered by TypeSafe AI's Jev decision model.

Normal permission rules inspect actions and resources. `oc-auto-perms` also considers your policy, recent requests, and full tool input. A restriction such as “only access google.com” therefore applies whether the agent uses `webfetch`, `curl`, or another tool.

## Setup

```sh
npm install oc-auto-perms
```

Set `TYPESAFE_API_KEY` in `.env` or the OpenCode server environment, then configure the plugin:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permissions": [
    { "action": "*", "resource": "*", "effect": "ask" },
    { "action": "shell", "resource": "*", "effect": "allow" },
    { "action": "webfetch", "resource": "*", "effect": "allow" },
    { "action": "websearch", "resource": "*", "effect": "allow" }
  ],
  "plugins": [
    {
      "package": "oc-auto-perms",
      "options": {
        "guardedTools": ["shell", "webfetch", "websearch"],
        "permissions": [
          {
            "tools": ["shell", "webfetch", "websearch"],
            "effect": "allow",
            "examples": [
              "webfetch https://google.com",
              "curl https://maps.google.com",
              "!webfetch https://example.com"
            ],
            "when": "Only accesses or retrieves web content from google.com or its subdomains."
          },
          { "effect": "deny", "when": "Sends secrets or credentials over the network." }
        ]
      }
    }
  ]
}
```

`guardedTools` controls which tool calls go through Jev. Use `"all"` (the default) or list selected tools. `permissions` contains ordered hybrid rules:

```jsonc
{
  "plugins": [{
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
          "tools": ["shell", "webfetch", "websearch"],
          "effect": "allow",
          "examples": ["curl https://google.com", "!curl https://example.com"],
          "when": "Only accesses or retrieves web content from google.com or its subdomains."
        },
        { "effect": "deny", "when": "Sends secrets or credentials over the network." }
      ]
    }
  }]
}
```

Every rule requires `effect` and `when`. `tools` and `examples` are optional. Omitting rule-level `tools` means every tool selected by `guardedTools`, so a natural-language-only rule is simply `{ "effect": "deny", "when": "..." }`. Rule-level `tools` accepts `"all"` or a list. `examples` clarifies intent without becoming an exhaustive allowlist: plain entries show when the rule applies, while entries prefixed with `!` are counterexamples where it must not apply. The last applicable rule wins, and Jev judges equivalent intent across tools rather than treating one command such as `curl` as a security boundary.

Code Mode `execute` is intentionally unsupported for now. OpenCode V2 uses its permission only to control Code Mode availability and does not expose the submitted program through the normal permission evaluation hook. The plugin rejects configurations that list `execute` rather than claiming protection it cannot provide through OpenCode's permission system.

OpenCode remains the outer permission layer. A native `deny` hides the tool and is final. A native `ask` keeps the tool visible and always prompts; `oc-auto-perms` does not override it. For a native `allow`, Jev must confidently match an `allow` rule. A confident `deny` rule or no matching allow rule blocks the action, while uncertainty or API failure escalates to `ask`.

This lets native OpenCode permissions decide which tools are available and which always require confirmation, while Jev narrows native allows semantically.

## Decisions

Jev returns `allow`, `ask`, or `deny`. No matching allow rule means deny. A decision below `minConfidence` asks instead, and API errors also fall back to `ask`.

| Option | Default | Description |
| --- | --- | --- |
| `guardedTools` | `"all"` | `"all"` or the tool names Jev should evaluate |
| `permissions` | required | Ordered rules containing required `effect` and `when`, plus optional `tools` and `examples` |
| `minConfidence` | `0.8` | Minimum confidence for automatic allow or deny |
| `historyLimit` | `8` | Recent user messages included as context |

Keep deterministic OpenCode permission rules for hard boundaries. Use Jev for semantic intent that static patterns cannot reliably express.

The permission policy, recent user messages, permission resources, and tool input are sent to TypeSafe for evaluation. Do not enable this plugin where that data may not leave the machine.
