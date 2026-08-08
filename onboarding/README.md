# Dev Onboarding Playground

`index.html` is a self-contained, committed page that onboards a new developer:
a tmux-styled UI with an intro (generated vitals + the house method), six guided
data-flow tours, an annotated file tree with deep dives, and a playground —
quiz ladder, bug hunt, merge lab (running the real bundled `shared/diff.js`),
and a file-finding game. Open it by double-clicking; it works over `file://`,
offline, with zero dependencies.

## Regenerate

    node onboarding/build.mjs

Rerun after meaningful repo changes (same policy as `docs-capture/`): the tree,
vitals, code excerpts, and the diff-engine bundle are read from the working
checkout at build time. The footer of the page records when and from which
commit it was built. Commit the regenerated `index.html`.

## What guards it

`tests/unit/onboarding/` (part of `npm test`):
- every file path referenced by any content module exists;
- every code-excerpt anchor resolves uniquely (the build also fails on rot);
- quiz/bug/wdil data shapes are valid (exactly one right answer, stories told);
- the bundled diff engine is behavior-identical to the real ESM module
  (parity fixtures), so the Merge Lab can never drift from what the server enforces.

There is deliberately no freshness test — regeneration is manual. If the page
looks stale, it is: rebuild it.

## Authoring

Source lives in `src/` (ESM; single-line imports; `export const/function` only —
the bundler strips module syntax by line). Content modules are data-only and
JSON-serializable. Validators: `src/content/validate.mjs`.
