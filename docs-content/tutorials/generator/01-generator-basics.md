---
title: Generator Basics
difficulty: intermediate
time: 10 min
summary: Build documents in code — the two-script model, the sandboxed preview, and how generated projects are applied and saved.
keywords: generator, script, hierarchy generator, sandbox, preview, create as new, replace, provenance
prerequisites: editor/data-binding
---

Everything in the Editor track happens one click at a time: draw a box, bind a field, wire a link. This track is about the other way to build a project — writing two short JavaScript programs and letting PDF Architect turn them into templates and pages for you. This first tutorial covers the whole loop end to end: what each script returns, where your code actually runs (and why it can't touch anything), what the visual preview shows before you commit, the two ways to apply a result, and what happens to the scripts themselves after you do. By the end you'll have run a real generator — the same fifteen-line pair this page embeds below.

## Why generate

The 2026 Planner preset from [Your First Document from a Preset](/docs/getting-started/first-project-from-preset) contains 365 day nodes, each carrying the thirteen data fields you met in [Data Binding](/docs/editor/data-binding) — plus quarters, months, a parallel week structure built from [reference nodes](/docs/editor/references-and-referrer-formulas), a hundred numbered notes pages, and a hundred to-do lists. Nobody clicked that together. 365 pages is not 365 clicks; it's a `for` loop. The planner's entire structure is the output of a generator script — and that exact script ships inside the app, as the **2026 Planner** preset in the modal you're about to open.

![Automated generation](/walkthroughs/automated_generation.webp "The generator building a full project from a script")

That's the trade the generator offers: anything repetitive, dated, numbered, or cross-linked that would be miserable to build by hand becomes a few lines of code — and anything the code *doesn't* need to produce, like fine visual design, you leave to the canvas afterwards. The two workflows meet in the middle: generate the structure, then polish the templates with every tool the Editor track taught you.

## The two scripts

Open any project and click the purple [**Generator** button](/docs/reference/generator-overview) in the editor toolbar (its tooltip reads "Generate Hierarchy via Script"). The **Hierarchy Generator** modal opens on two side-by-side code editors, and the split between them is the whole mental model:

![The Hierarchy Generator modal with the Define Templates and Build Hierarchy panels side by side, a preset selector, and the Preview button](/docs-assets/generator/modal-two-scripts.png "Two scripts, one project: layouts on the left, pages on the right")

[**1. Define Templates**](/docs/reference/templates-script), on the left, is a script that must `return` a plain object mapping template ids to template objects — each with an `id`, a `name`, a `width` and `height`, and an `elements` array of the same rects, text boxes, grids, and SVG shapes you've been editing in [Element Properties](/docs/editor/elements-and-properties) all along. Four page-size constants are pre-injected as bare identifiers: `RM_PP_WIDTH` (509) and `RM_PP_HEIGHT` (679) for reMarkable Paper Pro, `A4_WIDTH` (595.28) and `A4_HEIGHT` (841.89) for A4. A template can also return a full multi-device structure — `{ variants, activeVariantId }` — but a flat map is automatically wrapped in a single variant named Default, so you can ignore [variants](/docs/editor/variants-svg-json-export) entirely until you need them.

[**2. Build Hierarchy**](/docs/reference/hierarchy-script), on the right, is a second, independent script that must `return { nodes, rootId }`: an object of node objects keyed by id, plus the id of the root. Each node is exactly what Hierarchy mode shows in the sidebar — `id`, `parentId` (`null` for the root), a `type` naming which template renders it, a `title`, a `data` object of the fields your `{{placeholders}}` bind against, and a `children` array of ids. Two helpers are pre-injected here: `templates`, the (already normalized) object your first script returned, and `createId('prefix')`, which mints unique node ids.

The two scripts run as separate functions with separate scopes — the [size constants](/docs/reference/generator-constants) don't exist in the hierarchy script, and `createId` doesn't exist in the templates script. Template ids are stable strings you choose yourself, because the hierarchy's `type` fields have to name them.

> [!TIP]
> A template's `elements` can be an empty array `[]`. That's a deliberate workflow, not a degenerate case: generate the *structure* — hundreds of pages, correct data fields, working links — and design each template visually afterwards on the canvas. And if you'd rather not write either script by hand, the **LLM Helper & Schema Documentation** panel at the bottom of the modal contains a copy-paste prompt that teaches any chatbot the full schema, plus a reference table of every template and node property.

The **Preset:** selector in the header loads working starting points — **Blank**, **Simple Book** (what a fresh modal opens on), **Notebook**, and the full **2026 Planner** — and **Reset** returns to whichever preset you picked. Elements may omit their `id`s; the generator fills in any that are missing.

## Run and preview

The green **Preview** button runs both scripts. What it will never do is touch your project: the only thing a run produces is a preview.

> [!NOTE]
> Your code executes in a disposable sandbox, not in the app: a hidden iframe whose Content-Security-Policy allows no network at all, running the scripts inside a throwaway Web Worker where `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `indexedDB`, and friends are explicitly blanked out. Each run gets a fresh sandbox, torn down afterwards. Execution is capped at a fixed **10 seconds** — an infinite loop fails with "Generator exceeded the 10000 ms execution limit" rather than freezing the app — each script may be at most 512 KiB (1 MiB combined), and the returned values must be plain JSON data: no functions, no cycles, nothing clever.

While the sandbox works, the button reads **Previewing...**. If either script throws, returns the wrong shape, or points a node at a template id that doesn't exist, the error appears in red next to the button and nothing else happens — fix the script and press **Preview** again. On success, the [**Generated Project Preview**](/docs/reference/generator-preview) opens:

![The Generated Project Preview showing variant and node counts, a variant tab, and a rendered template card with its usage count](/docs-assets/generator/visual-preview.png "One card per template, rendered against a real generated page — counts across the top, apply buttons below")

The header counts what the run produced — variants, templates, nodes, estimated pages. Below it, one tab per variant, and inside each tab **one card per template**, each rendered live against a representative page: the first page, in export order, that actually uses that template, with its title and a usage count ("Mini Book · 4 uses" above). A template no node uses still gets a card — rendered with placeholder data and an amber **Unused** badge, which is your cheapest typo detector: a misspelled `type` in the hierarchy shows up as an unexpectedly unused template. Large projects load 24 cards at a time with a **Load more** button, and clicking any card opens a full-size lightbox you can walk with **Previous**/**Next** or the arrow keys.

Two things make this loop cheap to iterate. **Back to Scripts** (or `kbd:Escape`) closes the preview with your drafts exactly as you left them — nothing is discarded. And because the result is kept, the run button now reads **View Preview** and reopens the same preview *without* re-running anything. The moment you edit either script, the stale result is dropped and the button returns to **Preview**.

## Applying the result

The preview's footer offers the [only two ways a generated project ever reaches real state](/docs/reference/generator-apply-modes):

**Create As New Project** asks for a name — a small dialog with a **Project name** field, prefilled with "*your project* – Generated" — and **Create Project** opens the result as a brand-new tab in the project bar. The project you ran the generator from is untouched. This is the safe default, and the right choice for the first script below: run it from a blank project and the blank stays blank.

**Replace Current Project** swaps the current tab's entire contents — hierarchy, templates, variants — for the generated result, after a browser confirmation. The replacement is recorded as **one undo checkpoint**: a single `kbd:Ctrl+Z` restores the entire previous project, no matter how many hundred pages the generator just wrote over it.

(The scripts toolbar also has an **Apply Generated Project** button, enabled once a run succeeds — it's the same replace path, same confirmation, for when you already know you don't need another look.)

## Scripts travel with the project

Applying a generated project saves more than the result. Both scripts — verbatim — plus a timestamp are stored *with* the project as its [generator provenance](/docs/reference/generator-provenance), and they travel everywhere the project does: local saves, downloaded project files, cloud saves, and forks of your published work. Reopen the Generator modal in such a project and the **Preset:** selector offers **Current saved source**, with a "Saved Generator" marker in the toolbar — so the code that built a document is never lost, even someone else's document you forked from the gallery.

Two rules keep that safe and predictable:

- **Opening source never runs it.** Loading a saved or forked project, or picking **Current saved source**, only puts text into the two editors. Nothing executes until *you* press **Preview**, and then only in the sandbox above. Code in a gallery project can't run by being looked at.
- **There is no reverse sync.** Edit the generated project by hand on the canvas — move boxes, rename nodes, redesign every template — and the saved scripts stay exactly as written; manual work is never translated back into JavaScript. The corollary: the scripts don't know about your manual edits either, so re-running the generator and choosing **Replace Current Project** rebuilds from the scripts and overwrites hand-made changes (one `kbd:Ctrl+Z` away, but still). Structure in code and polish by hand coexist fine — just treat the scripts as the source of *structure*, not a mirror of the document.

> [!WARNING]
> Provenance travels through **publishing**, too. Publish a project to the gallery and its saved scripts become public along with it — readable by anyone, carried into every fork. The publish wizard warns you in exactly these terms: "This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information." Comments count: a stray `// TODO: ask Sam about the client's rates` ships to the world with the design.

## A first script

Time to run one. Open a blank project, click **Generator**, and replace the left panel's contents with this templates script:

```javascript
const t = {};
t.page = { id: 'page', name: 'Page', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  { type: 'text', x: 40, y: 40, w: 300, h: 40, text: '{{title}}', fontSize: 24 },
] };
return t;
```

One A4 template named "Page", containing a single text element bound to `{{title}}` — the placeholder every node answers, straight from [Data Binding](/docs/editor/data-binding). Note the element declares no `id`; the generator fills one in.

And the right panel with this hierarchy script:

```javascript
const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'page', title: 'Mini Book', data: {}, children: [] };
for (let i = 1; i <= 3; i++) {
  const id = createId('p');
  nodes[id] = { id, parentId: 'root', type: 'page', title: 'Chapter ' + i, data: {}, children: [] };
  nodes.root.children.push(id);
}
return { nodes, rootId: 'root' };
```

A root node titled "Mini Book" and a loop hanging three chapters under it — every node `type: 'page'`, matching the one template id the first script chose; every child's id minted by `createId('p')` and pushed into the root's `children`. That's the entire contract in fifteen lines: templates return a map, hierarchy returns `{ nodes, rootId }`, and `type` is the thread between them.

Press **Preview**. The screenshots in this tutorial are this exact pair running: the preview reports 1 variant, 1 template, 4 nodes, 4 estimated pages, and the single "Page" card renders "Mini Book" at 24px with a "4 uses" count — the root plus three chapters, all through one template. Click the card to inspect it in the lightbox, then choose **Create As New Project** and open your four-page book in its own tab.

From here, the rest of the track is leverage: real data fields driving [grids and calendars](/docs/editor/grids-calendars-and-data-shaping), [links](/docs/editor/linking) and reference nodes wired in by the hierarchy script, and multi-device [variants](/docs/editor/variants-svg-json-export) generated in one pass. Four pages today; the 2026 Planner preset is the same idea with a longer loop.
