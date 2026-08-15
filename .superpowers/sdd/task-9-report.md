# Task 9 Report: Generated-Project Pending UX

## Status

Complete. Generated-project naming now stays open through durable persistence, rejects duplicate submissions, disables dismissal and editing while pending, and closes only after confirmed success.

## Implementation

- Added an immediate ref-backed submission lock plus rendered `creating` state to the naming dialog.
- Disabled project-name, Cancel, and submit controls while pending; changed submit copy to `Creating…`; exposed pending state with `aria-busy` and a live button label.
- Ignored repeat form submissions and Escape dismissal while creation is pending.
- Normalized both `false` results and rejected durable writes to `Could not create project. Your current project is unchanged. Try again.`
- Preserved entered name, generated preview, immutable source payload, and generator drafts after failure. Successful creation still closes both modal layers only after the durable callback resolves `true`.

## TDD Evidence

- RED command: `npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx`
- RED result: 4 expected failures and 47 passes. Failures proved missing pending controls/label, stale error copy, unhandled durable rejection, and rejected hierarchy callbacks escaping instead of returning `false`.
- GREEN result: same exact focused command passed 51/51 tests across 5 files.
- Added deferred pending, duplicate-submit, disabled-control, Escape, success-close, false-result, rejection, retained-name, retained-preview, and exact-source/draft assertions.
- Existing focused regressions remain green for generated IDs and names, exact generator source, schema, cloud detachment, revision, history/export behavior, source isolation, and analytics after durable success.

## Detector

- Ran the required detector exactly once over `components/GeneratorVisualPreviewModal.tsx` and `components/HierarchyGeneratorModal.tsx` after UI edits.
- It reported two incumbent false positives in `HierarchyGeneratorModal.tsx`: `border-r-4` is the divider between code-editor panes, not a side-tab card accent; the word-wrap ternary never renders `text-slate-500` on `bg-indigo-50` because those classes belong to opposite branches.
- No valid detector-driven edit was required. Detector was not rerun.

## Verification

- Focused suites: 5/5 files and 51/51 tests passed.
- Full Vitest run, exactly once: 220/220 files and 2,296/2,296 tests passed in 37.82 seconds. Known moderation timeout did not occur.
- Production build: passed after transforming 2,448 modules in 11.98 seconds. Existing large-chunk warning remains.
- `npx tsc --noEmit`: only the known five unrelated baseline diagnostics remain: one in `changePassword.test.tsx`, three in `loginEmailVerification.test.tsx`, and one in `svgEditing.test.ts`.
- `git diff --check`: passed.

## Review

- Standards axis: no repository standards file exists; no blocking Fowler-baseline smell found.
- Spec axis: no missing, partial, incorrect, or out-of-scope behavior found against the Task 9 brief.

## Concerns

- Five unrelated TypeScript baseline diagnostics remain unchanged.
- Build retains its existing large-chunk warning.
- Existing React Router future-flag warnings remain in test output.

## Accessibility Focus Fix

### Implementation

- Moved focus synchronously to the focusable naming dialog before pending state disables the active input or submit control.
- Kept pending Tab events on that stable dialog through the existing zero-focusable-control trap.
- Extended the naming layout focus effect so `false` and rejected writes restore focus to the enabled project-name input without changing its retained value.
- Preserved pending Escape/cancel lock, success-only close, and exact failure copy.

### TDD Evidence

- RED command: `npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx`
- RED result: 4 expected failures and 42 passes across 2 files. Focus remained on the disabled submit button while pending and on the re-enabled submit button after both `false` and rejection.
- GREEN command: `npx vitest run tests/unit/GeneratorVisualPreviewModal.test.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/EditorPageGeneratedProject.test.tsx tests/unit/ProjectEditor.generatorHistory.test.tsx tests/unit/ProjectEditor.exportAllVariants.test.tsx`
- GREEN result: 53/53 tests passed across 5 files.
- Detector was not rerun, as required for this follow-up.
