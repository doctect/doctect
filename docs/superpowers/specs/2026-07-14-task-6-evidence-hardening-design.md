# Task 6 Evidence Hardening Design

**Goal:** Replace indirect browser-only assertions with server-observed security evidence and authoritative cloud-state comparisons.

## Architecture

Tests own a loopback Node HTTP marker server on an ephemeral port. Generator attack/trap scripts use absolute marker URLs; assertions inspect requests recorded by the server, not Playwright request events. A test-scoped fixture guarantees server cleanup after failures.

Editor panes expose stable `data-testid="project-pane"` and `data-active` attributes. Tests locate the active pane through those attributes rather than Tailwind implementation classes.

Cloud persistence checks authenticate a new browser context, read project metadata and HEAD commit from API, and compare authoritative state. Merge-request verification captures the fork HEAD before MR creation and target HEAD after merge, then compares `nodes`, `rootId`, `variants`, `activeVariantId`, and `generator` deeply.

## Security Fixtures

Sandbox isolation uses explicit one-page template/hierarchy scripts. Dynamic-import and timeout tests first apply this fixture, capture generated document/provenance state, run the failing preview, then compare state exactly.

Gallery publication first creates valid generated output, then seeds metadata with a source trap that attempts a marker signal and throws unconditionally if executed. Opening, reloading, and forking must display that source with Apply disabled, no preview/error state, and no server-recorded signal.

## Verification

TDD starts with a failing unit test for marker-server hit recording and a failing browser selector assertion before production pane attributes exist. Focused Chromium suites run before commit. Final verification runs all unit tests, production build, and complete installed Chromium/Firefox browser projects. Missing WebKit remains explicitly unrun.

## Constraints

- Preserve cross-origin conditional-publish CORS behavior.
- Keep `.superpowers/sdd/task-6-report.md` ignored and workspace-only.
- Do not modify progress ledger.
- Remove temporary Playwright config, databases, marker listeners, and output artifacts.
