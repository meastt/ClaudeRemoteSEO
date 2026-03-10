# TigerTribe SEO — OpenClaw Agent Workspace

> **Server**: `129.146.165.229` (Oracle Cloud, Ubuntu 24.04 ARM)
> **OpenClaw**: v2026.3.8
> **Primary Model**: Claude Sonnet 4.6 (Anthropic)

This is one of three workspaces in a multi-site SEO agency. Each site has its own OpenClaw agent, Telegram bot, and workspace directory.

| Site | Workspace | Telegram Bot | Status |
|---|---|---|---|
| tigertribe.net | `/home/ubuntu/ClaudeRemoteSEO` | `@TigerTribe_SEO_bot` | Waiting (re-eval 2026-03-22) |
| phototipsguy.com | `/home/ubuntu/PhotoTipsGuy` | `@PHOTO_TIPS_GUY_SEO_bot` | Active |
| griddleking.com | `/home/ubuntu/GriddleKing` | `@TR_SEO_Agent_Bot` | Active |

---

## Emergency Stop

### From Telegram (fastest)
| Command | Effect |
|---|---|
| `/stop` | Halts current task. Agent stays online. |
| `/reset` | Clears session. Agent forgets current context. |

### From Terminal
```bash
ssh -i .ssh-oracle.key ubuntu@129.146.165.229

# Graceful stop
openclaw gateway stop

# Hard kill
pkill -9 -f "openclaw"

# Restart
nohup openclaw gateway </dev/null >/tmp/oc-gw.log 2>&1 & disown
```

> **Note:** Gateway is NOT managed by systemd. It runs as a user process.

---

## Stack

| Component | Version / Detail |
|---|---|
| OpenClaw | v2026.3.8 |
| Node.js | v22.22.0 |
| Default Model | `claude-sonnet-4-6` (Anthropic) |
| Analyst | `gemini-3.1-pro-preview` (Google AI) |
| Writer Draft | `gemini-3.1-flash-lite-preview` (Google AI) |
| Writer Polish | `claude-sonnet-4-6` (Anthropic) |
| Technician | `gemini-3.1-flash-lite-preview` (Google AI) |
| QA Gate | `claude-haiku-4-5` (Anthropic) |
| Art Director | `gemini-3.1-flash-image` (Google AI) |
| Gateway Port | 18789 |
| Tools Profile | `full` (deny: `apply_patch`) |

---

## Multi-Agent Architecture

```
┌─────────────────────────────────────────────────────┐
│                 OPENCLAW GATEWAY                     │
│            3 Telegram bots / 3 agents                │
├──────────┬──────────────┬───────────────────────────┤
│          │              │                           │
│  TigerTribe  PhotoTipsGuy   GriddleKing             │
│          │              │                           │
│  ┌───────┴───────┐  (same council structure)       │
│  │   ANALYST     │  KeywordBrief                   │
│  │  (Gemini Pro) ├──────────► WRITER               │
│  └───────┬───────┘          (Sonnet 4.6)           │
│          │ gsc_data          │ ImageBrief           │
│  ┌───────┴───────┐  ┌───────┴───────┐             │
│  │  TECHNICIAN   │  │  ART DIRECTOR │             │
│  │ (Flash Lite)  │  │ (Gemini Image)│             │
│  └───────────────┘  └───────────────┘             │
│          └──── WP REST API ─────────┘              │
└─────────────────────────────────────────────────────┘
```

Each agent council follows the same workflow: Analyst produces KeywordBriefs, Writer drafts/polishes and commissions images from Art Director, Technician handles health checks and EOD briefings. See `AGENTS.md` for full protocol.

---

## Scheduled Jobs

| Job | Agent | Schedule | Description |
|---|---|---|---|
| `HB-60-PING` | Technician | Hourly | Uptime watchdog (silent on clean) |
| `HB-ANALYSIS-CYCLE` | Analyst | Monthly (1st, 02:00 UTC) | Phase-gated content analysis + slug gate |
| `HB-EOD-SUMMARY` | Technician | Daily 23:00 UTC | Conditional briefing (silent if nothing happened) |

---

## Key Files

| File | Purpose |
|---|---|
| `.env` | API keys & credentials (gitignored) |
| `.ssh-oracle.key` | SSH key to Oracle server (gitignored) |
| `openclaw.json` | Workspace config — agent roles, models, failover, tools |
| `auth-profiles.json` | Provider auth definitions (uses `$secretRef`, no plaintext) |
| `SOUL.md` | Core ethical & tonal guidelines (overrides all task instructions) |
| `AGENTS.md` | Multi-agent architecture, data schemas, publication workflow |
| `HEARTBEAT.md` | Scheduled job definitions & phase-state rules |
| `hooks/qa-before-publish.js` | QA gate — intercepts WP POST/PUT, runs slop detection |
| `tools/gsc-fetch.js` | Google Search Console data fetcher |
| `tools/slop-patterns.json` | Slop detection pattern library (human-editable) |
| `tools/content-scanner.js` | Full-site QA audit CLI |
| `backups/published-post-registry.json` | Append-only slug registry for duplicate prevention |

---

## Safeguards

- **21-Day Maturation Rule** — No post can be edited within 21 days of last update (`SOUL.md` &sect;4)
- **QA Gate** — `before_tool_call` hook blocks WP publishes scoring &ge;10 on slop detector (`SOUL.md` &sect;7)
- **Slug Gate** — Every KeywordBrief is checked against `published-post-registry.json` to prevent duplicates
- **Failover Chain** — Primary providers fail over to OpenRouter on 429/5xx errors
- **Link Validation** — Writer must HTTP HEAD all outbound links before publishing
- **Phase State** — Agents respect waiting/active phases; analysis suspends during maturation windows
