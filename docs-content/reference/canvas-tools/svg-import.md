---
title: SVG Import
summary: Bring your own vector artwork onto the canvas through the toolbar's SVG Tools menu.
aliases: vector, artwork, logo, import svg
keywords: svg, vector, artwork, logo, import, placeholder, markup, source, sanitize
---

Vector artwork enters through the **SVG Tools** button — an image icon with a chevron, just past the shape tools in the [toolbar](/docs/editor/canvas-basics#the-toolbar) (it has no keyboard shortcut). Its two-item menu offers **Import SVG file…**, which opens a file picker and sizes the element from the file's own `viewBox` (scaled down to fit the page if needed), and **Insert placeholder SVG**, which drops a small indigo rounded square to rewrite yourself. Either way the element arrives selected, on the [active layer](/docs/reference/active-layer), with the Select tool ready.

An SVG element behaves like any other — move, resize, rotate, restack, copy — but adds an **SVG Source** section in its properties panel: the raw markup in an editable text area. Edits re-render about half a second after you pause typing; broken markup keeps the last valid render with a red note rather than wrecking the element. The size readout turns amber past 100 KB, because the markup is stored inside your project file.

Markup is sanitized (scripts and event handlers stripped) at render time, and on export SVGs are re-emitted as true vectors — though exotic features (filter effects, masks, embedded rasters) may convert imperfectly, so test-export early. See [SVG artwork](/docs/editor/variants-svg-json-export#svg-artwork).

![The SVG Source section in the properties panel, showing an SVG element's markup in an editable text area](/docs-assets/editor/svg-source-section.png "The markup is the element — edits re-render on the canvas a beat after you stop typing")
