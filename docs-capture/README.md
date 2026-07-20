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

Orphan assets (files no markdown references) are warned about after a full
default-out run — they never fail a build; the reverse direction (markdown
referencing a missing file) fails `tests/unit/docsAntiRot.test.ts`.
