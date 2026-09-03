# AI Agent Readiness (Agentic SEO)

LeagueSphere exposes static and dynamic signals so AI agents (ChatGPT, Perplexity, Claude, ...) can discover, understand and correctly cite the platform.

## Static agent files

| Path | Purpose |
|---|---|
| `/robots.txt` | Crawler policy: AI **retrieval** bots allowed (OAI-SearchBot, ChatGPT-User, Claude-SearchBot/User, PerplexityBot/User, Amazonbot, anthropic-ai), **training-only** bots blocked (GPTBot, ClaudeBot, CCBot, Google-Extended, Bytespider, DotBot) |
| `/llms.txt` | Curated site overview following the [llmstxt.org](https://llmstxt.org) spec |
| `/llms-full.txt` | Extended page + API descriptions |
| `/llms-dynamic.txt` | Dynamic data guide: endpoints, freshness, status vocabulary, citation policy |
| `/facts.json` | Machine-readable brand facts + endpoint catalog with update frequencies |
| `/agents.md` | Welcome file and navigation guide for AI agents (`/agents/` redirects here) |
| `/.well-known/security.txt` | RFC 9116 security contact |

## Dynamic context

Most valuable data (live scores, standings) changes during gamedays and cannot be crawled effectively. Strategy:

1. **Public read-only JSON API** — agents query current state instead of scraping HTML:
   - `/api/liveticker/` — live scores, cached ~60s, ETag
   - `/api/gamedays/`, `/api/gamedays/{id}/games/` — gameday metadata & results, ETag
   - `/api/league-table/{league}/[{season}/]` — standings (added for agents; thin wrapper over `LeagueTableService`, see `league_table/api/`)
   - `/api/gameday/{id}/details/?get=schedule`, `/api/game-progress/`
2. **Freshness signals** — `Cache-Control` from `cache_page` + ETags (`condition` decorators) let agents revalidate cheaply
3. **Snapshot policy** — a game is final when its status is `beendet`; finalized gameday data is stable and safe to cite (documented in `/llms-dynamic.txt`)
4. **Throttling** — anonymous API traffic is rate limited (`AnonRateThrottle`, 120/min) in `league_manager/settings/base.py`

## Structured data

- `SportsEvent` JSON-LD on game detail pages (teams, scores, `eventStatus`, `speakable`) — `gamedays/views.py:GamedayGameDetailView._build_sports_event_ld`
- `SportsOrganization` + `SportsTeam` JSON-LD on league table pages — `league_table/views.py:LeagueTableView._build_league_ld`

## Availability during incidents

All agent files and endpoints stay reachable during maintenance mode and database outages: `MaintenanceModeMiddleware._is_exempt` and `DatabaseGuardMiddleware` skip `/robots.txt`, `/sitemap.xml`, `/llms*.txt` and `/.well-known/`.

## Testing

- `league_manager/tests/test_ai_readiness.py` — tier 1 files & middleware exemptions
- `league_manager/tests/test_ai_readiness_dynamic.py` — dynamic files, JSON-LD, throttling
- `league_table/api/tests/test_league_table_api.py` — standings API
- `liveticker/tests/api/test_liveticker_etag.py` — liveticker ETag
