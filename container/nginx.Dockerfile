FROM python:3.14-slim AS python-builder
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ARG APP_DIR="/app"

WORKDIR ${APP_DIR}

# Install build dependencies
RUN apt -y update && \
    apt -y install pkg-config python3-dev build-essential default-libmysqlclient-dev

# Copy uv from official image (faster and more reliable than curl install)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies first (without source code for better caching)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-editable

# Copy the project into the image
COPY . ${APP_DIR}

# Sync the project (installs the local package)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable

# Third-party notices for the Python dependencies that ship with this image
# (see app.Dockerfile). Generated in a throwaway venv so pip-licenses itself
# never ends up in the shipped environment.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /tmp/licences && \
    uv pip install --python /tmp/licences/bin/python pip-licenses==5.5.5 && \
    /tmp/licences/bin/pip-licenses \
        --python /app/.venv/bin/python \
        --format=plain --with-urls \
        --ignore-packages leaguesphere > /app/THIRD_PARTY_LICENSES

# remove existing js files (will be packed below)
RUN rm -rf liveticker/static/liveticker/js
RUN rm -rf scorecard/static/scorecard/js
RUN rm -rf passcheck/static/passcheck/js
RUN rm -rf gameday_designer/static/gameday_designer/js

# collect static files (no DB access needed, but prod settings import
# requires env vars to be set — use build-only dummies so fork PRs
# without CircleCI secrets/contexts can still build; values never land
# in the final nginx image, only collected static files do)
RUN SECRET_KEY=build-only-dummy-secret-key-not-for-production \
    MYSQL_HOST=127.0.0.1 \
    MYSQL_DB_NAME=build_dummy \
    MYSQL_USER=build_dummy \
    MYSQL_PWD=build_dummy \
    .venv/bin/python manage.py collectstatic --no-input --clear

FROM node:24-slim AS node-builder
ARG APP_DIR="/liveticker-app"
WORKDIR ${APP_DIR}

COPY liveticker ${APP_DIR}
RUN rm -rf static/liveticker/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/scorecard-app"
WORKDIR ${APP_DIR}

COPY scorecard ${APP_DIR}
RUN rm -rf static/scorecard/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/passcheck-app"
WORKDIR ${APP_DIR}

COPY passcheck ${APP_DIR}
RUN rm -rf static/passcheck/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/field-app"
WORKDIR ${APP_DIR}

COPY field ${APP_DIR}
RUN rm -rf static/field/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/gameday-designer-app"
WORKDIR ${APP_DIR}

COPY gameday_designer ${APP_DIR}
RUN rm -rf static/gameday_designer/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/journey-dashboard-app"
WORKDIR ${APP_DIR}

COPY journey_dashboard ${APP_DIR}
RUN rm -rf static/journey_dashboard/js

RUN npm ci
RUN npm run build

ARG APP_DIR="/share-app"
WORKDIR ${APP_DIR}

COPY share ${APP_DIR}

RUN npm ci
RUN npm run build

FROM nginx:stable

LABEL org.opencontainers.image.title="LeagueSphere frontend" \
      org.opencontainers.image.source="https://github.com/dachrisch/leaguesphere" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

# Bundled dependency notices (generated in the python-builder stage above).
COPY --from=python-builder /app/THIRD_PARTY_LICENSES /THIRD_PARTY_LICENSES

COPY --from=python-builder /app/league_manager/league_manager/static /static
COPY --from=node-builder /liveticker-app/static /static
COPY --from=node-builder /scorecard-app/static /static
COPY --from=node-builder /passcheck-app/static /static
COPY --from=node-builder /field-app/static /static
COPY --from=node-builder /gameday-designer-app/static /static
COPY --from=node-builder /journey-dashboard-app/static /static
COPY --from=node-builder /share-app/static /static
COPY ./container/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./container/healthcheck.sh /healthcheck.sh
RUN chmod +x /healthcheck.sh

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD /healthcheck.sh
