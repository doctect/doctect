---
title: Greyscale Export
summary: The contrast-circle toggle converts every exported color to its grey equivalent and desaturates the canvas preview live — built for e-ink devices that render greys.
aliases: grayscale, black and white, e-ink, greyscale, desaturate
keywords: greyscale, grayscale, black and white, e-ink, eink, desaturate, contrast, export, preview, lightness, remarkable, boox
---

The **greyscale toggle** — the contrast-circle icon beside the [Export PDF](/docs/reference/export-pdf) button — is for e-ink. Most of those devices render only greys, and a design that leans on color contrast can flatten into mush on screen. Toggle it on and two things happen: the export converts every color to its grey equivalent — fills, strokes, text, patterns, and SVG artwork alike — and the *canvas preview desaturates immediately*, so you can audit the grey version live before committing to an export. Selection outlines and handles stay blue, because they're editor chrome, not page content.

The live preview is the whole point: if two colors become indistinguishable greys on the canvas, they'll be indistinguishable on the device — fix it by swapping one for a different *lightness*, not a different hue, and the toggle shows the fix working.

See [Exporting](/docs/editor/variants-svg-json-export#exporting).
