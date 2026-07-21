---
title: Variants
summary: One node hierarchy, many device sizes — each variant is an independent set of templates for one target page size, and export produces one PDF per variant.
aliases: device sizes, a4, remarkable, ipad, multi-device, variant
keywords: variants, variant, device sizes, a4, letter, remarkable, boox, supernote, kindle scribe, ipad, e-ink, export all variants, auto-reflow, scale typography, add variant
---

A **variant** is a complete, independent set of templates for one target page size. The project keeps exactly one node hierarchy — one tree of pages and [data fields](/docs/reference/data-binding) — and each variant re-expresses how those same pages *look* at its own size. Edit a template in one variant and no other moves; add or rename a node and every variant sees it, because nodes aren't per-variant at all. The controls live in the tinted bar atop the sidebar's **Templates** mode: a dropdown for the active variant, then rename (pencil), duplicate (copy), delete (trash — hidden until a second variant exists; the last one can never be deleted), and **+** (new variant).

**+** opens the New Variant dialog (name + target size) and creates the variant by *copying every template* from the active one, reflowed to the new size via the **Auto-Reflow Elements** and **Scale Typography** toggles. Switching variants also clears the element selection, landing you on the new variant's first template so a stale selection can't carry across. On export, the main button prints the active variant; [Export All Variants](/docs/reference/export-pdf) prints every one — separate downloads, one PDF per variant, never merged into a single document.

See [Variants: one hierarchy, many devices](/docs/editor/variants-svg-json-export#variants-one-hierarchy-many-devices).
