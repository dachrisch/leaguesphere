#!/usr/bin/env bash
# End-to-end: collect -> analyze -> render. See SKILL.md.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cache="${CACHE_DIR:-$here/../.cache}"
out="${OUT:-$here/../dashboard.html}"

python3 "$here/collect.py" \
  --project "${PROJECT:-gh/dachrisch/leaguesphere}" \
  --days "${DAYS:-35}" \
  --pr-sample "${PR_SAMPLE:-70}" \
  --cache-dir "$cache"

python3 "$here/analyze.py" --cache-dir "$cache"
python3 "$here/render.py" --analysis "$cache/analysis.json" --out "$out"
echo "Dashboard written to $out"
