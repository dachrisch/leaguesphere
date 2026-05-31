# LeagueSphere Documentation

Welcome to the LeagueSphere documentation. Everything you need to know about the project lives here, organized by topic.

## 📖 Documentation by Topic

- **[Architecture](./topics/architecture/)** — System design, tech stack, architecture decisions
- **[Guides](./topics/guides/)** — Setup, workflows, code style, product guidelines
- **[Features](./topics/features/)** — Feature specs and documentation
- **[Deployment](./topics/deployment/)** — Infrastructure, deployment, operations
- **[Testing](./topics/testing/)** — Testing strategies and scenarios
- **[Troubleshooting](./topics/troubleshooting/)** — Common issues and solutions
- **[Planning](./topics/planning/)** — Active plans and completed work

## 🚀 Quick Start

**New to the project?** Start here:
1. [Setup Guide](./topics/guides/setup-guide.md) — Get your development environment running
2. [Contributor Guide](./topics/guides/contributor-guide.md) — How to contribute code
3. [Architecture Overview](./topics/architecture/architecture-overview.md) — Understand the system

**Want to learn about a specific feature?** 
- See [Features](./topics/features/) for feature-specific documentation

**Deploying or operating the system?**
- See [Deployment](./topics/deployment/) for procedures and policies

## 📦 Module Documentation

Each module has its own README documenting its specific setup and structure:

- [accounts/](../accounts/) — Authentication and user management
- [gameday_designer/](../gameday_designer/) — Flowchart-based game schedule design
- [gamedays/](../gamedays/) — Game scheduling and management
- [liveticker/](../liveticker/) — Real-time game updates
- [scorecard/](../scorecard/) — Score entry and tracking
- [league_table/](../league_table/) — League standings
- [passcheck/](../passcheck/) — Eligibility checking
- [teammanager/](../teammanager/) — Team management
- [officials/](../officials/) — Official management
- [matchreport/](../matchreport/) — Match reporting
- [journey_dashboard/](../journey_dashboard/) — User journey tracking

## 📋 Documentation Rules

**All agents and developers must follow these rules:**

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the complete guide. Key rules:

1. **Documentation lives in `/docs/topics/`** — One topic directory per category
2. **New docs must be linked from the topic README** — Index them so people can find them
3. **Module READMEs stay in their directories** — Link from here, not duplicated
4. **Remove old versions** — Don't scatter docs around
5. **Use templates** — Start with the structure in the topic README

## 🤝 Contributing to Docs

Before writing documentation:
1. Check which topic it belongs to (see [DOCUMENTATION.md](./DOCUMENTATION.md))
2. Read the topic's README for structure and templates
3. Write your doc and link it from the topic index
4. Delete any old versions you're replacing

Questions? Check [DOCUMENTATION.md](./DOCUMENTATION.md) or ask in the PR.

---

**Last updated:** May 31, 2026
