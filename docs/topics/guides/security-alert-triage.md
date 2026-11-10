# Code Scanning Alerts — Triage

How the security alerts on
[Security → Code scanning](https://github.com/dachrisch/leaguesphere/security/code-scanning)
are produced, which ones are real, and what to do with the rest.

## Where the alerts come from

| Source | Rule ids | Trigger |
|---|---|---|
| CodeQL **default setup** (GitHub-managed, no workflow file in this repo) | `py/*`, `js/*`, `actions/*` | push/PR to `master`, plus a weekly run |
| ESLint → SARIF, `.github/workflows/part_node_test_matrix.yaml` | `eslint/*`, `@typescript-eslint/*` | every CI run of the node shards |

Nothing here gates a merge: the `PR branch` ruleset requires the
`code_quality` rule and the `full_gate` / `scope_coverage` /
`check_version_sequence` checks, but no *code scanning* rule. So a new alert
appears **after** the merge, on the next scheduled or push scan — do not wait
for a red PR check that never comes.

## `py/stack-trace-exposure` is the recurring one

CodeQL treats *any* string derived from an `except … as error` that ends up in a
response as a potential traceback (CWE-209). Django domain-exception handlers
do exactly that, on purpose, so this rule fires once per such handler — a new
API slice usually adds two to five of them.

### Allowed — dismiss

```python
try:
    config = SwissTournamentService(gameday).setup(**serializer.validated_data)
except SwissTournamentError as exc:          # our own exception class
    return Response({"error": str(exc)}, status=400)
```

The message *is* the API contract: the client shows it. This is safe **only**
when both hold, so check them before dismissing:

1. the `except` names a specific domain exception class, never `Exception`,
   and never wraps a call that can raise arbitrary errors;
2. every `raise` of that class uses a developer-authored message (no
   `raise X(str(other_error))`, no f-string of user data that came from a
   driver/ORM).

### Not allowed — fix

```python
except DatabaseError as error:
    return f"Datenbankfehler ({error})"       # "Data too long for column …"

except Team.DoesNotExist as error:
    raise NotFound(detail=str(error))          # "Team matching query does not exist: 4"
```

Framework/driver text names tables, columns, ORM classes and ids. The fix is
always the same two lines: a **fixed message in the response**, the detail in
the **log**.

```python
except Team.DoesNotExist:
    raise NotFound(detail="team not found")

except (…) as error:
    if isinstance(error, DatabaseError):
        logger.warning("import row %s hit a database error", row_number,
                       exc_info=error)
    errors.append({"row_number": row_number, "message": "Datenbankfehler …"})
```

The rule of thumb: **if we wrote the message, keep it and dismiss. If Django,
DRF or the DB driver wrote it, map it to ours and log the original.**

Writing a new handler? Prefer (1) above, and the alert will still appear — that
is expected, dismiss it with the comment below.

## Triage procedure

1. Read the alert's line and the `except` that feeds it (the API gives only
   the sink line: `gh api /repos/dachrisch/leaguesphere/code-scanning/alerts/<n>`).
2. If the exception text is a framework/driver message → fix the code (TDD:
   assert the fixed message in the response, assert the detail in the log).
   The alert closes by itself on the next scan; never dismiss it.
3. Otherwise dismiss it with a comment that names the exception class and
   states why no traceback can reach the sink:

```bash
gh api -X PATCH /repos/dachrisch/leaguesphere/code-scanning/alerts/73 \
  -f state=dismissed \
  -f dismissed_reason="false positive" \
  -f dismissed_comment="SwissTournamentError is raised only with developer-authored messages (gameday_designer/service/swiss_tournament_service.py); no bare except Exception feeds this response. Verified 2026-11-10."
```

`dismissed_reason` is one of `false positive`, `won't fix`, `used in tests`.
Always write the comment — a dismissal without one gets re-litigated by the
next person, which is how the same nine alerts stay open for months.

## Standing decisions

Dismissed as false positives (domain messages, contract of the 4xx body):
`gameday_designer/views.py` Swiss views (`SwissTournamentError`),
`gameevents/api/views.py` (`InvalidEnvelope`, `ProjectionUnavailable`),
`gamedays/api/game_views.py` (`InvalidEnvelope`).

Fixed in the code instead, so they close on their own: the
`officials` import `DatabaseError` message, the `gameevents`
`Team.DoesNotExist` 404, and the CRLF reflection in the healthcheck test mock
(`scripts/tests/test_container_healthcheck.py`, `py/http-response-splitting`).

Reopen the discussion only if the exception class starts carrying foreign text
(point 2 above).
