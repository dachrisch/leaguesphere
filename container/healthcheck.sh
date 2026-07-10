#!/bin/sh
set -e

URL="http://localhost/login/"
ORIGIN="${FRONTEND_URL:-https://leaguesphere.app}"

# 0. Check if service is up
UP_STATUS=$(curl -A healthcheck-status -s -o /dev/null -w "%{http_code}" "$URL")

# Maintenance mode: the app redirects all real routes to /maintenance/. The
# service is up and serving correctly, so report healthy and skip the deep
# login flow below (which cannot pass while maintenance is active). Without this
# the container is marked unhealthy during maintenance and the reverse proxy
# stops routing to it.
if [ "$UP_STATUS" -eq 302 ]; then
  REDIRECT=$(curl -A healthcheck-status -s -o /dev/null -w "%{redirect_url}" "$URL")
  case "$REDIRECT" in
    */maintenance/*)
      echo "Maintenance mode active (status=302 -> $REDIRECT) — healthy"
      exit 0
      ;;
  esac
fi

if [ "$UP_STATUS" -ne 200 ]; then
  echo "Service not responding properly (status=$UP_STATUS)"
  exit 1
fi

# 1. Cookie + CSRF-Token von Login-Form holen
COOKIE_JAR=$(mktemp)
HTML=$(curl -A healthcheck-csrf-get -s -c "$COOKIE_JAR" "$URL")

# CSRF Cookie extrahieren
CSRFTOKEN=$(grep csrftoken "$COOKIE_JAR" | awk '{print $7}')

if [ -z "$CSRFTOKEN" ]; then
  echo "No CSRF cookie set"
  exit 1
fi

# 2. POST mit Cookie + Token
STATUS=$(curl -A healthcheck-csrf-post -s -o /dev/null -w "%{http_code}" \
  -X POST "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Referer: $ORIGIN/login/" \
  -H "Cookie: csrftoken=$CSRFTOKEN" \
  -d "csrfmiddlewaretoken=$CSRFTOKEN&username=health&password=check")

# 3. Auswerten – akzeptiere 200
if [ "$STATUS" -eq 200 ]; then
  echo "CSRF healthcheck OK (status=$STATUS)"
  exit 0
else
  echo "CSRF healthcheck failed (status=$STATUS)"
  exit 1
fi
