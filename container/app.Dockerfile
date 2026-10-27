FROM python:3.14-slim AS app-builder

# Install build dependencies
RUN apt -y update && \
    apt -y install pkg-config python3-dev build-essential default-libmysqlclient-dev

# Copy uv from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install dependencies first (without source code for better caching)
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-editable --extra prod

# Copy the project into the image
ADD . /app

# Sync the project (installs the local package)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-editable --extra prod

# Third-party notices for the Python dependencies that are shipped in the
# runtime image (AGPL-3.0-or-later §6 — the notices travel with the binary
# distribution). Generated in a throwaway venv so pip-licenses itself never
# ends up in the runtime environment.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv venv /tmp/licences && \
    uv pip install --python /tmp/licences/bin/python pip-licenses==5.5.5 && \
    /tmp/licences/bin/pip-licenses \
        --python /app/.venv/bin/python \
        --format=plain --with-urls \
        --ignore-packages leaguesphere > /app/THIRD_PARTY_LICENSES

FROM python:3.14-slim AS app

LABEL org.opencontainers.image.title="LeagueSphere backend" \
      org.opencontainers.image.source="https://github.com/dachrisch/leaguesphere" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ARG APP_USER="django"
ARG APP_DIR="/app"

RUN apt -y update && \
    apt -y install curl jq default-libmysqlclient-dev

# add user
RUN adduser --disabled-password --home ${APP_DIR} ${APP_USER}

# Copy the virtual environment from builder
COPY --from=app-builder --chown=${APP_USER}:${APP_USER} /app/.venv ${APP_DIR}/.venv

# Copy the application code
COPY --chown=${APP_USER}:${APP_USER} . ${APP_DIR}
COPY --chown=${APP_USER}:${APP_USER} container/entrypoint.sh /app/entrypoint.sh
COPY --chown=${APP_USER}:${APP_USER} container/entrypoint.demo.sh /app/entrypoint.demo.sh

# Bundled dependency notices (see the build stage above).
COPY --from=app-builder --chown=${APP_USER}:${APP_USER} \
    /app/THIRD_PARTY_LICENSES ${APP_DIR}/THIRD_PARTY_LICENSES

USER ${APP_USER}
WORKDIR ${APP_DIR}

RUN rm -rf .git/ && chmod 740 /app/entrypoint.sh /app/entrypoint.demo.sh

# Use the virtual environment
ENV PATH="${APP_DIR}/.venv/bin:${PATH}"

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -A healthcheck -H "Accept: application/json" http://localhost:8000/health/?format=json

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
