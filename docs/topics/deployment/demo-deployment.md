# Demo Environment Deployment Guide

## Overview

The demo environment (`demo.leaguesphere.app`) is a public-facing instance of LeagueSphere with daily resets and synthetic data. This guide covers local testing, deployment via Docker Compose, and Ansible automation.

## Local Testing

### Prerequisites

- Docker and Docker Compose installed
- `.env.demo` file configured (see docker-compose.demo.yml)
- Sufficient disk space for database volume

### Quick Start

```bash
# Start the demo environment
docker-compose -f docker-compose.demo.yml up -d

# Check service status
docker-compose -f docker-compose.demo.yml ps

# View logs
docker-compose -f docker-compose.demo.yml logs -f demo-app

# Stop and remove
docker-compose -f docker-compose.demo.yml down
```

### Nightly Reset

Once per UTC day (Ofelia runs `entrypoint.demo.sh` at 00:00), the demo-app
container rebuilds the database from scratch:

1. Drop and recreate the demo database
   (`manage.py reset_demo_database --recreate-database`)
2. Run Django migrations — this also replays the data migrations, so the
   default `SiteConfiguration` and the league tie-break steps/rulesets exist
3. Execute `manage.py seed_demo_data`
4. Execute `manage.py seed_scorecard_demo`

The database is **recreated, not flushed**: `flush` keeps the migration table,
so data migrations are recorded as applied but never run again and their rows
(default `SiteConfiguration`, tie-break steps and rulesets) are lost. Dropping
the database also clears whatever a visitor created.

`seed_scorecard_demo` runs last: it adds the "Scorecard v2 Testtag" dated
**today** (4 games, rosters, crew, user `scorecard-test`), because the scorecard
only lists today's gamedays and the seeded league gamedays keep the dates of
the first seed.

The reset typically takes 1-2 minutes (drop/create + migrate + seed). Monitor
with: `docker-compose -f docker-compose.demo.yml logs -f demo-app`

### Testing the Reset

```bash
# Check the reset flag file (epoch seconds, UTC)
docker-compose -f docker-compose.demo.yml exec demo-app cat /app/.demo_last_reset

# Read the reset log
docker-compose -f docker-compose.demo.yml exec demo-app cat /app/logs/demo_reset.log

# Force a reset now — exactly what the nightly Ofelia job runs
docker-compose -f docker-compose.demo.yml exec demo-app \
  /bin/bash -c 'rm -f /app/.demo_last_reset && /app/entrypoint.demo.sh'
```

### Accessing the Demo

- **Local:** http://localhost:8001
- **Production:** https://demo.leaguesphere.app

### Demo Credentials

All demo accounts use `@demo.local` email:
- **admin@demo.local** / DemoAdmin123! (Administrator)
- **referee@demo.local** / DemoRef123! (Referee)
- **manager@demo.local** / DemoMgr123! (Team Manager)
- **user@demo.local** / DemoUser123! (Regular User)

## Database Reset

The reset is destructive by design: it drops the `demo_db` database and lets
`migrate` rebuild it. There is no snapshot to manage or invalidate — changing
`seed_demo_data`, a migration or the demo image takes effect on the next reset.

`demo_user` keeps `ALL PRIVILEGES ON demo_db.*`, and MariaDB keeps those grants
across `DROP DATABASE`, so no re-grant is needed. The media volume is not
touched.

Reset a deployed demo immediately (same command the nightly job runs):

```bash
ssh lehel.xyz "docker exec leaguesphere-demo.demo-app /bin/bash -c \
  'rm -f /app/.demo_last_reset && /app/entrypoint.demo.sh'"
```

That takes the demo down for 1-2 minutes while migrations and seeding run.

## Ansible Deployment (Infrastructure Repo)

The infrastructure repo contains the `ls_demo` Ansible role for automated deployment. See `plays/roles/ls_demo/` for full details.

### Deployment Workflow

1. Update leaguesphere repo (git pull origin main)
2. Update demo.py settings if needed
3. Rebuild demo Docker image: `docker build -f container/app.Dockerfile -t leaguesphere:demo .`
4. Run Ansible playbook: `ansible-playbook plays/leaguesphere.yml --tags demo`

### Monitoring Deployment

```bash
# SSH to demo server
ssh admin@demo.leaguesphere.app

# Check demo container status
docker ps -a | grep demo

# View demo logs
docker logs ls-demo-app

# Check the last reset and its log
docker exec leaguesphere-demo.demo-app tail -20 /app/logs/demo_reset.log
```

## Troubleshooting

### Database Connection Issues

**Error:** `Can't connect to MySQL server on 'demo-db'`

- Ensure MariaDB container is running: `docker-compose -f docker-compose.demo.yml ps`
- Check database environment variables in `.env.demo`
- Wait 10-15 seconds after startup for database to be ready

### Reset Failed

The reset log (`/app/logs/demo_reset.log`) stops after "Recreating demo
database..." or the entrypoint exits non-zero:

- The demo must run on MySQL. `--recreate-database` refuses SQLite
  (`--recreate-database requires the MySQL backend`), because Django cannot
  drop a SQLite database safely.
- Check the database container is healthy:
  `docker-compose -f docker-compose.demo.yml ps` and
  `docker exec leaguesphere-demo.mysql mariadb -u root -p"$MYSQL_ROOT_PASSWORD" -e 'SELECT 1'`.
- Re-run the reset (see "Testing the Reset") and read
  `/app/logs/demo_reset.log`.

### Reset Not Triggering

- Check that entrypoint.demo.sh is executable: `docker-compose -f docker-compose.demo.yml exec demo-app ls -la /app/entrypoint.demo.sh`
- Verify timezone is UTC on container: `docker-compose -f docker-compose.demo.yml exec demo-app date -u`
- Check logs: `docker-compose -f docker-compose.demo.yml exec demo-app cat /app/logs/demo_reset.log`

### Credentials Not Displaying on Login

- Verify `DEMO_MODE=True` in `.env.demo`
- Clear browser cache
- Check that `demo_info.html` template is in correct location
- Verify login template includes demo banner code

## Performance Considerations

- **Database Reset Time:** ~1-2 minutes (drop/create + migrate + seed)
- **Container Startup:** ~40 seconds for migrations + seeding on first run
- **Health Check:** Configured to allow 40s startup grace period
- **Memory:** Allocate minimum 2GB RAM for demo-app, 1GB for MariaDB

## Security Notes

- All demo person data is synthetic with no real PII. The finals gamedays
  (888/890) keep their real team names, schedules, results and jersey numbers,
  but every player/official name, year of birth and pass number is replaced by
  a generated value (see `_finals_demo_data.py`).
- Demo credentials are intentionally weak and public
- Demo database is isolated from production via separate network
- CSRF and CORS are configured for demo domain only
- SSL/TLS handled by Traefik in production

## Maintenance

### Weekly Tasks

- Monitor demo environment health: `curl https://demo.leaguesphere.app/health/`
- Check disk usage for database volume
- Review reset logs for errors

### Monthly Tasks

- Update seed data if new features added
- Verify all demo accounts still work correctly

### Before Major Releases

- Test entire demo flow in staging
- Update seed data to showcase new features
- Test reset mechanism explicitly
- Verify all demo accounts have appropriate permissions
