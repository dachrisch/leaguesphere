# Public API

LeagueSphere has exactly one public API: **`GET /api/snapshot/`**. It is
anonymous, read-only, versioned (`schema_version`), and readable cross-origin
from any website, so clubs, fans and apps can build on LeagueSphere data without
running a relay.

Every other `/api/` endpoint is **internal**: still anonymous where
LeagueSphere's own pages need it (liveticker, league table pages, scorecard,
designer, generator), but undocumented, without CORS and without a stability
promise. "Internal" means unsupported, not secret.

## Why one endpoint

- One contract to keep stable, one ETag/caching story, one throttle to tune.
- Cross-origin reads are opened for exactly one anonymous, read-only path; every
  route #1977 closed stays closed.
- The share widget (`/share/widget/`) reads only this endpoint, so it is also
  the reference consumer: what the widget can show, a club's own page can too.

## Documents

- [snapshot-v1.md](./snapshot-v1.md): the contract (parameters, includes,
  freshness, limits, versioning)
- Agent-facing summary: `/llms-dynamic.txt`, `/facts.json`
- Decision and design: [planning/current/2026-10-04-snapshot-only-public-api.md](../../planning/current/2026-10-04-snapshot-only-public-api.md)
