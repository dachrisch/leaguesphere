# scorecard_v2 — Agent Guide

React/TypeScript field-entry app. Run `npm ci`, then `npm run test:run`,
`npm run eslint` and `npm run build` from this directory.

## Wide layouts

- Below `900px`, Tracking and GameList keep the original single-column layout.
- At `900px`, Tracking uses a two-pane log/controls grid capped by
  `--shell-width-track` (`1100px`); GameList uses its sidebar/timetable layout
  capped by `--shell-width-wide` (`1376px`). A one-field day keeps the plain list.
- At `1280px`, Tracking adds the Spielinfo column and moves the log to the
  right. Fine-pointer desktops also show keyboard hints: **T**, **1–8**, **B**
  and **Ctrl/Cmd+Z**. `useTrackingShortcuts` guards dialogs, form fields and
  read-only games.
- The action tiles keep their own height (`--action-tile`, 104px / 116px) and
  only shrink on short windows; the free height of a tall screen stays below
  the controls instead of stretching them.
- Large desktops scale the whole app: `body` is zoomed by `--ui-scale`
  (1.25 / 1.5 / 1.75 / 2), stepped so the 1376×860 wide layout always fits.
  Zoom scales viewport units too, so every `vh`/`vw`/`dvh` in `app.css` must be
  divided by `var(--ui-scale)`. Breakpoints and `matchMedia` are unaffected.
- Two-step buttons (`useArmed`, `ARM_MS` = 10s): the first tap arms a button in
  place (`.is-armed`: same box, the second action as its label, a draining
  bar), a second tap within the window runs it. The first tap follows what an
  entry needs: nothing more → save (Turnover); only an optional jersey → save,
  then "Nr. ergänzen" (1st Down, Interception; keys **1**/**3** twice); a
  required input → its sheet (touchdown, Spielzeit, Auszeit, Strafe, Safety,
  Overtime); a confirmation → arm (Halbzeit, staff "Spiel übernehmen"). A
  replacement keeps the replaced row's team and never moves the ball again.
  Undo is not a second tap: it stays in the log. While an extra point is open
  the tiles and Halbzeit are locked.
- The shell tokens live in `src/styles/tokens.css`; all visual rules use the
  existing light, sun and dark theme tokens. Responsive rules are at the end of
  `src/styles/app.css`.
