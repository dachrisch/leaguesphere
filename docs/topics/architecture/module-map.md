# Module Map and Codebase Graph

What the modules actually depend on, and how to answer structural questions
about them without reading the whole tree. The findings below come from a
graphify build over `gamedays`, `gameday_designer` and `scorecard_v2` — the
three modules that share the scheduling and scoring data model.

## What the graph showed

**`Gameinfo` is the hub of the whole scheduling/scoring stack.** With 282
edges and the highest betweenness centrality in the graph (0.067), it is the
single node connecting the gameday API, the designer's schedule templates,
Swiss tournament configuration, the scorecard end-to-end tests and every
migration that touches results. `Gameday` (212 edges, 0.060) is the second
bridge. Treat changes to either model as cross-module changes, not local ones.

**`ScheduleTemplate` belongs to `gamedays`, not just to the designer.** The
model lives in `gameday_designer`, but two production services import it
directly — `gamedays/service/placeholder_service.py` and
`gamedays/service/schedule_resolution_service.py` — along with the migration
service and the scorecard placeholder tests. Any schema change there needs
both modules' tests.

**Documented state machine is only weakly tied to the model.**
`PLAY_MODES.md` describes `SCHEDULED → COMPLETED` per game, but the graph
finds only an inferred (`shares_data_with`, 0.75) link to `Gameinfo`. The
state machine is real in code; the doc is not where the code reads it.

**Test scaffolding dominates connectivity.** `DBSetup` is the most-connected
node in the graph (424 edges) and the test factories (`GamedayFactory`,
`TeamFactory`, `GameinfoFactory`, `SeasonFactory`) all rank in the top ten.
These are fixture hubs, not architecture — a high degree there means "many
tests build this", nothing more.

**Three import cycles in the wizard package:** `gamedays/wizard/__init__.py`
re-exports the step handlers, and the handlers import back from
`gamedays.wizard` (e.g. `gameinfo.py` line 6). Pairs:
`__init__ ↔ gameinfo.py`, `__init__ ↔ field_group.py`,
`__init__ ↔ gameday_format.py`. Harmless at runtime, but they defeat
incremental change isolation.

**Weakly-connected islands:** `TemplateSlot`, `TemplateApplication` and the
designer's `AGENTS.md` index have almost no edges into the rest of the graph.
Either they are genuinely self-contained, or their wiring (URLs, admin,
serializers) is not expressed as imports — worth checking before refactoring.

## When to build a graph instead of grepping

Build one when the question is structural and spans modules — "what breaks if
`Gameinfo` changes", "where does the designer's template reach into
`gamedays`", "which modules would a rename touch". For a single-symbol lookup
(`where is X defined`, `who calls Y`), a text search is faster and free.

```bash
/graphify .                       # build (choose a scope when prompted)
graphify query "what depends on Gameinfo?"
graphify path "ScheduleTemplate" "GamedayPlaceholderService"
graphify explain "TemplateApplicationService"
```

Outputs land in `graphify-out/` (`graph.html`, `GRAPH_REPORT.md`,
`graph.json`). That directory is **git-ignored on purpose**: it is up to ~20 MB,
it churns on every rebuild, its cache and `.graphify_root` carry absolute
local paths, and a graph built over a subset of modules is misleading when
read as "the repo's architecture". Rebuild it locally instead of committing
it; keep durable conclusions in this file.

## Limits of this map

- The build covered `gamedays`, `gameday_designer` and `scorecard_v2` only.
  `accounts`, `passcheck`, `liveticker`, `league_table`, `teammanager` and the
  rest are absent, so edges leaving the scope are stubs (that is most of the
  graph's 789 dangling endpoints).
- Edges come from Python/TypeScript imports plus an LLM reading non-code
  files. Import edges are reliable; anything else is a hint, and the report
  marks it `INFERRED` or `AMBIGUOUS` with a confidence score.
- Community detection is a navigation aid, not a module boundary. The largest
  community (227 nodes) has cohesion 0.03, which means "linked by shared
  imports", not "cohesive design".
