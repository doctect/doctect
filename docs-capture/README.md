# docs-capture

Regenerates every screenshot and animated clip used by the in-app docs
(`/docs`), deterministically, against a sealed throwaway server (scratch
SQLite, no email, no real database — see `tutorial/lib/servers.js`).

## Usage

    node docs-capture/run.js                     # all scenarios → public/docs-assets
    node docs-capture/run.js editor               # one scenario
    node docs-capture/run.js smoke --out=/tmp/x  # smoke test, throwaway output

Rerun the relevant scenario after any UI change that alters what a
screenshot shows, then review the image diffs in git before committing.

## Shot contract

Each scenario file in `scenarios/` exports `shots`:

    { id: 'editor/toolbar',        // → public/docs-assets/editor/toolbar.png
      kind: 'still',               // or 'clip' → .webp animated loop
      dialogText: 'My commit',     // optional window.prompt answer
      run: async (t) => { ... } }  // drive the app, then t.snap([selector])
                                   // clips: call t.beginClip() when the action starts

Stills render at 1600×1000, deviceScaleFactor 2; pass a CSS selector to
`t.snap()` for element crops. Clips are 12 fps looping webp, scaled to 1200px
wide; keep them 3–10 s.

`t.setDialogText(value)` retargets the answer for whichever dialog
(window.prompt/confirm/alert) fires next, and returns whatever the answer
was before the call. A helper that triggers a dialog mid-shot with its own
specific text (e.g. `docs-capture/lib/cloud.js`'s `saveToCloud`, so a commit
message actually shows up in cloud version history instead of every prompt
in the shot getting the shot's one fixed `dialogText`) should restore that
returned value afterward — typically in a `finally` — so the override
doesn't bleed into whatever dialog fires next.

Orphan assets (files no markdown references) are warned about after a full
default-out run — they never fail a build; the reverse direction (markdown
referencing a missing file) fails `tests/unit/docsAntiRot.test.ts`.

## Troubleshooting

**Symptom:** a scenario fails to start — Vite can't bind `:5199` (`--strictPort`
error), or the API server on `:3001` never comes up — even though no capture run
is currently active. `run.js` checks for this before every scenario and exits
with this same guidance instead of a bare Playwright/Vite stack trace.

**Check:** `lsof -i :3001 -i :5199` (or `pgrep -f "vite --port 5199"` /
`pgrep -f server/index.js`) to see what's still bound.

**Remedy:** kill only processes you can attribute to a previous tutorial/docs-capture
run in this repo — the command line will mention this repo's path, e.g.
`.../node_modules/.bin/vite --port 5199 --strictPort` — then rerun.

**Root cause (historical — fixed):** `tutorial/lib/servers.js` used to spawn Vite
via `npx` and call `stop()` on that single handle; `npx` interposes a wrapper
process whose actual Vite child was never covered by that kill, so it survived
indefinitely and kept `:5199` bound across runs. It's now fixed at the source —
both children are spawned `detached: true` and `stop()` kills each one's whole
process group (`process.kill(-pid, 'SIGKILL')`), which reaps Vite's real process
(and npx's wrapper) along with it. This pre-flight check stays in place for the
case that's left: a genuinely unrelated process (not started by this pipeline)
already sitting on `:3001`/`:5199` — it retries for a few seconds first, since a
port can take a brief moment to release after `stop()` even when nothing is
actually leaking.
