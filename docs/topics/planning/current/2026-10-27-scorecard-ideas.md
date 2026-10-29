# Scorecard — Ideas & Findings from the 2026-10-27 Sync

**Source:** `Leaguesphere v5.txt` (Tactiq transcript, 2026-10-27, Christian Dähn × Christoph Kämpfe).
**Companion:** [LeagueSphere v5 Sync — Intake](./2026-10-27-leaguesphere-v5-sync.md) (full meeting, incl. offd/Moodle and Game Day).
**What this is:** every scorecard-relevant idea, complaint and decision from that call, deduplicated and clustered. It is **raw material, not a plan** — no prioritisation, no roadmap (deferred by decision). Timestamps refer to the transcript.
**Implementation plan & status:** [Scorecard — Feature Plan & Status](./2026-10-27-scorecard-feature-plan.md) tracks every item below by ID, layer and status.

---

## 1. Findings from the v2 stage review

The operator flow Gameday → games → *my games* → touches was accepted as-is.

| # | Finding | Where |
|---|---|---|
| 1.1 | The *other* team must be selectable (the app must record what the opponent does, not only "my" team). | `18:56` |
| 1.2 | Dark/light theme distinction is missing. | `19:29` |
| 1.3 | Referee/operator fields must be **configurable per league** — the labels shown on the officials step differ between associations. | `20:52` |
| 1.4 | Required fields are not enforced: bad input is currently accepted, then has to be cleaned up later. | `24:19`–`24:38` |
| 1.5 | Free-text name entry leaves records unlinked; the suggestion list is never used (see §2). | `21:20` |
| 1.6 | Search for a person only covers the current team, not the whole database. | `21:53` |
| 1.7 | Team logos are not used at all yet. | `45:14` |

## 2. Person matching & data quality (the biggest operator complaint)

Problem: operators type a surname, a pop-up offers the real people, they never tap it → the entry is stored as free text and is not linked to a person. Christoph's framing: "a pile of work because people are too stupid to click it"; Christian's framing: "why do we even allow that input?".

Wanted:

1. **Suggest aggressively while typing** — "we found these people, take one of them" (`28:56`–`29:10`).
2. **Visible link state** — unlinked = yellow/ambiguous, linked = green (`28:56`, `30:17`).
3. **Fuzzy/automatic matching** — match what is clearly matchable without asking (`23:08`).
4. **Search across the entire DB**, not just the current team (`21:53`).
5. **Enforce first + last name** as required fields (`28:46`).
6. No "pseudo-regulation" via free text; if a match exists, the app should refuse the unlinked variant (`22:54`).

## 3. Clock handling and confirmations

- Game duration (halves/quarters) feeds the live clock **immediately** — a wrong entry therefore costs the whole game (`24:58`).
- **Confirm before pressing Start** ("are you sure this is the right duration/format?") (`25:29`–`25:38`).
- A **second confirmation** for corrections made during the game; the call described it as a second screen that re-asks before the correction is applied (`27:15`).
- Reference pattern: **handball's yellow-flag confirmation** before a correction (`27:15`, `27:55`).
- The **official clock stays authoritative**: the referee on the field keeps it; the operator's device is an aid, and drift is corrected by announcement ("bitte anpassen") — as with the video board in a stadium (`42:07`).
- Pressing save must not silently stop the clock; saving and the clock running are independent concerns (`26:09`).
- **Per event type, configure whether the entry stops the clock** (basketball: every whistle stops it; football: most do not; timeouts and severe injuries do) (`43:52`–`44:42`).

## 4. Match setup — templates instead of user configuration

Everything below varies per league, sometimes per gameday, and must be selectable, not typed:

- **Officials count**: 3–5 (football), 5–8 (tackle); can change spontaneously on the day (`31:12`–`32:05`).
- **Coin toss**: winner chooses *receive / defer / choose side*; the choice must be **mirrored in the second half** so the referee knows what to ask (`32:05`).
- **Possession & direction** labels — irrelevant in some sports, essential in others (`33:25`).
- **Game time**: 2×20 football, 4×12 tackle, 2×10 youth indoor (`36:31`–`38:11`).
- **Period semantics**: if there are only two halves, the button says "Halbzeit"; with quarters it must say "Quarter" (`38:47`).
- **Event/penalty labels** per league (the free-text hunt for "which penalty was it" is the current pain).

**Decision:** these are **fixed templates per sport**, held in the gameday designer and picked by the league manager — *not* a free-form configuration screen for end users. A new sport = a new template (`35:37`–`36:31`).

## 5. Event sourcing — the architectural decision

Today the app writes scores/state straight into tables. Proposal (`01:20:08`–`01:22:27`):

- The app writes **only events**: what happened, when, by whom, with a **per-event sequence counter** so ordering survives clock drift (`42:54`).
- A server-side service (worker) derives state from the event stream: score, period, penalties, statistics, liveticker.
- The app becomes "dumb and comprehensive"; the intelligence moves into consumers that subscribe to event *types*.

Consequences the call named explicitly:

- **Offline works properly**: events are buffered locally with a sequence and replayed when connectivity returns — no partial writes into production tables (`01:24:24`).
- Several devices/operators can feed one stream.
- Consumers can be added without touching the app: liveticker, stats, Telegram, fantasy.
- **Status:** Christoph accepted it ("klingt danach, von mir aus") but flagged the complexity; **Leon's sign-off is still outstanding**.

## 6. v3 — live event capture and statistics

Explicitly **after v2 runs cleanly**.

- The **live clock lives in the scorecard**, pauses on each interaction and resumes on save, so every event carries a real timestamp (`39:06`–`40:02`).
- Events are ordered by sequence, not by minute — so a touchdown recorded "before" a penalty that actually happened later can still be resolved (`43:18`).
- **Statistics beyond the score**: who caught, who tackled, yards, penalty type, down, etc. The GFL has a dedicated statistician per team for exactly this; the app is the natural place to capture it (`01:14:39`, `01:16:40`).
- Acknowledged trade-off: more event types → fewer people can operate it, or you need more operators (`01:17:43`).
- Escape hatch discussed: **split observation across several devices**, each covering a slice, all writing into one stream (`01:16:33`).

## 7. Input UX — buttons vs. one search field

The open design question of the call.

- **Christoph:** one searchable input field covering all configured event types (First Down, specific penalties, pass incomplete, sacks, …); the label catalogue is configured up front and the user just types what happened (`01:11:54`–`01:13:49`).
- **Christian:** a curated **button grid** — "I'm not going to type on a phone; if I can just tap, I get much further". Buttons double as guidance for people who don't know the vocabulary (`01:14:20`, `01:19:34`).
- Voice input: phone keyboards already support dictation, so a text field gets speech for free; concern that untrained users produce unusable phrases ("a bird pooped on the field") (`01:18:28`–`01:19:50`).
- Emerging consensus: **shortlist of buttons for the frequent events + search over the full catalogue** for the long tail.

## 8. Team identity & roster

- **Team logos and colours** move to the central team entity and are used by the scorecard (and widgets, liveticker) so a team looks the same everywhere (`45:14`–`45:47`).
- **Kader/roster**: unclear whether the scorecard needs one, since Passcheck already assumes a roster exists (`46:13`–`46:30`). Deferred to the Leon session.

## 9. Integrations & portability

- **Game Day**: LeagueSphere creates the gameday, Game Day handles referee assignment via its API, LeagueSphere pulls the assignments back into the scorecard's officials step (`54:00`–`56:35`).
- **Liveticker fed by scorecard events**: referees stop re-typing results at the desk; only a final check of score and penalties remains — saves official time and improves statistics quality (`49:22`).
- **Telegram** channel subscriptions per team/league, driven by the same events (`01:22:27`).
- **Fantasy Football** off the captured data (trades per gameday, points) — a concrete association request, kept possible by the event model, **not scoped** (`01:23:05`–`01:23:41`).
- **Portability**: the scorecard is only loosely coupled and could run against another association's backend. Decision: keep the API boundary clean and the app adaptable, but make **no distribution or licensing commitment** (`50:04`–`51:39`).

## 10. Long-term vision (explicitly beyond v3)

- The scorecard is a **human trigger** because nothing better exists yet. The real target is automated capture — camera + AI collecting events, several observers, or hybrid (`01:15:16`–`01:16:33`).
- Requires the event-based data model to be in place first, which is why §5 matters beyond offline support.

## 11. Explicitly rejected / deprioritised

- **Open user-facing configuration** of periods, officials count, coin toss etc. → replaced by sport templates (§4).
- Competing with Game Day on referee planning → coexistence via API (§9).
- Rebuilding the Kader before Passcheck is settled → wait for Leon.
- Fantasy football → not now.

## 12. Open questions for the Leon session

1. Event sourcing: yes/no, and does it land in v2 or v3?
2. Does the scorecard own statistics capture, or only score + penalties?
3. Kader: does the scorecard require a roster, or does Passcheck create it?
4. Which of §4's template fields belong to league vs. gameday vs. sport?
5. Game Day hand-over contract: what exactly goes over the API in each direction?
