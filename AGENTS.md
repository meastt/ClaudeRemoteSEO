# AGENTS — Multi-Agent Council Architecture
**Workspace:** tigertribe-seo-agency | **Schema:** openclaw v3.4.26

---

## §1. Council Overview

┌─────────────────────────────────────────────────────────────────┐
│ MULTI-AGENT COUNCIL │
│ ┌────────────┐ KeywordBrief ┌────────────┐ │
│ │ ANALYST │ ──────────────► │ WRITER │ │
│ │ (Sonnet) │ │ (Sonnet) │ │
│ └────────────┘ └─────┬──────┘ │
│ ▲ │ ImageBrief │
│ │ gsc_data ▼ │
│ ┌─────┴──────┐ ┌────────────┐ │
│ │ TECHNICIAN │ │ ART DIR. │ │
│ │ (Flash) │ │ (DALL-E) │ │
│ └────────────┘ └────────────┘ │
│ └──── WP REST API ───────────────┘ │
└─────────────────────────────────────────────────────────────────┘


---

## §2. Agent Profiles

### Analyst — claude-3-5-sonnet-20241022
- **Scope:** Keyword research, content gap identification, KeywordBrief production.
- **Tools:** `mmr_memory_search`, `mmr_memory_write`, `wordpress_rest_read`, `gsc_api_read`, `agentToAgent`
- **WP access:** Read-only. Never issues POST or PUT directly.

### Writer — claude-3-5-sonnet-20241022
- **Scope:** E-E-A-T compliant HTML authoring, image commissioning, WordPress publishing.
- **Tools:** `mmr_memory_search`, `mmr_memory_write`, `wordpress_rest_read`, `wordpress_rest_write`, `agentToAgent`
- **WP access:** GET, POST, PUT. DELETE not permitted.

### Technician — gemini-1.5-flash
- **Scope:** Health pings, GSC polling, speed/cache audits, EOD briefing assembly.
- **Tools:** `http_get`, `gsc_api_read`, `mmr_memory_read`, `mmr_memory_write`, `slack_dispatch`, `file_lock`, `file_unlock`
- **WP access:** Read-only.

### Art Director — gemini-3.1-flash-image (Nano Banana)
- **Scope:** Featured image generation only.
- **Tools:** `image_generate` (Gemini Nano Banana API). No WP or memory access. Responds only — never initiates.

---

## §3. Data Schemas

### KeywordBrief (Analyst → Writer)
```json
{
  "schema": "KeywordBrief",
  "version": "1.0",
  "analysis_run_id": "analysis:YYYY-MM-DD:N",
  "primary_keyword": "string",
  "secondary_keywords": ["string"],
  "feline_taxon": "lion | tiger | bobcat | other",
  "content_type": "species_profile | behavioral_study | habitat | taxonomy | conservation",
  "search_intent": "informational | navigational",
  "gsc_data": { "impressions_7d": "integer", "current_avg_position": "float", "opportunity_score": "float" },
  "existing_post_id": "integer | null",
  "maturation_cleared": "boolean",
  "content_notes": "string",
  "suggested_title": "string",
  "suggested_slug": "string"
}

ImageBrief (Writer → Art Director)
{
  "schema": "ImageBrief",
  "version": "1.0",
  "post_slug": "string",
  "subject_description": "string — e.g. 'Adult male Amur tiger (Panthera tigris altaica) mid-stride in snow-covered boreal forest'",
  "style_constraints": ["photorealistic natural style", "no text overlays", "no anthropomorphic poses", "scientifically plausible anatomy"],
  "resolution": "1792x1024",
  "quality": "hd"
}

PublishReceipt (Writer → MMR memory)
{
  "schema": "PublishReceipt",
  "version": "1.0",
  "analysis_run_id": "string",
  "post_id": "integer",
  "slug": "string",
  "action": "created | updated",
  "published_at_utc": "ISO8601",
  "wp_rest_response_code": "integer",
  "featured_image_url": "string",
  "token_spend": { "analyst_input": "integer", "analyst_output": "integer", "writer_input": "integer", "writer_output": "integer", "art_director_images": "integer" }
}

§4. agentToAgent Protocol
Analyst → Writer:

agentToAgent(to: "Writer", message_type: "KeywordBrief", payload: <KeywordBrief>, requires_ack: true)

Writer responds ack: accepted or ack: blocked before beginning work.

Writer → Art Director:

agentToAgent(to: "ArtDirector", message_type: "ImageBrief", payload: <ImageBrief>, timeout_ms: 60000)

On failure: log, Slack alert, hold publish, retry after 30 minutes. Do not publish without a featured image.

§5. End-to-End Publication Workflow
1. [ANALYST]    02:00 UTC — WP inventory + 21-Day check + GSC cross-reference
                → produce up to 5 KeywordBriefs → agentToAgent → Writer

2. [WRITER]     ACK brief → re-confirm 21-Day Rule → author HTML article
                → agentToAgent → Art Director (ImageBrief)

3. [ART DIR.]   Generate image (photorealistic, 16:9, via Gemini Nano Banana) → return URL to Writer

4. [WRITER]     Embed image → **HTTP HEAD all outbound links** → SOUL.md §5 checklist → POST or PUT WP REST API
                → write PublishReceipt to MMR

3.5 [WRITER]     Run QA Gate: `validateForPublish(html)` must return `approved: true`.
                If BLOCK → strip flagged content, re-run gate. Include `qa_gate_result` in PublishReceipt.

4. [WRITER]     Embed image → **HTTP HEAD all outbound links** → SOUL.md §5 checklist → POST or PUT WP REST API
                → write PublishReceipt to MMR (must include `qa_gate_result: { score, verdict }`)

5. [TECHNICIAN] Weekly: crawl all published post URLs, HTTP HEAD every outbound link.
                Flag any 4xx/5xx → Slack alert with `⚠️ Link Rot Detected` header.

5.5 [TECHNICIAN] Weekly: run `node tools/content-scanner.js` — full-site QA audit.
                Include scan summary (BLOCK/WARN/CLEAN counts) in EOD briefing.

6. [TECHNICIAN] 23:00 UTC daily — aggregate receipts + token spend + GSC deltas
                → dispatch EOD briefing to Slack

§6. Technician File Locking
Acquire before any cache or speed audit:

file_lock(resource_id: "wp_cache_audit | page_speed_audit | memory_index", lock_owner: "Technician", ttl_seconds: 300)

On acquisition failure: wait 60s, retry once. If still locked, skip cycle — do not force-acquire.
Always call file_unlock on completion, success or failure.
Writer waits up to 120s for lock to clear before a publish. If unresolved, defer and log.
§7. Human-in-the-Loop Escalation
Condition	Action Halted
21-Day Rule triggered	Edit of protected post
Art Director failure after retry	Post publication
SOUL.md violation detected	The violating task
Failover chain exhausted	The failed API call
WP DELETE attempted	The DELETE request
Lock conflict unresolved	That cycle's audit
ENDOFFILE	
cat > .env.example << 'ENDOFFILE'

OpenClaw v3.4.26 — Environment Variable Template
Copy to .env and populate. NEVER commit .env.
ANTHROPIC_API_KEY=sk-ant-your-key-here
GOOGLE_AI_API_KEY=AIzaSy-your-key-here
OPENAI_API_KEY=sk-your-key-here
OPENROUTER_API_KEY=sk-or-your-key-here
WP_APP_PASSWORD=your-wp-username:xxxx-xxxx-xxxx-xxxx-xxxx-xxxx
GSC_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project","client_email":"your-sa@your-project.iam.gserviceaccount.com"}
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/your-token
