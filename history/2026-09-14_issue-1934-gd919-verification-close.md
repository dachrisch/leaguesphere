# Issue #1934 (gd919 placeholder teams) — verification & close, 2026-09-14

## Problem
Canvas gamedays never resolved `rank`/`groupRank` refs: gd919 semifinals went live
with unresolved placeholder teams as participants. Code fix merged as #1935
(squash `c0d272d`, live on prod since restart 2026-09-12 17:31 UTC), but prod data
for gd919 stayed corrupted — the fix prevents recurrence, it doesn't rewrite history.
Repair guidance (Option A self-heal re-saves / Option B manual relabel) was left in
issue comment 5651535742. Leon ran the repair on the prod backend.

## Verification (this session, public endpoints only — no prod backend access)
- `GET /api/gamedays/919/games/` (11 games) + `https://leaguesphere.app/gamedays/gameday/919/`
- All 5 Final-bracket participant slots healed, identities match the issue's ground
  truth (Gruppe 1: Viktoria 408 / Heidel 57 / Raccoons 134; Gruppe 2: Regen 151 /
  Diamonds 146 / Spatz2 25); winner/loser propagation consistent
  (P1 = Viktoria vs Heidel, P3 = Diamonds vs Regen):
  - 9825 HF 1: Viktoria 58 vs Diamonds 27, beendet
  - 9826 HF 2: Regen 13 vs Heidel 50, beendet
  - 9827 P3: Diamonds 7 vs Regen 13, beendet
  - 9828 P5: Raccoons 38 vs Spatz2 27, beendet
  - 9829 P1: Viktoria 28 vs Heidel 19, beendet
- Scores intact: every fh+sh sums to the final score; no placeholder ids (634–639)
  remain in any home/away slot.
- Detail page shows real team names for all participants (italic placeholders gone).

## Known residual (cosmetic, documented on the issue)
`Gameinfo.officials` slots were NOT healed — page still shows raw refs:
HF 1 = "Rank 3 Gruppe 2" (Team 634, should be Spatz2/25),
HF 2 = "Rank 3 Gruppe 1" (Team 639, should be Raccoons/134),
P3 = "Gewinner HF 1" (Team 457, should be Viktoria/408),
P5 = "Gewinner HF 2" (Team 458, should be Heidel/57).
P1 = "Team Officials" (Team 122, static — fine).
Repair apparently covered `Gameresult` home/away only. Suggested follow-up for Leon:
re-save feeders in order (9823, 9824, then 9825, 9826) to relabel officials without
touching scores. Affects officiating display only — results/standings correct.

## Files changed
- None (verification + issue ops only).

## Outcome
- Closing comment posted: https://github.com/dachrisch/leaguesphere/issues/1934#issuecomment-5668195727
- Issue #1934 closed as completed.
- Success criteria: participants fixed with evidence; residual officials gap
  documented honestly instead of claimed fixed.
