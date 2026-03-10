# Hook Descriptors — TigerTribe SEO Agency

## qa-before-publish.js

**Event:** `before_tool_call`
**Intercepts:** `wordpress_rest` POST and PUT calls
**Purpose:** QA Gate — blocks or warns before any content is published to WordPress.

### Behavior

Runs the slop detector against the request payload content using patterns from `../tools/slop-patterns.json`.

| Score | Action |
|-------|--------|
| ≥ 10  | **BLOCK** — tool call prevented; Slack alert dispatched with `🚫 QA Gate: Content Blocked` |
| ≥ 3   | **WARN** — call proceeds; `qa_warning: true` injected into context |
| < 3   | **CLEAN** — call proceeds normally |

### Config reference (`openclaw.json`)

```json
"hooks": {
  "before_tool_call": {
    "qa_gate": {
      "path": "./hooks/qa-before-publish.js",
      "tools": ["wordpress_rest"],
      "methods": ["POST", "PUT"]
    }
  }
}
```

### Pattern library

`tools/slop-patterns.json` — human-editable, no code changes required.
Categories: `boilerplate_sections`, `structural_markers`, `engagement_bait`, `lifestyle_blogger`, `anthropomorphism`.

### Manual audit tools

```bash
node tools/content-scanner.js          # Full-site audit
node tools/batch-cleaner.js            # Batch cleanup (dry-run default)
node tools/qa-gate.js --post-id=N      # Single-post validation
```
