# LeagueSphere v5 Sync — Intake: Projects & Open Threads

**Source:** `Leaguesphere v5.txt` — Tactiq transcript of the 2026-10-27 call (87 min, German, auto-transcribed).
**Participants:** Christian Dähn (LeagueSphere), Christoph Kämpfe (Verband / officials side).
**Purpose of this doc:** capture *what was discussed* — projects, decisions, open questions, and the agreed next steps — so the roadmap work has an anchor. **No roadmap or task breakdown yet** (deferred by decision). Some transcript passages are garbled by the auto-transcription; items marked _(unclear)_ need confirmation with Christoph/Leon.

> **Companion:** [Scorecard — Ideas & Findings](./2026-10-27-scorecard-ideas.md) collects everything scorecard-related from this call into one place.

---

## 1. offd (offd.de) — referee training Moodle migrated onto LeagueSphere infrastructure

Christoph runs the referee training platform (offd) as a Moodle instance on cheap shared webhosting.

**Current state**
- Shared webhosting, FTP access only, ~15 €/month, no managed access, small package.
- **14 GB** of data in use; DB described as very large; the load is PHP, not media (video hosting is *not* in there yet).
- Moodle **4.5.12** (build 20260608); current release is **5.3**.
- Upgrades are manual: download a ZIP, unpack over the instance every 1–2 months — and the ZIP carries licence/personal data along with it.
- Login workaround: users are built as *first name + full last name + one letter* so people can be identified; access/matching is fuzzy.
- Reporting is manual: the association wants "who attended which training" and invoicing (PayPal plugin for course fees).

**Goal**
Run the instance as a maintained Docker container under LeagueSphere hosting, with real upgrades, backups and plugin preservation.

**Candidate images (pasted into the call)**
| Image | Assessment |
|---|---|
| `oksigenia/moodle` | Maintained, automatic upgrades, backups, plugin preservation — best fit for production self-hosting |
| `ghcr.io/remarkablecloud/moodle` | Built from Moodle source, PostgreSQL pairing, persistent plugins |
| `lthub/moodle` | Community alternative — check release/maintenance policy first |
| `bitnami/moodle` | Discouraged: current Bitnami offering is a restricted *Secure Image*, `bitnamilegacy/moodle` is unmaintained |

**Constraints / open questions**
- **Storage**: current disk is too small; needs sizing (extra volume vs. attaching an external disk). Video hosting later would change the picture completely.
- **Ownership & money**: who pays, and how the AvD financing is settled — unresolved. Moving to a bigger package on the current host was named as the cheap alternative.
- **Migration path**: how users, courses and the DB move from the shared host; plugin preservation.
- **Timeline pressure**: trainings start in **January**; the Lehrgänge (courses) are created before that → the migration should land reasonably soon. Christoph wants to hand over the database.

---

## 2. Scorecard v2 — review of the current build (stage)

Shown live on stage; the flow Gameday → games → *my games* → touches was accepted as-is. Concrete gaps found:

1. **Team selection** — the operator must be able to select what the *other* team does.
2. **Theme** — dark/light distinction was raised.
3. **Referee fields must be configurable per league** (labels, count).
4. **Person linking is the top annoyance.** People type a name as free text, the suggestion pop-up appears, they never click it → the entry stays unlinked. Wanted:
   - fuzzy/automatic matching, proactively suggesting candidates while typing ("we found these people — take one of them?"),
   - a clear linked state (green) once a person is picked,
   - search across the **whole DB**, not only the current team,
   - configurable required fields (first + last name always present).

---

## 3. Scorecard clock — confirmation before start

Game duration (halves/quarters) immediately affects the live clock, so a wrong entry is expensive.

**Agreed:** a **confirmation step when pressing Start**, plus a second confirmation for corrections; the *official* time stays authoritative and visible. Reference: handball's yellow-flag confirmation. Rationale: the referee on the field keeps the official clock anyway, the operator's screen is only an aid — so make the operator confirm rather than silently drift.

---

## 4. Sports-rules configuration — templates, not free-form config

- Game time differs per league: 2×20 (football), 4×12 (tackle), 2×10 (youth, indoor).
- Officials count: 3–5 (football), 5–8 (tackle) — and it can change spontaneously on a gameday.
- Coin toss: winner chooses receive / defer / side, and the choice is mirrored in the second half so the referee knows what to ask.
- Penalty/event labels also differ per league.

**Decision:** do **not** hand users an open configuration UI. Ship **fixed templates per sport** in the gameday designer, selectable by the league manager. New sports → new template, not new config knobs.

---

## 5. Team identity — logos and colours, centrally

- Logos already bind to widgets; the scorecard does not use them yet.
- Move the logo to the central team entity and reuse it everywhere (scorecard, widgets, liveticker) so teams get consistent colours.
- **Open:** is a **Kader** (roster) concept needed at all, given Passcheck already assumes a roster exists? Deferred to the joint session with Leon.

---

## 6. Passcheck ↔ official Pass-Tool (NRW) API, offline-first

- The NRW pass tool is used by ~**14 of 16 Bundesländer** and **has an API**: pass number, first/last name and photo.
- Idea: pull rosters and photos **before** the gameday, then verify the person's face and jersey number on the device — offline.
- Sync cadence undecided: once at season start, weekly before each gameday, or per team per gameday.
- Agreement: offline capability always requires one online moment (home WLAN / spot with reception); that is acceptable, not a blocker.

---

## 7. Scorecard → event sourcing (the architectural decision of the call)

**Today:** the app writes points/state directly into tables.

**Proposed:** the app writes **only events** (timestamped, ordered, with a sequence) into a durable stream; server-side services derive score, halftime, penalties, statistics and liveticker from those events.

**Payoffs**
- Real **offline** support: buffer events locally, replay them in order when connectivity returns; no partial writes into production tables.
- Multiple clients/operators can write into the same stream.
- Many consumers (liveticker, stats, Telegram, fantasy) subscribe to event types instead of duplicating write logic.
- The app stays "dumb and comprehensive", the backend does the thinking — which also makes speech input or automated capture (camera/AI) a later possibility.

**Status:** Christoph was sceptical about the complexity but agreed ("klingt danach, von mir aus"). **To be confirmed with Leon**, who owns the scorecard scope.

---

## 8. Scorecard v3 — event capture, statistics, input UX

Explicitly **after v2 runs cleanly** (v3 in Christoph's numbering).

- Live clock *inside* the scorecard, paused on each event, so every event carries a real timestamp; later reconciliation issues ("was that minute 30 or 31?") are handled by per-event ordering rather than by editing the score.
- Statistics demand beyond scoring: who caught, who tackled, yards, penalty type. The GFL has a dedicated statistician per team for exactly this.
- **Input UX debate:** button grid (guidance, thumb-friendly — Christian's preference, "I won't type on a phone") vs. one searchable input field covering all configured event types (Christoph's preference). Tendency: curated button shortlist **plus** search over the full configured list.
- Scale limit acknowledged: more event types → fewer people can operate it, or you need more people. Option discussed: split observation across several devices feeding one stream.

---

## 9. Game Day (Hübi's tackle tool) — coexistence and officials assignment

- Game Day: ~12 years of development, PHP, **has an API**, established for tackle.
- Already covered there: referee availability per weekend, crew accept/decline, assignment map, travel km, expense payout, penalty-per-quarter stats, on-site game report entry, licence history (exam date/result), exports, printable schedules.
- **Target flow:** LeagueSphere creates the gameday → sends it via API to Game Day → league organisers assign referees there → LeagueSphere **pulls the assignments back** for the scorecard.
- Rebuilding that planning UI inside LeagueSphere was judged not worth it.
- **Decision:** coexistence. Game Day stays the officials-dispatch tool for tackle; scorekeeping and statistics stay with LeagueSphere. (Football: scorecard at LeagueSphere; tackle: scorecard at LeagueSphere too, officials planning at Game Day.)

---

## 10. Scorecard as a portable / multi-sport app

- The scorecard is only loosely coupled to LeagueSphere and could run against any backend — including another association's PHP API.
- **Decision:** design for it — clean API boundary/adapters, no hard coupling — but make **no distribution or licensing commitment** now. Offering it to Game Day/GFL remains on the table.

---

## 11. Event stream consumers — liveticker, notifications, fantasy

- Scorecard events push out to the **liveticker** instead of referees re-typing results at the desk; only a final check of score and penalties remains. Also saves official time and improves statistics.
- **Telegram** channel subscriptions per team/league were requested earlier (Leon or another party).
- **Fantasy Football** is a concrete association request: standard fantasy scoring off the captured game data (trades per gameday, points). Explicitly **not scoped** — it is a downstream consumer that the event model keeps possible.

---

## 12. Cross-association officials visibility (bug / limitation)

- Christoph is registered with the Bavarian association but referees in Baden-Württemberg: he sees only AVBY games, the BW referee obmann can assign him, but he sees nothing from BW.
- Needs cross-Verband handling: visibility must follow where the official is *deployed*, not only the association they are registered with.

---

## 13. Process, next steps, agreements

- **Next week** the whole picture should be settled: joint session with **Leon** (scorecard scope + event model), and Christoph's talk with **Hübi** about the Game Day API handshake.
- Then a written **roadmap** so everyone works off the same plan.
- **North star (Christian):** the two apps must be *ready* — hand them to someone in the middle of nowhere and they work, without follow-up work.
- Winter break is the build window; the idea of a collaborative/hackathon weekend was floated.
- offd must be resolved before January (training season).

---

## Decisions (locked in the call)

1. Scorecard writes **events only**; the server derives state. _(pending Leon's sign-off)_
2. Sports rules ship as **templates per sport**, not user-editable configuration.
3. **No competition with Game Day** on tackle officials planning; integrate through its API in both directions.
4. Moodle moves to **Docker on LeagueSphere infra**; `oksigenia/moodle` or `ghcr.io/remarkablecloud/moodle` preferred, Bitnami ruled out.
5. **Confirmation step before the clock starts**, and configurable referee fields per league.
6. Scorecard stays **portable by design**, with no distribution commitment.

## Open questions

| # | Question | Owner |
|---|---|---|
| 1 | Who pays for / owns the offd hosting, and how is the AvD financing settled? | Christian, Christoph |
| 2 | Moodle migration mechanics + storage sizing (does video ever land there?) | Christian |
| 3 | Leon's position on event sourcing and scorecard scope | Christian, Leon |
| 4 | Passcheck sync cadence (season start / weekly / per gameday) | Christoph |
| 5 | Kader: does it exist before Passcheck, or is it created by it? | Leon session |
| 6 | Is the scorecard ever offered outside the Verband? | Christoph, Christian |

## Agreed next steps

1. Talk to **Leon** this week — align scorecard scope and the event model.
2. Christoph's talk with **Hübi** — Game Day API for gameday hand-over and officials back-sync.
3. Draft the roadmap (only after 1 + 2).
4. offd: measure the 14 GB, pick the image, prototype a blank Moodle on LeagueSphere infra.
5. Schedule the collaborative weekend.
