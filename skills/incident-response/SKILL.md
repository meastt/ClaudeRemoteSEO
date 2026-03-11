---
name: incident-response
description: "Diagnose and remediate site outages (HTTP 500) with automatic rollback"
metadata:
  openclaw:
    emoji: "🚒"
    trigger: "hb_alert_500"
    requires:
      env: ["WP_TIGERTRIBE_NET_USERNAME", "WP_TIGERTRIBE_NET_PASSWORD"]
---

# Incident Response — Site Down (HTTP 500)

You are the Incident Responder. When HB-60-PING detects a non-200 status code on the
front-end, execute this runbook **immediately and autonomously**. Do not just alert and
wait for the human. Diagnose, fix, verify, then report.

---

## Step 1 — Triage (confirm and classify)

1. `curl -s -o /dev/null -w "%{http_code}" https://tigertribe.net` — confirm the front-end status.
2. `curl -s -o /dev/null -w "%{http_code}" https://tigertribe.net/wp-json/wp/v2/posts?per_page=1` — check if the REST API is healthy.

| Front-end | API   | Diagnosis                              |
|-----------|-------|----------------------------------------|
| 500       | 200   | PHP fatal in theme/plugin rendering    |
| 500       | 500   | Core WP / database / hosting issue     |
| 503       | 503   | Server overloaded or maintenance mode  |
| 502/504   | any   | Proxy / hosting infrastructure issue   |

If the API is also down (not 200), skip to Step 4 (escalate). You cannot fix hosting
or database issues via the API.

---

## Step 2 — Identify the cause (API-is-healthy path)

The most likely cause is a recently modified Code Snippet or plugin. Query in order:

### 2a. Check Code Snippets (most common)

```
GET /wp-json/code-snippets/v1/snippets
```

Sort by `modified` descending. Any snippet modified in the last 6 hours is a prime suspect.
Flag snippets where `active: true` and `modified` is recent.

### 2b. Check recently modified plugins

```
GET /wp-json/wp/v2/plugins
```

Look for any plugin that was activated/deactivated/updated since the last known-good state.

### 2c. Check recently modified posts

If no snippet/plugin changes are found, check if a post edit broke something:

```
GET /wp-json/wp/v2/posts?orderby=modified&order=desc&per_page=5
```

---

## Step 3 — Remediate

### For Code Snippets (most common):

1. **Deactivate the newest suspect snippet first:**
   ```
   PUT /wp-json/code-snippets/v1/snippets/{id}
   Body: { "active": false }
   ```

2. **Verify the front-end immediately:**
   ```
   curl -s -o /dev/null -w "%{http_code}" https://tigertribe.net
   ```

3. **If still 500**, deactivate the next-newest suspect. Repeat until 200 or no suspects remain.

4. **If 200 restored**, log which snippet caused the outage. Do NOT reactivate it.

### For Plugins:

1. Deactivate the most recently changed plugin via `PUT /wp-json/wp/v2/plugins/{plugin}` with `{ "status": "inactive" }`.
2. Verify front-end.
3. Repeat if needed.

---

## Step 4 — Escalate (cannot fix via API)

If you cannot restore the site through Steps 2-3:

1. Log everything you tried and the results.
2. Send a Telegram alert with header: `🚨 ESCALATION: Site Down — Manual Intervention Required`
3. Include: timestamp, HTTP status, what you tried, what failed.
4. Do NOT keep retrying the same actions in a loop.

---

## Step 5 — Post-incident report

After the site is restored (either by you or the human), generate a report:

```
📋 Incident Report — tigertribe.net

Timeline:
- Detected: {timestamp}
- Diagnosed: {timestamp}
- Resolved: {timestamp}
- Total downtime: {duration}

Root cause: {description}
Fix applied: {what you did}
Rollback details: {snippet/plugin deactivated}

Prevention recommendation: {what should change to prevent recurrence}
```

Send this report via Telegram.

---

## Rules

- **Act immediately.** Do not wait for human confirmation to deactivate a suspect snippet or plugin.
- **Newest-first.** Always deactivate the most recently modified suspect first.
- **Verify after every change.** curl the front-end after each deactivation.
- **Never reactivate** a snippet/plugin that caused a 500. Flag it for human review.
- **Max 5 deactivation attempts.** If 5 deactivations don't fix it, escalate.
- **Log everything** to `tools/audit-logs/incident-{timestamp}.json`.
