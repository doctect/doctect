# PDF Architect Favicon Design

**Date:** 2026-08-22
**Status:** Approved

## Goal

Add a browser favicon that preserves PDF Architect's established layered-square brand mark and remains legible at tab size.

## Design

- Use a standalone SVG favicon in `public/favicon.svg`.
- Draw a Tailwind blue-600 (`#2563eb`) rounded square with transparent outer corners.
- Center a white three-layer mark based on the Lucide `Layers` icon used by landing and shared headers.
- Slightly strengthen the icon stroke for clarity at 16px while preserving its recognizable geometry.
- Retain the complete relevant Lucide ISC and Feather MIT copyright and permission notices in one non-rendering XML comment inside the SVG.
- Omit text, gradients, shadows, animation, and unrelated branding changes.
- Reference the SVG explicitly from `index.html` with `rel="icon"` and `type="image/svg+xml"`.

## Scope

- Add favicon asset.
- Add document metadata reference.
- Add a regression test proving metadata and asset contract.
- Leave the editor header's differing solid-square mark unchanged.

## Verification

- Validate exact favicon metadata, SVG element structure and geometry, forbidden rendered constructs, and embedded license notices through an automated test.
- Run focused test coverage, TypeScript checks, production build, and the required Impeccable detector pass.
