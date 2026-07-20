---
title: Variants, SVG Artwork, JSON Inspector, and Export
difficulty: intermediate
time: 14 min
summary: Multi-device variants with real unit conversion, vector artwork, low-level JSON access, presets, and PDF export options.
keywords: variants, device sizes, svg, import, json, inspector, export, greyscale, preset, units, remarkable, a4
prerequisites: editor/elements-and-properties
---

The tutorials so far have stayed inside one page size, one project tab, and the editor's visual controls. This one collects the machinery around all of that: **variants**, which print the same planner at reMarkable size and A4 without maintaining two projects; the page-size controls and their unit selector, which genuinely converts; **SVG artwork** as a first-class element with its markup editable in place; the **JSON inspector**, the escape hatch when a change is easier to type than to click; **presets** and the project tab bar; and finally the **Export PDF** button itself, with its greyscale mode and its per-variant behavior. Each section stands alone — jump to the one you came for.

## Variants: one hierarchy, many devices

A variant is a complete, independent set of templates for one target page size. The project keeps exactly one node hierarchy — one tree of pages, one set of data fields, built the way [Data Binding](/docs/editor/data-binding) describes — and each variant re-expresses how those same pages *look*: its own copy of every template, usually at a different size. Edit a template in one variant and no other variant moves; add or rename a node and every variant sees it, because nodes aren't per-variant at all.

The controls live at the top of the sidebar's **Templates** mode, in the tinted bar above the template list: a dropdown naming the active variant, then pencil (rename, inline — Enter commits, Escape cancels), copy (duplicate), trash (delete — only shown once a second variant exists, and the last one can never be deleted), and **+** (new variant).

![The variant bar at the top of the Templates-mode sidebar, with the active variant's dropdown and its rename, duplicate, delete, and add buttons](/docs-assets/editor/variant-dropdown.png "Templates mode's top bar: every template listed below it belongs to the variant selected here")

The multi-device workflow runs top to bottom through that bar:

1. **Design once.** Build the whole project in a single variant at your primary device's size.
2. **Add the second device.** Click **+**. The New Variant dialog asks for a name and a target size — the same device preset list as Template Settings, or custom dimensions — and creates the variant by *copying every template* from the active one, reflowed to the new size (with the same Auto-Reflow and Scale Typography toggles the next section explains). The copy button next to it is the no-questions version: an exact same-size duplicate, named "(Copy)".
3. **Tweak what didn't survive.** The new variant is now active; the canvas and template list show its copies. Fix whatever the automatic reflow got wrong — the originals are untouched, and switching back is just the dropdown.
4. **Export.** The main export button prints the *active* variant; **Export All Variants** prints every one. Both are covered in [Exporting](#exporting) below.

Switching variants in the dropdown also switches which template is selected — you land on the new variant's first template with nothing selected, so a stale element selection can't carry across.

> [!NOTE]
> Duplicating a variant copies templates only, because templates are all a variant owns. There is no "day 3 in the A4 variant" as a separate page — there's one January 3 node, and each variant's Day View template renders it at its own size. That's the entire point: notes structure, data, links, and references stay identical across devices by construction.

## Page dimensions and units

Select any template in Templates mode and the right panel's **Template Settings** section holds the page size controls: a preset dropdown (A4, Letter, Legal, A5, then e-ink devices grouped by screen size — reMarkable, Boox, Supernote, Kindle Scribe), Width and Height inputs with a unit selector, and Portrait/Landscape buttons that swap the two.

The unit selector — **pt / px / in / mm** — converts; it doesn't relabel. Templates are stored in points, and the other units re-express that same physical size: 1 inch is 72 pt, 1 mm is about 2.835 pt, and px is treated 1:1 with pt. Switch an A4 page from pt to mm and the fields change from 595.28 × 841.89 to 210.001 × 297 (that stray thousandth is just display rounding) — the page itself hasn't moved a hair. Type a value in any unit and it converts back on entry, so "make it exactly 210 mm wide" is: pick mm, type 210.

Two toggles below the size fields govern what happens to *content* when the size changes:

- **Auto-Reflow Elements** — on by default. Every element scales proportionally to fit the new dimensions; off, elements keep their absolute positions and sizes (a page shrunk around them will clip them).
- **Scale Typography** — only offered while Auto-Reflow is on. Font sizes and stroke widths scale along with the layout; off, a reflowed layout keeps its original type sizes.

These same two toggles appear in the New Variant dialog, doing the same job on every template at once.

## SVG artwork

Vector artwork enters through the toolbar: after the shape tools from [Canvas Basics](/docs/editor/canvas-basics) sits an image icon with a small chevron — the SVG menu, with two entries. **Import SVG file…** opens a file picker; the file's own size (from its `viewBox`, or width/height attributes) sets the element's shape, scaled down if needed so it lands fitting comfortably within the page. **Insert placeholder SVG** skips the file dialog and drops a small indigo rounded square — a stub whose whole purpose is to be rewritten in the source editor below. Either way the new element arrives selected, on the active layer from [Layers](/docs/editor/layers), with the Select tool ready.

An SVG element is a first-class citizen: move it, resize it, rotate it, restack it, copy and paste it, exactly like a rectangle. What no other element has is the **SVG Source** section in its properties panel — the raw markup in an editable text area:

![The SVG Source section in the properties panel, showing an SVG element's markup in an editable text area with a size readout below](/docs-assets/editor/svg-source-section.png "The markup is the element: edits re-render on the canvas a beat after you stop typing")

Edits apply live, about half a second after you pause typing, and one editing burst counts as one undo step. If an edit breaks the markup, the canvas simply keeps showing the last valid version while a red note under the text area says so — you can't wreck the element by half-finishing a tag. The size readout below turns amber past 100 KB, the same threshold the import warns at, because the markup is stored inside your project file and a heavy illustration bloats it.

> [!NOTE]
> SVG markup is sanitized at render time: scripts, event handlers, and anything else executable are stripped before the browser ever sees it. Artwork pasted from the web — or arriving in a forked gallery project — draws its shapes and nothing more.

On export, SVG elements are re-emitted as true vectors in the PDF — paths stay paths, crisp at any zoom, not screenshots of the canvas.

> [!WARNING]
> The canvas preview is your browser rendering the SVG; the PDF is a vector converter rebuilding it shape by shape. Plain paths, shapes, gradients, and text convert faithfully, but the exotic end of the spec — filter effects, masks, embedded raster images — may come out different or not at all. If your artwork leans on those, export a test PDF early rather than discovering it on the final one.

## The JSON inspector

Everything the editor edits — nodes, variants, templates, every element — is one JSON document, and the **JSON** button in the editor's top bar (next to Undo/Redo) opens it directly. The Project JSON Editor has two modes, switchable from its header.

**Visual mode** is a browsable tree, organized the way the project actually is: a **Nodes** section (with an Add Node button), a **Variants** section (Add Variant, plus a per-variant Add Template, with the active variant badged), and everything else under Other Settings. Expand any item to edit its values in place, add properties, or delete entries — useful for surgical edits the panels don't expose, like fixing a typo'd data field key.

![The Project JSON Editor open in visual mode over the planner, with the root node expanded in the Nodes section to show its editable properties](/docs-assets/editor/json-inspector.png "Visual mode: expand a node and its properties become editable rows — the Variants section and everything else sit further down the same tree")

**Text mode** is the same document as raw JSON in a text area, with a Format button and Tab indenting. This is the bulk-edit surface: select all, copy, and the entire project is on your clipboard.

The two modes stay honest with each other: switching visual → text just serializes, but text → visual validates first and refuses to switch while the JSON doesn't parse — visual mode never renders a broken document.

Nothing you do in either mode touches the open project until you commit it. Edits accumulate in the modal's own working copy; **Cancel** (or the X) throws that copy away. **Apply Changes** validates the document — it must still have its nodes, root, and variants — runs it through the same loader and schema migration that opens any project file (surfacing warnings if anything had to be repaired), and lands the whole thing as **one undo step**: if the result isn't what you wanted, a single Ctrl+Z restores the entire pre-Apply project.

> [!TIP]
> For a rename across hundreds of nodes — a data field key, a template id in every link — round-trip through your own editor: Text mode, copy everything out, run the find-and-replace where find-and-replace is good, paste it back, Apply. Pasting the copy into a file first also makes it a free backup; the JSON that came out is a complete project, and pasting it back over a wrecked one is a full restore.

## Presets and project tabs

When a project's layouts are worth reusing — your grid system, your fonts, your nav bar from [Linking](/docs/editor/linking) — save the whole thing as a starting point. **Save Preset**, the amber button at the toolbar's right end, asks for a name and description, then files the current project as a card in the **New Project** dialog, right alongside the built-ins you met in [Your First Document from a Preset](/docs/getting-started/first-project-from-preset). Every project created from it is a deep, independent copy — migrated forward automatically if the app's format has moved on since you saved — so nothing you do in the new project can reach back into the preset, or into any sibling created from it.

> [!NOTE]
> Custom presets live in this browser's local storage: they survive reloads, but they don't follow you to another machine and they vanish with cleared site data. To move a design between machines or people, export the project itself as JSON — the inspector's Text mode, or the download offered when closing a tab — and import it on the other side.

New Project is also where the **tab bar** comes in: every open project is a tab across the top, and the **+** at the end of the strip opens that same dialog. Tabs are fully live — every open project stays mounted, so switching tabs is instant and loses nothing: undo history, zoom, active tool, and selection are all exactly where you left them when you come back. A tab's title is the project's root page title — rename the root node in Hierarchy mode and the tab renames itself. Open projects autosave to the browser and are restored on the next visit.

Hovering a tab reveals its close button. Closing asks first, and the dialog's **Save and Close** option downloads the project as a JSON file on the way out — worth taking, since closing removes the project from the browser's storage. Closing the last tab leaves you with a fresh blank project rather than an empty window.

## Exporting

The export controls sit at the top bar's right end: a contrast-circle **greyscale toggle**, then a split button — **Export PDF**, and a narrower **All** half beside it.

**Export PDF** prints the *active variant*: one PDF page per node in hierarchy order, rendered through that variant's templates, with the internal links from [Linking](/docs/editor/linking) baked in as real PDF navigation. [Reference nodes](/docs/editor/references-and-referrer-formulas) are skipped, as that tutorial explains — one page per real node. The button reads "Generating…" while it works, and the downloaded file is tagged with the variant's name.

**Export All Variants** — the **All** half, enabled once the project has two or more variants — runs that same export once per variant. The result is **separate downloads, one PDF per variant**, each tagged with its variant's name; nothing is merged into a single document, which is exactly what a multi-device project wants: the reMarkable file for the reMarkable, the A4 file for the printer. Its tooltip says so: "Export All Variants (one PDF per variant)".

The greyscale toggle is for e-ink: most of these devices render greys, and a design that leans on color contrast can flatten into mush on screen. Toggle it on and two things happen. The export converts every color to its grey equivalent — fills, strokes, text, patterns, and SVG artwork alike. And the *canvas preview desaturates immediately*, so you can audit the grey version live before committing to an export — selection outlines and handles stay blue, since they're editor chrome, not page content:

![Toggling the greyscale export switch desaturates the canvas preview live while the selected element's blue selection chrome stays colored](/docs-assets/editor/clip-greyscale-toggle.webp "The toggle previews exactly what the PDF will do: page content goes grey, editor chrome doesn't")

If two colors become indistinguishable greys here, they'll be indistinguishable on the device — swap one for a different *lightness*, not a different hue, and the toggle will show you the fix working.

One project, one tree of pages — and from here, as many devices, starting points, and greyscale proofs of it as you need.
