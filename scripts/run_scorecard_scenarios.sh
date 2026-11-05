#!/usr/bin/env bash
# Run the Scorecard v2 offline scenarios (two real browsers, one live server).
#
# Usage:
#   scripts/run_scorecard_scenarios.sh                 # SQLite, headless
#   scripts/run_scorecard_scenarios.sh --headed        # watch the two phones
#   scripts/run_scorecard_scenarios.sh --mysql         # MariaDB in servyy-test
#   scripts/run_scorecard_scenarios.sh -k "s01 or s02" # one group of scenarios
#
# The bundle is rebuilt every time: the committed static folder can be stale,
# and a stale bundle has already made one feasibility run fail.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HEADED=0
MYSQL=0
KEXPR=""
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --headed)
      HEADED=1
      shift
      ;;
    --mysql)
      MYSQL=1
      shift
      ;;
    -k)
      KEXPR="${2:-}"
      shift 2
      ;;
    -k*)
      KEXPR="${1#-k}"
      shift
      ;;
    *)
      EXTRA+=("$1")
      shift
      ;;
  esac
done

echo "Building scorecard_v2 bundle…"
npm --prefix scorecard_v2 run build

# The scenarios usually run from a worktree, which has no .venv; use the main
# checkout's interpreter then. PYTHONPATH still points at the worktree.
VENV_PY="$ROOT/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  COMMON_DIR="$(git rev-parse --git-common-dir)"
  COMMON_DIR="$(cd "$COMMON_DIR" && pwd)"
  VENV_PY="$(dirname "$COMMON_DIR")/.venv/bin/python"
fi
if [[ ! -x "$VENV_PY" ]]; then
  echo "No Python interpreter found (looked for $VENV_PY)" >&2
  exit 1
fi

export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
export PYTHONDONTWRITEBYTECODE=1
export DJANGO_ALLOW_ASYNC_UNSAFE=true

if [[ "$MYSQL" -eq 1 ]]; then
  export DJANGO_SETTINGS_MODULE="league_manager.settings.dev"
  if [[ -z "${MYSQL_HOST:-}" ]]; then
    MYSQL_HOST="$(lxc list servyy-test --format json \
      | jq -r '.[0].state.network.eth0.addresses[] | select(.family=="inet") | .address' \
      | head -n 1)"
    export MYSQL_HOST
  fi
  export SECRET_KEY="${SECRET_KEY:-local}"
  echo "MariaDB host: $MYSQL_HOST"
else
  export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-league_manager.settings.test_sqlite}"
  export SECRET_KEY="${SECRET_KEY:-local}"
fi

ARGS=(
  -m pytest
  -c pytest.ini
  --rootdir="$ROOT"
  -p no:cacheprovider
  # The project's addopts ignore this folder by design; the override keeps the
  # explicit run from silently collecting nothing.
  --override-ini addopts=
  -s
  -q
  scorecard_v2/tests/e2e_scenarios
)

if [[ "$HEADED" -eq 1 ]]; then
  ARGS+=(--headed --slowmo 400)
fi
if [[ -n "$KEXPR" ]]; then
  ARGS+=(-k "$KEXPR")
fi

"$VENV_PY" "${ARGS[@]}" "${EXTRA[@]}"
