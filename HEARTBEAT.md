# HEARTBEAT — Scheduling Directives
**Workspace:** tigertribe-seo-agency | **Schema:** openclaw v3.4.26

---

## 1. Cadence Overview

| Job ID | Agent | Interval | Cost Class | Description |
|---|---|---|---|---|
| `HB-60-PING` | Technician (Gemini Flash) | Every 60 min | Cheap | Uptime watchdog only — silent on clean |
| `HB-24-ANALYSIS` | Analyst | Monthly (1st of month, 02:00 UTC) | Heavy | Memory-aware analysis cycle with phase-state gate |
| `HB-EOD-SUMMARY` | Technician + Telegram | Daily 23:00 UTC | Cheap | Conditional EOD briefing — silent if nothing happened |

**Current phase state** (stored in memory key `phase_state`):
- `phase: "waiting"` | entered: 2026-03-11 | re-eval after: 2026-04-02
- HB-ANALYSIS-CYCLE suspended during waiting phase (exits at phase gate)

---

## 2. Job Definitions

### JOB: `HB-60-PING` — Uptime Watchdog
**Agent:** Technician (gemini-1.5-flash) | **Schedule:** `cron(0 * * * *)` | **Token cap:** 500 output tokens

**(0) Phase gate — check first, every time:**
- Load `phase_state` from memory.
- If `phase == "waiting"` AND today < `reeval_after`: **exit silently** — log skip to heartbeat journal (`HB-60-PING skipped: waiting phase`), do not invoke model, do not send Telegram. Stop here.
- Otherwise (phase is `"active"`, no state, or today >= `reeval_after`): proceed normally below.

1. HTTP GET `https://tigertribe.net/` — record status code and TTFB.
2. **IF healthy (HTTP 200 AND TTFB ≤ 5s):** Reply with exactly `HEARTBEAT_OK` — nothing else. OpenClaw will suppress delivery.
3. **IF unhealthy (non-200 OR TTFB > 5s):** Send Telegram alert with status code, TTFB, and timestamp. Do NOT include `HEARTBEAT_OK` in alert messages.

GSC rank checks are NOT part of HB-60. Rankings are checked by HB-ANALYSIS-CYCLE.

---

### JOB: `HB-ANALYSIS-CYCLE` — Monthly Memory-Aware Analysis
**Agent:** Analyst | **Schedule:** `cron(0 2 1 * *)` (02:00 UTC, 1st of each month) | **Token cap:** 8,192 output tokens

**(0) Phase gate — check first, every time:**
- Load `phase_state` from memory.
- If `phase == "waiting"` AND today < `reeval_after`: **exit silently**, log skip to heartbeat journal.
- If `phase == "waiting"` AND today >= `reeval_after`: proceed as **RE-EVALUATION** below.
- If `phase == "active"` or no state: proceed as **ACTIVE PHASE** below.

**ACTIVE PHASE:**
1. `GET /wp/v2/posts?per_page=100&status=publish` — build content inventory.
   Load `backups/published-post-registry.json` → merge into `known_slugs` set (authoritative duplicate gate).
2. 21-Day Maturation Pre-Check — exclude posts updated < 21 days ago (SOUL.md §4).
3. `exec: node /home/ubuntu/ClaudeRemoteSEO/tools/gsc-fetch.js --rows 100`
   Identify gaps: >200 impressions with no landing page, positions 11–20.
4. Affiliate audit: find posts with 0 affiliate links. Flag missing disclosure page. Flag buying guide / comparison opportunities.
5. Technical SEO: check for open issues from last audit (stored in memory).
6. Build action queue: content briefs (SLUG GATE) + affiliate tasks + tech fixes.
7. If action queue is empty AND last publish > 7 days ago:
   - Write `phase_state {phase: "waiting", entered_at: now, reeval_after: now+28d, gsc_baseline: <current snapshot>}` to memory.
   - Telegram: "All work complete — entering 28-day maturation period."
   - Exit.
8. Dispatch: up to 5 KeywordBriefs to Writer, affiliate tasks to Writer_Polish, tech tasks to Technician.
   - **SLUG GATE (mandatory):** For each brief, check `suggested_slug` against `known_slugs`.
     - MATCH + post <21 days old → skip, pull next-ranked. Log to heartbeat journal.
     - MATCH + post ≥21 days old → route as EDIT brief.
     - NO MATCH → new-post creation brief.
9. Store analysis snapshot to memory. Telegram: work summary + queue dispatched.

**RE-EVALUATION:**
1. `exec: node /home/ubuntu/ClaudeRemoteSEO/tools/gsc-fetch.js --rows 100` — pull fresh data.
2. Compare against stored `gsc_baseline` in `phase_state`. Summarize wins/losses by query.
3. Assess: has enough matured? Are rankings improving?
4. Telegram: full re-evaluation report — before/after comparison.
5. Write `phase_state {phase: "active"}` → begin new active phase.

---

### JOB: `HB-EOD-SUMMARY` — Conditional End-of-Day Briefing
**Agent:** Technician | **Schedule:** `cron(0 23 * * *)` | Telegram `eod_briefing` event

1. Check memory for WP REST actions taken today and any alerts fired.
2. **IF actions were taken OR alerts fired:** send full EOD briefing:
   - Token spend (24-hour totals by model, monthly cumulative)
   - WP REST API actions (method, endpoint, slug, agent, outcome; summary counts)
   - GSC deltas since last analysis snapshot
   - Lead with `✅ All systems nominal` or `⚠️ Issues detected`. Max 3,000 chars.
3. **IF nothing happened:** send one-liner:
   `[TigerTribe] — Quiet day. No actions taken.`

---

## 3. Heartbeat Journal

All job executions append to MMR namespace `heartbeat_log:` — source of truth for EOD summaries and debugging.
