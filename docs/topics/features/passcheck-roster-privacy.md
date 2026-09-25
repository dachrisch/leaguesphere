# Decision: Passcheck roster privacy

**Date:** 2026-09-25
**Status:** Implemented

## Problem

`passcheck/templates/passcheck/roster_list.html` (`RosterView`, publicly reachable — no
`LoginRequiredMixin`) showed every player's pass number to any anonymous visitor, including
search engines. First/last name were already staff-gated (obfuscated via
`RosterSerializer`/`ObfuscatorSerializer` when `is_user_or_staff` is false); pass number was not.

## Decision

Show the "Passnummer" column only when `is_user_or_staff` is true (logged-in user or staff),
same gate already used for the name-obfuscation logic. Anonymous visitors and search engines no
longer see pass numbers at all; join date (`joined_on`) stays visible, as does the rest of the
roster (obfuscated names, jersey numbers).

This was the cheapest of three options considered (see
`docs/topics/planning/current/2026-09-25-app-review-remediation-plan.md`, item 2.5):
excluding the sitemap + `noindex`, or gating the whole roster behind login, were both larger
behavior changes for anonymous users/team sites that embed or link to this page.

## Implementation

`passcheck/templates/passcheck/roster_list.html` wraps the "Passnummer" `<th>`/`<td>` in
`{% if is_user_or_staff %}`. No backend/serializer change — the flag was already computed and
passed into the template context by `PasscheckService.get_roster()`.

Tests: `passcheck/tests/test_views.py::TestRosterView::test_anonymous_visitor_does_not_see_pass_numbers`
and `::test_staff_user_sees_pass_numbers`.
