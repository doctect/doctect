---
title: Export PDF
summary: The Export PDF split button prints the active variant as one PDF page per node; the All half prints every variant as separate PDFs, one per variant.
aliases: download pdf, generate, export, export pdf
keywords: export pdf, export, download pdf, generate, all variants, export all variants, one pdf per variant, pdf navigation, reference nodes, greyscale
---

The export controls sit at the top bar's right end: a [greyscale toggle](/docs/reference/greyscale-export), then a split button — **Export PDF** and a narrower **All** half beside it. **Export PDF** prints the *active* [variant](/docs/reference/variants): one PDF page per node in hierarchy order, with the internal links baked in as real PDF navigation and reference nodes skipped (one page per real node). The button reads "Generating…" while it works, and the downloaded file is tagged with the variant's name.

**Export All Variants** — the **All** half, enabled once the project has two or more variants — runs that same export once per variant. The result is **separate downloads, one PDF per variant**, each tagged with its variant's name; nothing is merged into a single document, which is exactly what a multi-device project wants — the reMarkable file for the reMarkable, the A4 file for the printer.

See [Exporting](/docs/editor/variants-svg-json-export#exporting).
