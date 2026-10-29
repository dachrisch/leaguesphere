# LeagueSphere Deployment Configurations

This directory contains Docker Compose configurations for deploying LeagueSphere to different environments.

## Files

- `docker-compose.yaml` - Production deployment configuration
- `docker-compose.staging.yaml` - Staging deployment configuration
- `.env.staging` - Environment variables for staging (Traefik/Docker Compose)
- `ls.env.staging.template` - Template for staging application secrets
- `mysql-init/` - MySQL database initialization scripts

## Staging Environment Setup

### Prerequisites

1. Docker and Docker Compose installed on the server
2. Traefik reverse proxy running with `proxy` network
3. DNS records pointing to the server:
   - `stage.leaguesphere.app`
   - `leaguesphere-stage.lehel.xyz` (internal)

### Initial Deployment

1. **Generate secrets:**
   ```bash
   # Database password
   STAGING_DB_PASSWORD=$(openssl rand -base64 32)
   STAGING_ROOT_PASSWORD=$(openssl rand -base64 32)

   # Django secret key
   STAGING_SECRET_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")

   echo "Save these to your password manager:"
   echo "STAGING_DB_PASSWORD: ${STAGING_DB_PASSWORD}"
   echo "STAGING_ROOT_PASSWORD: ${STAGING_ROOT_PASSWORD}"
   echo "STAGING_SECRET_KEY: ${STAGING_SECRET_KEY}"
   ```

2. **Create application environment file:**
   ```bash
   cp ls.env.staging.template ls.env.staging

   # Edit ls.env.staging and replace placeholders with actual values
   nano ls.env.staging
   ```

3. **Ensure proxy network exists:**
   ```bash
   docker network create proxy 2>/dev/null || echo "Network already exists"
   ```

4. **Pull and start staging environment (first bring-up only):**
   ```bash
   docker compose -f docker-compose.staging.yaml pull
   docker compose -f docker-compose.staging.yaml up -d
   ```

   Afterwards CI + Watchtower keep the containers updated — see [Updating Staging](#updating-staging).

5. **Verify deployment:**
   ```bash
   # Check container status
   docker compose -f docker-compose.staging.yaml ps

   # Check logs
   docker compose -f docker-compose.staging.yaml logs -f

   # Test database connection
   docker compose -f docker-compose.staging.yaml exec mysql mariadb -u leaguesphere_staging -p -e "SHOW DATABASES;"

   # Create Django superuser
   docker compose -f docker-compose.staging.yaml exec app python manage.py createsuperuser
   ```

6. **Test URLs:**
   - https://stage.leaguesphere.app
   - https://leaguesphere-stage.lehel.xyz
   - http://leaguesphere-stage.lehel (local network)

### Updating Staging

CI updates staging end to end — there is nothing to run on the host:

1. `./container/deploy.sh stage` (or `gh workflow run deploy.yaml -f environment=staging -f bump_type=patch`) bumps the RC version on the current branch and pushes a `vX.Y.Z-rc.N` tag.
2. CircleCI builds that tag and pushes `leaguesphere/backend:staging` and `leaguesphere/frontend:staging` (plus an immutable `vX.Y.Z-rc.N` tag) to Docker Hub.
3. `watchtower-dev` on the host polls Docker Hub every **5 minutes** (scope `dev`, health-check gated) and swaps the staging containers. The app containers use the `blue-green` update strategy: the old container keeps serving until the replacement reports healthy.

Watch it happen:

```bash
# Which image/version is actually running?
docker inspect --format '{{.Config.Image}} {{.State.StartedAt}}' leaguesphere_stage.staging-app
docker exec leaguesphere_stage.staging-app python -c 'import league_manager; print(league_manager.__version__)'

# What did the watcher do?
docker logs --tail 20 portainer.watchtower-dev
```

Pulling and recreating by hand is a **fallback** only (Watchtower wedged, or you need to pin a specific immutable tag for a rollback):

```bash
cd ~/dev/leaguesphere/deployed/
docker compose -f docker-compose.staging.yaml pull
docker compose -f docker-compose.staging.yaml up -d
```

### Troubleshooting

**Container won't start:**
```bash
# Check logs
docker compose -f docker-compose.staging.yaml logs app
docker compose -f docker-compose.staging.yaml logs mysql

# Check environment variables
docker compose -f docker-compose.staging.yaml config
```

**Database connection issues:**
```bash
# Verify MySQL is running
docker compose -f docker-compose.staging.yaml exec mysql mariadb -u root -p -e "SELECT 1;"

# Check database exists
docker compose -f docker-compose.staging.yaml exec mysql mariadb -u root -p -e "SHOW DATABASES;"
```

**SSL certificate issues:**
```bash
# Check Traefik logs
docker logs traefik 2>&1 | grep stage.leaguesphere

# Verify DNS resolution
nslookup stage.leaguesphere.app
nslookup leaguesphere-stage.lehel.xyz
```

### Stopping/Removing Staging

```bash
# Stop containers
docker compose -f docker-compose.staging.yaml down

# Stop and remove volumes (WARNING: deletes all staging data)
docker compose -f docker-compose.staging.yaml down -v
```

## Production Environment

Production is deployed by the release pipeline; the host swap is automatic.

1. Merge a conventional-commit PR to `master`. release-please opens a release PR; merging that tags `vX.Y.Z`.
2. CircleCI runs the full suite, then `hold_production`. It is **auto-approved when no game is active and none is scheduled within the next 4 hours**; otherwise it waits for a manual approval in CircleCI. `deploy_production` then pushes `leaguesphere/backend:latest` / `leaguesphere/frontend:latest` (plus the version tag) to Docker Hub.
3. `watchtower-prod` polls Docker Hub every **2 hours** (scope `prod`, health-check gated, `blue-green` for backend and frontend) and swaps `leaguesphere.app` / `leaguesphere.www`. A replacement that never turns healthy is rolled back to the previous image.

Compose file: `docker-compose.yaml`. Because the host swap can take up to two hours, a green pipeline does **not** mean the release is live — verify:

```bash
docker exec leaguesphere.app python -c 'import league_manager; print(league_manager.__version__)'
docker inspect --format '{{.State.Health.Status}} {{.State.StartedAt}}' leaguesphere.app leaguesphere.www
docker logs --tail 20 portainer.watchtower-prod
```

Manual `docker compose pull && up -d` is a fallback (rollback, or Watchtower wedged), not part of the normal release flow.

## Resource limits

All three environments share one 4 vCPU / 7.6 GiB host with prod, Moodle, three DB
engines and the Prometheus/Loki/Grafana stack, so every service declares a `mem_limit`.
These are **ceilings, not targets** — roughly 1.5× the measured working set, so a leak
fails inside one container instead of pushing every other container's hot pages to swap
(which is exactly what happened before 2026-10-29).

| Environment | App | Database | Workers |
|---|---|---|---|
| production (`docker-compose.yaml`) | 1g | 512m | `-w 6` |
| staging (`docker-compose.staging.yaml`) | 512m | 512m | `-w 1` |
| demo (`docker-compose.demo.yaml`) | 512m | 512m | `-w 1` |

Only production runs the full worker pool: each gunicorn worker costs ~134 MiB, and
staging/demo are dev environments with ~no traffic (the demo alone was measured burning
50 % of a host core at `-w 6`). Adding a limit requires recreating the container —
Watchtower's blue-green strategy handles that for the app, `docker compose up -d` for the
databases.

## Security Notes

- Never commit `ls.env.staging` or `ls.env` files to version control
- Store secrets securely in a password manager (Bitwarden, 1Password, etc.)
- Use strong, randomly generated passwords for all credentials
- Rotate secrets periodically
- Limit access to the staging environment to authorized personnel only
