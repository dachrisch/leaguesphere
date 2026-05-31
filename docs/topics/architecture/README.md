# Architecture

System design, technical decisions, and technology stack documentation.

## Quick Links

- [Architecture Overview](./architecture-overview.md) — High-level system design
- [Tech Stack](./tech-stack.md) — Technologies and libraries
- [Architecture Decision Records (ADRs)](./adr/) — Technical decisions and rationale

## Overview

This section documents how the system is designed, the choices we've made, and why. Start with the Architecture Overview for a bird's-eye view, then dive into specific ADRs for detailed decisions.

### Contents

- `architecture-overview.md` — System components, dependencies, data flow
- `tech-stack.md` — Framework versions, database, deployment stack
- `adr/` — Individual architectural decisions with context and rationale
  - One file per decision
  - Use NNNN-decision-name.md naming
  - Include context, decision, and consequences

### Adding a New ADR

1. Create `adr/NNNN-descriptive-name.md` (next sequential number)
2. Use this template:

```markdown
# [NNNN] Decision Title

## Status
Proposed | Accepted | Deprecated | Superseded by [ADR-0001]

## Context
Why was this decision needed?

## Decision
What was decided?

## Consequences
What are the impacts (positive and negative)?

## References
- Related ADRs
- External documentation
```

3. Update this README.md to link the new ADR
4. Reference the ADR in the appropriate docs
