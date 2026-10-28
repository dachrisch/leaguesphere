# Scorecard v2: the app runs an old build after a deploy

## Symptom

After a staging or production deploy, an open Scorecard v2 tab keeps showing
data from before the deploy. The games list carries the **Zwischengespeichert**
badge, tapping a game fails, and the DevTools network panel shows `404` for
`/api/game/<id>/…` and sometimes for `/static/scorecard_v2/js/scorecard_v2.js`
or `manifest.webmanifest`.

## Why it happens

Three separate things line up during the image swap:

1. The service worker serves the **cached app shell and bundle**. A page that
   was already open keeps executing the bundle it loaded, so the new build is
   not picked up until the page reloads.
2. The cached games list holds **ids from the previous database**. Stage is
   re-seeded, so those games no longer exist and every request for one answers
   `404`.
3. For a few seconds while the new frontend container replaces the old one,
   static files can answer `404`, which is what the worker's `networkFirst`
   handler reports in the panel.

## What to do

**It heals itself now.** `sw.js` calls `skipWaiting()` and `clients.claim()`,
and the app reloads once when the new worker takes control
(`serviceWorker.ts` → `reloadOnUpdate`). If a tab is still stale:

1. Reload the page. The new worker is already in control, so one reload loads
   the new bundle.
2. If the games still fail, clear site data for the host
   (DevTools → Application → Storage → Clear site data), which also
   unregisters the worker and drops the IndexedDB snapshots.
3. Log in again and open the gameday.

## Not the cause

- **Not a failed deploy.** Check the tag pipeline's `deploy_staging` job and the
  registry (`leaguesphere/backend:staging` digest) before suspecting the build.
  The stage host pulls on its own schedule; being one image behind for a few
  minutes is normal.
- **Not the image you just deployed.** The manifest is still served as
  `application/octet-stream` because nginx has no `.webmanifest` mapping. The
  fix lives in `container/nginx*.conf` (a `location` that sets
  `default_type application/manifest+json`), but **staging does not read that
  file from the image**: the frontend container mounts
  `/var/jail/home/leaguesphere/container-stage/container/nginx.staging.conf`
  from the host, and Ansible syncs `container/` from **master**. A change that
  only exists in a tag therefore cannot flip the header.
  It lands once the change is on master and the stage deploy syncs
  `container/` — the same class of gap as a host-mounted volume.
  `test_frontend_image` validates the *image*, which the stage mount then
  overrides.

## Related

- [Scorecard v2 overview](../features/scorecard-v2/overview.md) — the offline
  contract
- `scorecard_v2/tests/test_pwa.py` — the shell/precache tests, including the
  guard that `app-shell.html` references only assets the worker precaches
