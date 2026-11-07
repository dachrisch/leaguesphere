---
name: demo-feature-review
description: Use when asked to review shipped features on demo.leaguesphere.app with screenshots, to build a screenshot-backed review document (DocStash PDF) for a meeting or a merged stack, or to prove Scorecard v2 behaviour in a real phone-sized browser. Covers the demo login, the device lock, screenshot capture and hosting, and the DocStash authoring loop.
---

# Demo Feature Review

Turn "what did we actually ship?" into a document a club can read: a real
browser on the demo, one screenshot per feature, and a PDF with the evidence
next to the claim.

A review that only shows green screens is marketing. **What does not work is the
most valuable page** — record it with the same rigour (see Findings).

## The deliverable

One PDF, German, built from screenshots of `demo.leaguesphere.app`:

- **Cover** — what, when, which release (`pdf-canvas`).
- **One page per feature** — kicker = meeting ID + PR (`A5 · Interception`),
  headline, what the meeting asked vs. what happens now, one or two phone
  screenshots, and an evidence line (`Belegt auf 5.12.2: …` with real values).
- **Status table** — every item of the meeting, including the ones not built.
- **Verification table** — what was typed, what came out.
- **What is still open** — held items and rule values that need a human answer.

An example artifact of this skill (11 pages, 5.12.2, 2026-11-06) is recorded in
`assets/DEMO-REVIEW-2026-11-06.md`; its captures are in `assets/screenshots/`
and the page scaffold in `assets/review-template.html`.

## 1. Set up the browser

Use the `chrome-devtools` MCP. One page, one session:

```
resize_page({ pageId, width: 390, height: 844 })   // the phone the officials use
navigate_page({ pageId, url: "https://demo.leaguesphere.app/scorecard/v2/" })
```

Log in **once** and keep the session: nginx rate-limits the login form
(`5 r/m`, burst 5), so repeated logins will get `429`. The demo accounts are
printed on the login page itself — `scorecard-test` is the Scorecard-v2 one.

## 2. Get a game you can write to

`Meine Spieltage` → the demo gameday (`Scorecard v2 Testtag`) → a game.

- A `Geplant` game opens **Spiel vorbereiten**. Setting toss / possession /
  direction and confirming `Jetzt starten` writes the setup **and the device
  lock** — that is the moment the game becomes `läuft`.
- If the composer is greyed out and the strip says
  `Nur lesen – das Spiel läuft auf einem anderen Gerät`, the lock is held by a
  previous browser session. As staff: `Spiel übernehmen` → the same button
  becomes `Übernehmen` → tap again. (The label changes in place; do not look for
  a second button.)
- The demo resets at **00:00 UTC**: games, log rows and your carefully built
  state disappear. Do the captures in one sitting.

## 3. Capture

```
take_screenshot({ pageId, format: "jpeg", quality: 80, filePath: "/tmp/opencode/shots/03-try-b5" })
```

The harness appends `.jpeg`. At 390×844 a shot is ~40–50 KB — small enough that a
dozen of them cost nothing in the document. Omit `filePath` to get the image in
the response instead; pass `uid` for a single element, `fullPage` for a long page.

Driving the UI from `evaluate_script`:

- Match **`aria-label`** for the jersey grids — their `textContent` is `7Eagles 7`,
  their label is `Trikot 7, Eagles 7`.
- React inputs: use the native setter, then dispatch `input`:
  `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "45")`
  followed by `el.dispatchEvent(new Event("input", { bubbles: true }))`.
- **Re-read state ~300 ms after a click.** The first read races React and shows
  the previous possession/score.
- One-tap tiles (`1st Down`, `Interception`) write immediately and then **arm**
  for 10 s: the tile turns into `Nr. ergänzen`, and the second tap opens the
  detail sheet that *replaces* the row just written. The arm happens **after**
  the write resolves (~0.5 s), so poll for the label instead of sleeping a fixed
  time. The replaced row stays visible, struck through — that is the design.
- Screenshots of sheets: the sheet is `[role=dialog]`; scroll the target line
  into view before shooting, or the interesting field sits below the fold.

## 4. Host the images for DocStash

`create_pdf` only accepts **https image URLs** and there is no upload tool. Use
the demo's own static directory:

```bash
scp /tmp/opencode/shots/*.jpeg cda@servy.lehel.xyz:/tmp/shots-upload/
ssh cda@servy.lehel.xyz 'sudo -n docker cp /tmp/shots-upload/. leaguesphere-demo.www:/static/docstash/'
ssh cda@servy.lehel.xyz 'sudo -n docker exec leaguesphere-demo.www sh -c "chmod 755 /static/docstash && chmod 644 /static/docstash/*.jpeg"'
curl -sS -o /dev/null -w "%{http_code}\n" https://demo.leaguesphere.app/static/docstash/01-tracking.jpeg
```

The `chmod` is not optional: `docker cp` keeps the source mode (`600`) and nginx
answers **403** for files its worker user cannot read.

Caveat: the static files live in the running container, so the next demo repull
drops them. The baked PDF keeps its images; only a live HTML preview would lose
them. Re-upload if you re-render later.

## 5. Author the document

`create_pdf` with one continuous HTML document (cover as `pdf-canvas`, the rest
flowing). `assets/review-template.html` is a working scaffold — copy its CSS and
card structure.

Layout rules that survived real rendering:

- Content width is ~682 px at the engine's 0.7 in margin; body text 13 px.
- Two phone shots side by side: **210 px wide** each (image ≈ 454 px tall) — that
  is what lets a text block plus a caption plus an evidence box fit one page.
- A single phone beside text: **246 px**.
- Wrap each feature card in `pdf-keep`, and wrap **heading + intro + table**
  together as well — a `<table>` that just fits can otherwise jump to the next
  page and leave the heading behind.
- Do not force `pdf-break` unless you know the block height; a too-tall block
  plus a forced break produces a blank page.
- Claim only what you saw: quote the values from the run (`7:0 → 1:0`,
  `#11 · bis B20 · 15 Yards Return`), not the PR title.

Then review it:

```
screenshot_document({ link })                       // first 8 pages
screenshot_document({ link, firstPage: 9, lastPage: 11 })
```

At most 8 pages per call. Fix with `edit_pdf` (targeted `old_string` →
`new_string`) — a full `create_pdf` re-push is for structural rewrites only.
Look for: a stray card at the top of a page (something spilled), an orphaned
heading at the bottom, a page that is half empty, duplicated images.

Present the review link and stop: the doc is a **draft** until the user stashes
it.

## 6. Findings are the point

Write down what the walkthrough exposed, with the evidence that proves it. Two
examples from the review this skill came from (both in
`assets/DEMO-REVIEW-2026-11-06.md`):

- **C3's warning never appears.** `PUT /setup` stores `device_id`, but the
  serializer is `write_only`, so the preparation screen can never compare it.
  The server answers with `locked_elsewhere`, which the *tracking* screen uses —
  the prep screen does not read it. The lock works, the warning before the first
  tap is dead code.
- **A touchdown from the play sheet without a jersey scores nothing.**
  `playEvents()` returns only the play when `player === null`, so the TD row is
  dropped silently. The Touchdown tile allows "Ohne Nummer"; the play switch
  looks like it does too.

A finding is a paragraph in the document **and** a line in the report back to
the user, with the offer to fix it — not a silent edit to make the screens green.

## Pitfalls, short

- Login repeat → `429`; log in once, reuse the cookie.
- The device lock is per browser profile: a restarted browser is a new device
  and needs `Spiel übernehmen` again.
- `docker cp` files arrive `600` → nginx `403` (chmod 644).
- DocStash `screenshot_document` shows 8 pages per call; pass `firstPage`/`lastPage`.
- Tables inside the flow can jump a page; keep them with their heading.
- The nightly reset deletes your test games mid-review.
- Leave the demo tidy: undo test rows where it is cheap, and say in the report
  what you left running.
