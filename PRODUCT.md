# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PDF Architect primarily serves individual makers building large, navigable PDF documents: digital planners, interactive notebooks, reports, learning materials, and documents for e-ink tablets. Optional gallery, fork, merge-request, and moderation workflows also support sharing and collaboration.

## Product Purpose

PDF Architect lets makers design complex interlinked documents without manually laying out hundreds of pages. Success means users can model document structure, reuse designs, generate linked pages, and export usable PDFs while retaining control of local work.

## Positioning

PDF Architect separates hierarchical document structure (Nodes) from reusable page design (Templates). Data binding, dynamic grids, contextual links, variants, and optional scripted generation turn that model into device-specific, navigable PDFs.

## Operating Context

Users create or import projects, build node hierarchies and templates, edit a visual canvas, preview variants, optionally generate structures with scripts, and export PDFs in the browser. Common targets include A4, A5, reMarkable, Boox, and iPad dimensions. Accounts and cloud/gallery workflows are optional rather than prerequisites for local editing.

## Capabilities and Constraints

- React and TypeScript browser SPA with client-side PDF export.
- Local-first editing must work without an account. Cloud saves and publishing are explicit user actions, never silent synchronization or overwrite.
- Local persistence must not silently lose, replace, skip, or partially migrate document-bearing data. Unresolved authority or storage recovery blocks editing.
- Projects may include complete document state, generator source, variants, cloud linkage, revisions, custom presets, and pending imports.
- Cloud validation and quota limits remain independent from local persistence.
- Pricing, production URL, release maturity beyond current beta copy, and commercial model are undecided.

## Brand Commitments

- Primary product name: PDF Architect.
- Voice is direct, maker-oriented, and technically precise.
- Existing layered-square mark and Lucide icon language are established assets.
- Some sample content uses the Doctect name; its relationship to PDF Architect remains undecided and must not be reinterpreted without confirmation.

## Evidence on Hand

- Product overview and workflows: `README.md`.
- Product routes and roles: `App.tsx` and `docs/8-cloud-and-gallery.md`.
- Real walkthrough media: `public/walkthroughs/`.
- Editor, gallery, and generator documentation assets: `public/docs-assets/`.
- Real generated examples across twenty use cases: `gallery-samples/README.md`.
- No validated pricing, production-domain, testimonial, benchmark, or formal user-research evidence is present; future work must not fabricate it.

## Product Principles

1. Users retain authority over local documents; ambiguous storage state never chooses a winner silently.
2. Separate structure from presentation so large document systems remain reusable and manageable.
3. Make durable actions truthful and explicit: saved, published, imported, or recovered only after successful persistence.
4. Keep local creation useful without an account while making collaboration optional and intentional.
5. Preserve complete document meaning across migrations, variants, generation, export, and recovery.

## Accessibility & Inclusion

Existing product behavior supports keyboard shortcuts, semantic controls and dialogs, labeled interactive elements, and reduced-motion handling. Formal conformance target remains undecided; new work must preserve or improve current keyboard, focus, announcement, and reduced-motion behavior.
