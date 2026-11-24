# Documentation Guidelines

This file establishes the single source of truth for where documentation belongs in this project.

## Core Principle

**All user-facing documentation lives in `/docs/topics/` organized by topic.** Agents and developers must follow these rules to prevent scattered documentation.

## Directory Structure

```
docs/
├── README.md                          # Main index and navigation
├── DOCUMENTATION.md                   # This file
├── topics/
│   ├── architecture/                  # System design, ADRs, technical decisions
│   │   ├── README.md
│   │   ├── architecture-overview.md
│   │   ├── tech-stack.md
│   │   └── adr/                       # Architecture Decision Records
│   │       ├── 0001-migrate-to-uv-package-manager.md
│   │       └── [more ADRs...]
│   ├── guides/                        # How-to guides, setup, workflows
│   │   ├── README.md
│   │   ├── setup-guide.md
│   │   ├── contributor-guide.md
│   │   ├── demo.md
│   │   ├── code-style/
│   │   │   ├── python.md
│   │   │   ├── typescript.md
│   │   │   └── html-css.md
│   │   ├── product.md
│   │   └── agent-workflow.md
│   ├── features/                      # Feature documentation and specifications
│   │   ├── README.md
│   │   └── [feature-name]/
│   │       ├── overview.md
│   │       ├── specification.md
│   │       └── requirements.md
│   ├── deployment/                    # Deployment, infrastructure, operations
│   │   ├── README.md
│   │   ├── infrastructure-policy.md
│   │   ├── performance-policy.md
│   │   └── changelog.md
│   ├── testing/                       # Testing strategies, scenarios, tools
│   │   ├── README.md
│   │   └── [test-scenario].md
│   ├── troubleshooting/               # Common issues, debugging, solutions
│   │   ├── README.md
│   │   └── [issue-name].md
│   └── planning/                      # Project plans, roadmaps, active tracks
│       ├── README.md
│       ├── current/                   # Active planning
│       │   └── [date-name].md
│       └── history/                   # Completed/archived plans
│           └── [date-name].md
```

## Placement Rules

| Content Type | Location | Owner | Rules |
|---|---|---|---|
| Architecture decisions | `docs/topics/architecture/adr/` | Tech lead | One ADR per decision. Reference in architecture-overview.md. |
| How-to guides | `docs/topics/guides/` | Team | Step-by-step instructions. Include prerequisites, expected output. |
| Feature documentation | `docs/topics/features/[feature]/` | Feature owner | Overview + spec + requirements. Link from README.md. |
| Deployment/infrastructure | `docs/topics/deployment/` | DevOps/release | Procedures, policies, playbooks. |
| Test scenarios | `docs/topics/testing/` | QA/test engineer | Test plans, scenarios, edge cases. |
| Troubleshooting | `docs/topics/troubleshooting/` | Community | Issues, solutions, workarounds. |
| Active plans | `docs/topics/planning/current/` | Project manager | Use YYYY-MM-DD-name.md naming. Move to history/ when complete. |
| Code style guides | `docs/topics/guides/code-style/` | Tech lead | Language-specific standards. |

## Module-Specific Documentation

Module READMEs stay in their directories (`accounts/README.md`, `gameday_designer/README.md`, etc.). These document module-specific setup and internal structure. Link them from `docs/topics/guides/README.md`.

## Agent Instructions

**All agents must follow these rules when creating documentation:**

1. **Before writing a new doc**, check if it fits an existing location above.
2. **Identify the type** — Is it a guide? A feature spec? An ADR? That determines location.
3. **Use the template** — Start with the template from the relevant section's README.
4. **Link from the index** — Update the parent README.md to include your new doc.
5. **Remove old versions** — If replacing an existing doc, delete the old one.

**DO NOT:**
- Create documentation outside `/docs/topics/` without explicit approval
- Scatter docs in module directories (except module-specific READMEs)
- Leave docs in gameday_designer/ or root level (except AGENTS.md, README.md, CHANGELOG.md)
- Create temporary docs that don't get linked and indexed

## Enforcement

- CI lint checks that new .md files only exist in `/docs/` (except module READMEs and root files)
- PR reviews will catch documentation outside this structure
- Agents are instructed via the root and per-module `AGENTS.md` files to follow these rules

## Questions?

This file is the source of truth. When in doubt, ask in the PR or issue.
