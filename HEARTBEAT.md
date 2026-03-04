# HEARTBEAT — Scheduling Directives
**Workspace:** tigertribe-seo-agency | **Schema:** openclaw v3.4.26

---

## 1. Cadence Overview

| Job ID | Agent | Interval | Cost Class | Description |
|---|---|---|---|---|
| `HB-60-PING` | Technician (Gemini Flash) | Every 60 min | Cheap | Site health ping + GSC rank check |
| `HB-24-ANALYSIS` | Analyst (Claude Sonnet) | Every 24 hours | Heavy | Full content gap analysis |
| `HB-EOD-SUMMARY` | Technician + Slack | Daily 23:00 UTC | Cheap | EOD briefing to Slack |

---

## 2. Job Definitions

### JOB: `HB-60-PING` — Hourly Health & Rank Check
**Agent:** Technician (gemini-1.5-flash) | **Schedule:** `cron(0 * * * *)` | **Token cap:** 1,000 output tokens

1. HTTP GET `https://tigertribe.net/` — record status code, TTFB, timestamp. Alert Slack on non-200.
2. GSC API — top 50 queries (7-day window). Compare positions against `gsc_baseline_snapshot` in MMR. Flag queries that dropped >3 positions.
3. Persist result to MMR key `gsc_hourly_snapshot:{ISO8601}`. Update 24-hour impression delta accumulator.

### JOB: `HB-24-ANALYSIS` — Daily Content Gap Analysis
**Agent:** Analyst (claude-3-5-sonnet-20241022) | **Schedule:** `cron(0 2 * * *)` | **Token cap:** 8,192 output tokens

1. `GET /wp/v2/posts?per_page=100&status=publish` — build content inventory, store to MMR `content_inventory:{YYYY-MM-DD}`.
2. 21-Day Maturation Pre-Check — exclude any post where `last_updated_at` < 21 days ago (see `SOUL.md §4`).
3. Cross-reference GSC queries vs inventory. Identify: (a) >200 impressions with no landing page, (b) positions 11-20, (c) missing competitor clusters.
4. Produce up to 5 `KeywordBrief` objects ranked by impression x opportunity score.
5. Dispatch each brief to Writer via `agentToAgent`.

### JOB: `HB-EOD-SUMMARY` — End-of-Day Slack Briefing
**Agent:** Technician | **Schedule:** `cron(0 23 * * *)` | Slack `eod_briefing` event

All three sections are mandatory:

1. **Token Spend** — 24-hour totals by model (Analyst, Writer, Technician, Art Director, Failover). Include monthly cumulative.
2. **WP REST API Actions** — every call: method, endpoint, post slug, agent, outcome. Summary: N created, N updated, N failed.
3. **GSC Impression Deltas** — 24-hour delta vs prior window. Top 5 positive queries. Top 5 negative queries (flagged). Overall click delta.

Formatting: plain Slack markdown. Lead with `✅ All systems nominal` or `⚠️ Issues detected`. Max 3,000 characters.

---

## 3. Heartbeat Journal

All job executions append to MMR namespace `heartbeat_log:` — source of truth for EOD summaries and debugging.
