---
title: Templates in Code
difficulty: intermediate
time: 12 min
summary: The full element schema in JavaScript — geometry, styling, typography, grid configs, and links, with reusable style helpers.
keywords: templates script, elements, schema, constants, A4, remarkable, style helpers, grid config
prerequisites: generator/generator-basics
---

[Generator Basics](/docs/generator/generator-basics) ended with a template whose single text element left all the design work for later. This tutorial is the other half of that bargain: the complete element schema, in JavaScript. Everything the [Element Properties panel](/docs/editor/elements-and-properties) can set — fills and patterns, per-side borders, the whole typography section, grid configs, links — is an ordinary field your templates script writes directly, and this chapter is the map from panel control to field name. It's built to be kept open in a second tab while you write your own scripts. It's also one continuous program: the first five JavaScript blocks below, pasted in order into the **Define Templates** panel (the sixth goes in **Build Hierarchy**), form the exact scripts the screenshots at the end were captured running.

## The template contract

The templates script must `return` a plain object whose values are templates. Each template needs four fields — `id` and `name` (both strings), `width` and `height` (positive numbers, in points) — plus an `elements` array, and optionally a `layers` array:

```javascript
const t = {};   // the map this script returns — one entry per template

t.cover = {
  id: 'cover',      // authoritative — hierarchy `type` fields name THIS string
  name: 'Cover',    // required — shown on preview cards and in template pickers
  width: A4_WIDTH,  // 595.28 — see the constants table below
  height: A4_HEIGHT,
  elements: [
    { id: 'cover_bg', type: 'rect', x: 0, y: 0, w: A4_WIDTH, h: A4_HEIGHT,
      rotation: 0, fill: '#1e293b', stroke: '', strokeWidth: 0, opacity: 1 },
    { type: 'text', x: 60, y: 300, w: 475, h: 100, rotation: 0, opacity: 1,
      fill: '', stroke: '', strokeWidth: 0,
      text: '{{title}}', fontSize: 44, fontFamily: 'montserrat', fontWeight: 'bold',
      textColor: '#f8fafc', align: 'left', verticalAlign: 'middle' },
  ],
};
```

The keys of the returned map are, strictly speaking, decoration: the generator rebuilds the map keyed by each template's own `id` field, so `t.cover` could just as well be `t.anything` — what the hierarchy's `type: 'cover'` must match is the `id` *inside* the template. Keep key and `id` identical anyway; a mismatch isn't an error, it just leaves a template filed under a name your hierarchy isn't using. A template with *no* `id` at all is quietly dropped from the map entirely — if your preview ever complains about an "unknown template type" for a template you're sure you wrote, a missing or misspelled `id` is the first thing to check. A missing `name`, by contrast, is a hard error.

*Element* ids are the opposite story: entirely optional. The background rect above carries `id: 'cover_bg'`; the title text carries none, and the generator assigns it one (of the form `gen_cover_1_x7f2a`) during normalization. Hand-written ids are only worth the typing when something else needs to point at the element — otherwise omit them, like most of the blocks below do.

`layers` is optional too, in both directions. Leave it out — every template in this tutorial does — and the generated template gets a single default layer named **Layer 1**, with every element placed on it. Or provide your own, as an array of `{ id, name, order, visible, locked }` objects (the same fields the [Layers panel](/docs/editor/layers) edits), and tag elements with `layerId` to assign them; any element whose `layerId` is missing or names an unknown layer is healed onto the lowest-`order` layer rather than lost.

One template can also be many: instead of a flat map, return `{ variants: { paper: { id: 'paper', name: 'A4 Paper', templates: { /* ... */ } }, /* ... */ }, activeVariantId: 'paper' }` to generate a full multi-device project in one pass — the shape [Variants](/docs/editor/variants-svg-json-export#variants-one-hierarchy-many-devices) edits by hand. Two things to know before you do: every node `type` must resolve in *every* variant, not just the active one, and the `templates` object handed to your hierarchy script is the **active variant's** map only.

## Geometry and constants

Four page-size constants are in scope as bare identifiers, and nothing stops you computing with them (`A4_WIDTH / 2`, `H - 60`):

| Constant | Value | What it measures |
| --- | --- | --- |
| `A4_WIDTH` | 595.28 | A4 page width in points |
| `A4_HEIGHT` | 841.89 | A4 page height in points |
| `RM_PP_WIDTH` | 509 | reMarkable Paper Pro width |
| `RM_PP_HEIGHT` | 679 | reMarkable Paper Pro height |

All geometry is in the same PDF points the canvas uses (1 pt = 1/72 inch — the unit story is in [Page dimensions and units](/docs/editor/variants-svg-json-export#page-dimensions-and-units)). An element's frame is `x`, `y` (top-left corner, y growing downward), `w`, `h` — with one exception you'll meet later: on a grid element, `w` and `h` size **one cell**, not the whole grid. `rotation` is in degrees, clockwise, turning the element around its `transformOrigin` — a normalized `{ x, y }` pair from 0 to 1 across the element's own box, defaulting to the center, `{ x: 0.5, y: 0.5 }`. `zIndex` breaks stacking ties between elements on the same layer:

```javascript
t.cover.elements.push({
  type: 'rect', x: 431, y: 96, w: 110, h: 110,
  rotation: 45, transformOrigin: { x: 0.5, y: 0.5 },  // pivot, normalized 0–1
  zIndex: 5,                                          // stacking within a layer
  fill: '#f59e0b', stroke: '', strokeWidth: 0, opacity: 0.85,
});
```

A tilted, semi-transparent accent square for the cover — `rotation`, `transformOrigin`, `zIndex`, and `opacity` in four lines. And since the blocks in this tutorial run as one script, pushing into `t.cover.elements` here keeps decorating the template defined above.

## Styling every element type

The element `type` values are the seven from [the element types](/docs/editor/elements-and-properties#the-element-types): `'rect'`, `'ellipse'`, `'triangle'`, `'text'`, `'line'`, `'grid'`, `'svg'`. Everything the panel sets on them is a field, grouped here the way the panel groups its controls — follow the links for what each control *means*; this table is the JS spelling:

| Panel section | Fields |
| --- | --- |
| [Fills and patterns](/docs/editor/elements-and-properties#fills-and-patterns) | `fill` (hex color; `''` = none), `fillType` (`'solid'`, `'pattern'`), `patternType` (`'lines-h'`, `'lines-v'`, `'lines-d'`, `'dots'`), `patternSpacing` (gap), `patternWeight` (line width or dot size) |
| [Strokes and borders](/docs/editor/elements-and-properties#strokes-and-borders) | `stroke` (hex; `''` = none), `strokeWidth`, `borderStyle` (`'solid'`, `'dashed'`, `'dotted'`, `'double'`, `'none'`), `borderRadius`, `borderSides` (`{ top, right, bottom, left }`, each an optional `{ width, color, style }`) |
| [Typography](/docs/editor/elements-and-properties#typography) | `text`, `fontSize`, `fontFamily` (kebab-case id: `'work-sans'`, `'montserrat'`, ...), `fontWeight` (`'normal'`, `'bold'`), `fontStyle` (`'normal'`, `'italic'`), `textDecoration` (`'none'`, `'underline'`, `'line-through'`), `textColor`, `align` (`'left'`, `'center'`, `'right'`), `verticalAlign` (`'top'`, `'middle'`, `'bottom'`), `autoWidth`, `textOverflow` (`'clip'`, `'ellipsis'`, `'shrink'`, `'visible'`), `textWrap`, `textPadding` (`{ top, right, bottom, left }`) |
| [Rotation, opacity, stacking](/docs/editor/elements-and-properties#rotation-opacity-stacking) | `rotation`, `transformOrigin`, `opacity` (0–1), `zIndex`, `layerId` |
| Type-specific | `flip` on lines (`false` = `\`, `true` = `/`), `svgContent` on svg elements (raw markup — see [SVG artwork](/docs/editor/variants-svg-json-export#svg-artwork)), `gridConfig` on grids (next section) |

> [!TIP]
> Two values in that table are script-only unlocks. The panel's pattern dropdown offers three patterns, but `patternType: 'lines-d'` — diagonal lines — renders everywhere once a script sets it. Same for `textDecoration: 'line-through'`: no button sets strikethrough, but the field works.

Here is most of that table exercised in one template — a daily page with a dot-grid writing area (one rect, one pattern — not hundreds of dot elements), a header card whose accent is a single per-side border, a data-bound headline that truncates instead of overflowing, and a decorative line:

```javascript
t.daily = { id: 'daily', name: 'Daily Page', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  // A full dot-grid writing area: one rect with a pattern fill
  { type: 'rect', x: 40, y: 150, w: 515, h: 610, rotation: 0, opacity: 1,
    fill: '#94a3b8', fillType: 'pattern', patternType: 'dots',
    patternSpacing: 18, patternWeight: 1.2, stroke: '', strokeWidth: 0 },
  // Header card: rounded, with a single amber border on the bottom side only
  { type: 'rect', x: 40, y: 48, w: 515, h: 72, rotation: 0, opacity: 1,
    fill: '#f1f5f9', stroke: '#0f172a', strokeWidth: 1, borderRadius: 6,
    borderSides: { bottom: { width: 3, color: '#f59e0b', style: 'solid' } } },
  // Bound headline: one line, ellipsis instead of spilling out of the card
  { type: 'text', x: 40, y: 48, w: 380, h: 72, rotation: 0, opacity: 1,
    fill: '', stroke: '', strokeWidth: 0,
    text: '{{date}} — {{focus}}', fontSize: 18, fontFamily: 'work-sans',
    fontWeight: 'bold', textColor: '#0f172a', align: 'left', verticalAlign: 'middle',
    textOverflow: 'ellipsis', textWrap: false,
    textPadding: { top: 0, right: 14, bottom: 0, left: 14 } },
  // A diagonal flourish: w/h span the line's box, flip picks which diagonal
  { type: 'line', x: 440, y: 60, w: 115, h: 48, rotation: 0, opacity: 1,
    fill: '', stroke: '#f59e0b', strokeWidth: 2, flip: true },
] };
```

The headline mixes literal text with two `{{placeholders}}` resolved from node data, exactly as [Data Binding](/docs/editor/data-binding) taught — and with `textWrap: false` and `textOverflow: 'ellipsis'`, a long focus note ends in "…" rather than escaping the header. Text elements you generate default to `textOverflow: 'clip'` with wrapping on; grid cell text defaults to clip with wrapping *off*.

> [!WARNING]
> The [per-side border rules](/docs/editor/elements-and-properties#strokes-and-borders) apply unchanged in code: the moment `borderSides` exists, it *replaces* the uniform stroke, and only the sides it lists draw. Keep the element's global `stroke` set and `strokeWidth` above zero even so — the PDF exporter checks the global values before drawing any border at all, so the header card above keeps `strokeWidth: 1` despite only ever showing its bottom side.

## Grids and links in code

A grid element carries its entire configuration — everything both grid tutorials set through the panel — in one nested `gridConfig` object:

| Purpose | `gridConfig` keys |
| --- | --- |
| Layout | `cols`, `gapX`, `gapY` (element `w`/`h` = one cell) |
| Data source | `sourceType` (`'current'`, `'specific'`), `sourceId`, `displayField` |
| Calendar offset | `offsetMode` (`'static'`, `'dynamic'`), `offsetStart`, `offsetField`, `offsetAdjustment` |
| Slicing and traversal | `dataSliceStart`, `dataSliceCount`, `traversalPath` (array of `{ sliceStart, sliceCount }` steps) |
| Cell borders | `gridBorderMode` (`'all'`, `'outside'`, `'inside'`, `'none'`), `gridBorderColor`, `gridBorderWidth`, `gridBorderStyle`, `gridBorderRadius`, `showEmptyCellBorders` |
| [Table styling](/docs/editor/grids-basics-and-styling#table-styling) | `headerRow`, `headerRowFill`, `headerRowTextColor`, `headerRowFontWeight`, `firstColumn`, `firstColumnFill`, `firstColumnTextColor`, `firstColumnFontWeight`, `alternateRows`, `alternateRowFill`, `alternateColumns`, `alternateColumnFill` |

The semantics are exactly the ones you already know — [what a grid is](/docs/editor/grids-basics-and-styling), and the [offset, slicing, and traversal machinery](/docs/editor/grids-calendars-and-data-shaping) for calendars. Links are the same story: the fields `linkTarget`, `linkValue`, `linkSecondaryValue`, and `linkReferrerParentType` correspond one-to-one to [the target reference table](/docs/editor/linking#the-target-reference-table), with `linkTarget` taking `'none'`, `'parent'`, `'child_index'`, `'specific_node'`, `'url'`, `'sibling'`, `'ancestor'`, `'referrer'`, or `'child_referrer'`. (A related field, `dataBinding: 'field'`, binds a text element wholly to one data field — it *overrides* `text` when both are set, so prefer `{{placeholders}}` inside `text` and reserve `dataBinding` for when you mean exactly that.)

An index template that uses both — a two-column navigator over the current node's children, and a parent-link back chip:

```javascript
t.index = { id: 'index', name: 'Week Index', width: A4_WIDTH, height: A4_HEIGHT, elements: [
  { type: 'text', x: 40, y: 44, w: 400, h: 40, rotation: 0, opacity: 1,
    fill: '', stroke: '', strokeWidth: 0,
    text: '{{title}}', fontSize: 26, fontFamily: 'montserrat', fontWeight: 'bold',
    textColor: '#0f172a', align: 'left', verticalAlign: 'middle' },
  // One cell per child of the node being rendered; each cell is already a link
  { type: 'grid', x: 40, y: 120, w: 250, h: 62, rotation: 0, opacity: 1,
    fill: '#ffffff', stroke: '#0f172a', strokeWidth: 1,
    fontSize: 12, fontFamily: 'work-sans', textColor: '#0f172a',
    gridConfig: {
      cols: 2, gapX: 15, gapY: 15,
      sourceType: 'current',          // children of the current node
      displayField: 'title',          // the node field each cell shows
      gridBorderMode: 'all', gridBorderColor: '#0f172a', gridBorderWidth: 1,
      gridBorderStyle: 'solid', gridBorderRadius: 8,
      alternateRows: true, alternateRowFill: '#f1f5f9',
    } },
  // Back to the parent page — a logical link, resolved per rendered page
  { type: 'text', x: 40, y: 780, w: 120, h: 30, rotation: 0, opacity: 1,
    fill: '', stroke: '', strokeWidth: 0,
    text: '« Back', fontSize: 12, fontFamily: 'work-sans', fontWeight: 'bold',
    textColor: '#1d4ed8', align: 'left', verticalAlign: 'middle',
    linkTarget: 'parent' },
] };

t.cover.elements.push({
  type: 'text', x: 60, y: 690, w: 210, h: 46, rotation: 0, opacity: 1,
  fill: '#f59e0b', stroke: '', strokeWidth: 0, borderRadius: 23,
  text: 'OPEN THE WEEK', fontSize: 13, fontFamily: 'work-sans', fontWeight: 'bold',
  textColor: '#1e293b', align: 'center', verticalAlign: 'middle',
  linkTarget: 'child_index', linkValue: '0',   // first entry in children[]
});
```

Grid cells [link to the node they display](/docs/editor/grids-basics-and-styling#cells-are-links) with no extra fields, so the navigator above is fully tappable as written. The cover gains a pill-shaped button — a filled, rounded text element — jumping to the root's first child. `linkValue` is always a string, even when it holds a number.

## Reusable helpers

Nothing above used a single abstraction, and it shows — every text element re-declares the same eight styling fields. The scripts are ordinary JavaScript, so the fix is ordinary too: put the palette in constants and wrap the boilerplate in factory functions. This is the idiom every larger script settles into, from the built-in planner preset to the published gallery planners:

```javascript
const INK = '#0f172a', ACCENT = '#f59e0b';
const label = (x, y, text, extra = {}) => ({
  type: 'text', x, y, w: 160, h: 24, rotation: 0, opacity: 1,
  fill: '', stroke: '', strokeWidth: 0,
  text, fontSize: 10, fontFamily: 'work-sans', fontWeight: 'bold',
  textColor: INK, align: 'left', verticalAlign: 'middle', ...extra,
});

t.daily.elements.push(
  label(40, 788, 'PLAN THE DAY'),
  label(218, 788, '« WEEK', { align: 'center', linkTarget: 'parent' }),
  label(395, 788, 'REVIEW', { align: 'right', textColor: ACCENT, fontStyle: 'italic' }),
);

return t;
```

The `extra` parameter spread last is the whole trick: `label()` supplies defaults, each call site overrides only what differs — an alignment, a color, a link. Three footer chips cost three lines each instead of ten, and restyling every label in the project later means editing one function. Scale the same move up as far as you like: a `field(x, y, w, h, label, binding)` helper returning *several* elements (surface, caption, bound value) collapses whole page sections into single calls.

That `return t` is the end of the templates script — five blocks, three templates, every property group in the schema.

## Run it

Pair it with a hierarchy script that gives the templates something real to render — a cover over a week index over four bound days:

```javascript
const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'cover',
  title: 'Field Week', data: {}, children: ['week'] };
nodes.week = { id: 'week', parentId: 'root', type: 'index',
  title: 'Week 30 — July', data: {}, children: [] };
['Monday 20', 'Tuesday 21', 'Wednesday 22', 'Thursday 23'].forEach((day) => {
  const id = createId('day');
  nodes[id] = { id, parentId: 'week', type: 'daily', title: day,
    data: { date: day + ' July', focus: 'One deep-work block' }, children: [] };
  nodes.week.children.push(id);
});
return { nodes, rootId: 'root' };
```

Open the Generator, paste the five template blocks (in order) on the left and this on the right:

![The Hierarchy Generator modal with the rich templates script in the left panel and the week hierarchy script in the right panel](/docs-assets/generator/templates-script-rich.png "One continuous script: the contract, geometry, styling, grid, and helper blocks pasted in order")

Press **Preview**. Three visibly different pages come back — the dark cover with its tilted accent and amber button, the index with its bordered navigator grid, and the daily page with its dot grid, bottom-border header, and truncated headline:

![The Generated Project Preview showing three distinct template cards: the dark cover, the week index with its grid, and the dot-grid daily page](/docs-assets/generator/preview-rich-templates.png "One card per template — Cover, Week Index, and Daily Page, each rendered against a real generated node")

The daily card demonstrates two of this chapter's fields at once: the headline ends in "…" because `textOverflow: 'ellipsis'` is doing its job on a bound string that's genuinely too long, and the writing area's hundreds of dots are one rect's `patternType`.

> [!NOTE]
> What validation actually enforces, while that Preview ran: each template must be an object with finite positive `width` and `height` (at most 20,000 points) and an `elements` array; after normalization its `id` and `name` must be strings. `layers`, if present, must be an array of at most 200; an element's `layerId`, if present, must be a string; a grid's `gridConfig` must be an object, and its `traversalPath` an array of at most 100 `{ sliceStart, sliceCount }` steps with non-negative integers. Everything returned must be plain JSON — no functions, no cycles, no `Infinity`/`NaN` — and the whole output at most 5 MiB, 50 variants, and 50,000 elements across all templates. Beyond that, *nothing* about individual styling fields is checked at generation time: a typo like `patermType` isn't an error, it's just a field no renderer reads, and the symptom is a page that ignores your styling. When a template renders as an unstyled box, diff your field names against the tables above.

From here you can go two ways: **Create As New Project** and polish these three templates on the canvas with the whole [Editor track's](/docs/editor/canvas-basics) toolset — or keep everything in code, where the next tutorials in this track take the hierarchy side just as deep. The [reference section](/docs/reference) has the same tables in lookup form when you stop reading and start writing.
