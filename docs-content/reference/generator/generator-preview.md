---
title: Generator Preview
summary: Runs both scripts in a sealed 10-second sandbox and shows one rendered card per template — the safe dry run that never touches your project.
aliases: visual preview, unused badge, sandbox, preview
keywords: preview, previewing, view preview, sandbox, 10 seconds, CSP, unused badge, load more, generator, dry run
---

The green **Preview** button runs both scripts and produces **only a preview** — never a change to your project. While it works the button reads **Previewing…**; on success the **Generated Project Preview** opens with one card per template, each rendered live against the first real page that uses it, plus variant/template/node/page counts. Because the result is cached, the button then reads **View Preview** and reopens it without re-running; edit either script and the stale result is dropped, returning the button to **Preview**.

Your code runs in a **disposable sandbox** — a hidden iframe with a no-network CSP, inside a throwaway Web Worker where `fetch`, `localStorage`, and friends are blanked — capped at **10 seconds** (an infinite loop fails with "Generator exceeded the 10000 ms execution limit" rather than freezing the app). A template no node uses still gets a card, drawn with placeholder data and an amber **Unused** badge — the cheapest detector for a misspelled `type`. Large projects load **24 cards** at a time behind a **Load more** button.

See [Run and preview](/docs/generator/generator-basics#run-and-preview).
