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

---

## verify-after-deploy.js

**Event:** `after_tool_call`
**Intercepts:** `wordpress_rest` POST and PUT calls targeting `/code-snippets/v1/snippets`
**Purpose:** Post-deploy verification — confirms the front-end still returns HTTP 200 after any Code Snippet is created or modified. Auto-rollback on failure.

### Behavior

After any wordpress_rest POST/PUT that hits the Code Snippets API:

1. Waits for the tool call to complete.
2. Sends an HTTP GET to the site front-end (2 retries, 3s delay between, 15s timeout).
3. If front-end returns 200 → **PASS** (logged, no action).
4. If front-end returns non-200 → **ROLLBACK**:
   - Deactivates the snippet that was just created/modified via `PUT /snippets/{id} { active: false }`.
   - Logs the rollback to `tools/audit-logs/deploy-verify-{timestamp}.json`.
   - Returns an alert message for Telegram dispatch.

### Config reference (`openclaw.json`)

```json
"after_tool_call": {
  "deploy_verify": {
    "path": "./hooks/verify-after-deploy.js",
    "tools": ["wordpress_rest"],
    "methods": ["POST", "PUT"]
  }
}
```
