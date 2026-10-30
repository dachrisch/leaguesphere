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
- The shell tokens live in `src/styles/tokens.css`; all visual rules use the
  existing light, sun and dark theme tokens. Responsive rules are at the end of
  `src/styles/app.css`.
