# Documentation Audit

## Current State (May 31, 2026)

### Root Level (Should consolidate)
- AGENTS.md → Move to docs/topics/guides/agent-workflow.md
- CHANGELOG.md → Keep at root (standard location) or move to docs/topics/deployment/changelog.md
- CLAUDE.md → Keep at root (critical instruction file)
- GEMINI.md → Keep at root (critical instruction file)
- README.md → Keep at root (project entry point)

### /docs Directory (Main consolidation target)
- /docs/adr/ - Keep, rename to /docs/topics/adr/
- /docs/arch/ - Keep, consolidate with adr/, rename to /docs/topics/architecture/
- /docs/guides/ - Keep, rename to /docs/topics/guides/
- /docs/features/ - Keep, rename to /docs/topics/features/
- /docs/plans/ - Keep, rename to /docs/topics/planning/ (for active work, archive history)
- /docs/reports/ - Keep, rename to /docs/topics/verification/
- /docs/superpowers/ - Merge into appropriate topics
- /docs/testing/ - Keep, consolidate to /docs/topics/testing/

### /conductor Directory (Partial consolidation)
- code_styleguides/ → Move to /docs/topics/guides/code-style/
- product.md, product-guidelines.md → Move to /docs/topics/guides/product.md
- tech-stack.md → Move to /docs/topics/architecture/tech-stack.md
- README.md, workflow.md → Referenced from /docs/README.md
- tracks.md → Keep reference in /docs/topics/planning/
- archive/ → REMOVE (completed work, archived)

### /gameday_designer Directory (Cleanup)
- EDGE_SYNC_FIX.md → Move to /docs/topics/troubleshooting/
- README.md → Keep (module-specific)
- PHASE_*.md, IMPLEMENTATION_SUMMARY.md → REMOVE (superseded)
- feedback.md → Remove (outdated)
- GEMINI.md → Keep module-specific
- feature-dev/docs/PLAY_MODES.md → Move to /docs/topics/features/

### Module READMEs (Keep in place)
- accounts/README.md, gamedays/README.md, league_table/README.md, etc. → KEEP (module-specific)

### Skills Documentation
- .claude/skills/*.md → Keep in place (separate system)

### Vendor/Generated (IGNORE)
- .pytest_cache/README.md, admin static files, LICENSE files → Ignore

## Action Items
- Phase 1: Design new structure in /docs/topics/
- Phase 2: Create DOCUMENTATION.md rules
- Phase 3: Move files systematically
- Phase 4: Update root-level links
- Phase 5: Remove obsolete files
