# Static Policy Symbol Resolution Design

## Goal

Close three remaining Critical gaps in the local-workspace static boundary: lexical alias identity, statically reconstructed legacy-key access, and `.mts`/`.cts` coverage. Keep policy implementation test-local and preserve the exact two-file legacy-access allowlist.

## Scope

- Modify `tests/unit/localWorkspaceBoundary.test.ts` and Task 12 evidence only.
- Keep `services/localWorkspace/legacyTypes.ts` and `tests/e2e/fixtures/localWorkspaceMigration.js` as the sole legacy-key access allowlist.
- Do not change production behavior, browser tests, or the magic-read Minor.

## Architecture

Analyze script inputs through a batched in-memory TypeScript `Program`. Use `TypeChecker` symbols as binding identities so nested declarations with the same text remain independent. Repository analysis builds one program for all scanned scripts; adversarial tests use the same path with one virtual input.

Record each symbol's possible origins from initialized declarations, object destructuring, identifier assignments, and destructuring assignments. Every origin carries its source position. Resolution at a use site includes all possible origins established before that site and recursively evaluates aliases at their capture position. Reassignment never erases an earlier possible origin, but assignments after a call cannot taint that earlier call.

Unbound `window`, `globalThis`, `self`, `localStorage`, and `require` identifiers represent globals. Lexically declared identifiers with those names resolve through their symbols instead.

## Static Values

Static strings resolve to candidate sets rather than one value. Supported forms are string literals, no-substitution templates, constants, concatenation, and templates whose substitutions resolve statically. Candidate sets preserve every prior possible assignment value.

Member and callable resolution supports property access, computed access, object destructuring, aliases, bound methods, and `.call`/`.apply`. The same symbol-origin engine resolves localStorage receivers, callable methods, require aliases, property names, and key arguments.

## Legacy-Key Policy

Outside the exact two-file allowlist, inspect localStorage `getItem`, `setItem`, and `removeItem` calls. For direct or bound calls, the key is argument zero. For `.call`, the key follows the explicit receiver. For `.apply`, the key is the first element of a statically resolvable argument array. Reject the call if any resolved key candidate equals an epoch-1 legacy document key. Preference keys remain legal.

Contiguous legacy-key text scanning remains as defense in depth. New argument analysis catches keys reconstructed from fragments where the literal never appears contiguously.

## Extensions

Add `.mts` and `.cts` to scanned source extensions. Preserve their filenames in the TypeScript program and parse both as TypeScript source, allowing the compiler to retain module-format semantics from the extension.

## Testing

Add adversarial RED cases for:

- Outer and inner shadowing without cross-symbol overwrite.
- Later nested declarations that reuse alias text.
- Taint-preserving reassignment before a call and ignored reassignment after a call.
- Receiver, callable, destructuring, require, and static-string alias chains.
- Concatenated, templated, and constant legacy keys through direct, computed, destructured, bound, `.call`, and `.apply` invocations.
- Allowed preference literals through the same invocation forms.
- Import and mutator violations in both `.mts` and `.cts`.

Verification order: boundary RED, implementation, boundary GREEN, full Vitest, TypeScript, production build. Supported-host E2E is unchanged because no production code changes.

## Failure Behavior

Parse diagnostics remain violations. Unresolved dynamic values do not produce speculative legacy-key findings, but every statically resolved candidate is checked. Cyclic alias graphs terminate through symbol-and-position guards.
