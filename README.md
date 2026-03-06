# TigerTribe SEO — OpenClaw Agent Workspace

> **Server**: `129.146.165.229` (Oracle Cloud, Ubuntu 24.04 ARM)
> **Bot**: `@TigerTribe_SEO_bot` (Telegram)
> **Model**: Claude Sonnet 4.6 (Anthropic)

---

## ⚠️ EMERGENCY STOP

### From Telegram (fastest)
| Command | Effect |
|---|---|
| `/stop` | Halts current task. Agent stays online. |
| `/reset` | Clears session. Agent forgets current context. |

### From Terminal (full kill)
```bash
# SSH into server
ssh -i ClaudeRemoteSEO/.ssh-oracle.key ubuntu@129.146.165.229

# Graceful stop
sudo systemctl stop openclaw-gateway

# Kill + prevent auto-restart
sudo systemctl stop openclaw-gateway && sudo systemctl disable openclaw-gateway

# Nuclear — hard kill all processes
sudo pkill -9 -f "openclaw"
```

### Bring it back online
```bash
ssh -i ClaudeRemoteSEO/.ssh-oracle.key ubuntu@129.146.165.229
sudo systemctl enable openclaw-gateway && sudo systemctl start openclaw-gateway
```

---

## Server Management

```bash
# Check status
sudo systemctl status openclaw-gateway

# Tail live logs
sudo journalctl -u openclaw-gateway -f

# Restart
sudo systemctl restart openclaw-gateway
```

---

## Stack

| Component | Version / Detail |
|---|---|
| OpenClaw | 2026.3.2 |
| Node.js | v22.22.0 |
| Default Model | `claude-sonnet-4-6` (Anthropic) |
| Technician | `gemini-1.5-flash` (Google AI) |
| Art Director | `gemini-3.1-flash-image` (Nano Banana) |
| Telegram Bot | `@TigerTribe_SEO_bot` |
| Gateway Port | 18789 |

## Key Files

| File | Purpose |
|---|---|
| `.env` | API keys & credentials (⛔ gitignored) |
| `openclaw.json` | Workspace config — agent roles, models, failover |
| `auth-profiles.json` | Provider auth definitions |
| `SOUL.md` | Core ethical & tonal guidelines (overrides everything) |
| `AGENTS.md` | Multi-agent architecture & data schemas |
| `HEARTBEAT.md` | Scheduled job definitions |
| `docs/OFFICIAL_TIGER_TRIBE_SEO_ACTION_PLAN.md` | Full SEO remediation roadmap (in `docs/` to avoid auto-loading) |

---

## 🗺️ Future Roadmap

> **Status:** Not yet started — documenting intent for later implementation.

### Multi-Site SEO Agency

Scale from a single-site agent to a full **multi-site SEO agency** with a Project Manager layer:

```
                ┌──────────┐
                │   Mike   │
                └────┬─────┘
                     │ reports to
              ┌──────┴──────┐
              │  PM Agent   │  ← manages all sites, prioritizes work,
              │  (new role) │    sends daily rollups to Mike
              └──────┬──────┘
        ┌────────────┼────────────┐
        ▼            ▼            ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ TigerTribe│ │  Site 2  │ │  Site 3  │
  │  SEO Team │ │ SEO Team │ │ SEO Team │
  └──────────┘ └──────────┘ └──────────┘
   Analyst       Analyst       Analyst
   Writer        Writer        Writer
   Art Dir.      Art Dir.      Art Dir.
   Technician    Technician    Technician
```

**Sites to onboard (TBD):**
- tigertribe.net ✅ (active)
- *(add future sites here)*

**PM Agent responsibilities:**
- Cross-site resource allocation & prioritization
- Consolidated daily/weekly reporting to Mike via Telegram
- Budget tracking across all sites (token spend, API costs)
- Escalation handling — single point of contact
