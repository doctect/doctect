---
title: Hierarchy in Code
difficulty: intermediate
time: 12 min
summary: Loops that build node trees — the node contract, createId, data fields for grids, and reference nodes in code.
keywords: hierarchy script, nodes, rootId, createId, children, data, referenceId, config
prerequisites: generator/templates-in-code
---

[Templates in Code](/docs/generator/templates-in-code) spent an entire chapter on the left panel and gave the right one fifteen lines. This chapter reverses the ratio. The [hierarchy script](/docs/reference/hierarchy-script) is where the generator earns its keep — it's the side with the loops, and the loops are why 365 day pages cost four lines instead of 365 afternoons. Everything here rests on one contract: the script must `return { nodes, rootId }`, where `nodes` maps ids to node objects and `rootId` names the one at the top. Return anything else and the preview stops with the first of this chapter's error messages: "Hierarchy script must return an object with { nodes, rootId }."

Like the last chapter, this one is a single continuous program. The first JavaScript block below is a small templates script for the **Define Templates** panel; the five after it, pasted in order into **Build Hierarchy**, are the exact script the screenshot near the end was captured running. (The final block is broken on purpose — it produces the other screenshot.)

Four plain templates are enough to exercise everything — a cover, a day page, a notes page, and a week page whose seven-column grid will matter in the data section:

```javascript
const t = {};
const page = (id, name, extras = []) => ({
  id, name, width: A4_WIDTH, height: A4_HEIGHT, elements: [
    { type: 'text', x: 40, y: 40, w: 515, h: 44, text: '{{title}}',
      fontSize: 26, fontFamily: 'work-sans', fontWeight: 'bold', textColor: '#0f172a' },
    { type: 'text', x: 40, y: 92, w: 515, h: 22, text: '{{subtitle}}',
      fontSize: 12, fontFamily: 'work-sans', textColor: '#475569' },
    ...extras,
  ],
});
t.cover = page('cover', 'Cover');
t.day = page('day', 'Day');
t.note = page('note', 'Notes');
t.week = page('week', 'Week', [
  { type: 'grid', x: 40, y: 150, w: 70, h: 92,
    stroke: '#0f172a', strokeWidth: 1, fontSize: 10, fontFamily: 'work-sans',
    gridConfig: { cols: 7, gapX: 3, gapY: 3,
      sourceType: 'current', displayField: 'title',
      offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1,
      gridBorderMode: 'all', gridBorderColor: '#94a3b8', gridBorderWidth: 1,
      showEmptyCellBorders: true } },
]);
return t;
```

## The node contract

Every entry in `nodes` is one node — one page-to-be, one row in Hierarchy mode's sidebar. Here is the root, with every field annotated; this block also starts the hierarchy script:

```javascript
const nodes = {};

nodes.root = {
  id: 'root',           // must equal the key this node sits under in `nodes`
  parentId: null,       // null on the root — and only on the root
  type: 'cover',        // must name a template id from the templates script
  title: 'Field Guide', // required string — the sidebar label, and what {{title}} binds
  data: {},             // optional plain object of string fields (defaults to {})
  children: [],         // optional array of child ids, in page order (defaults to [])
};
```

What validation actually enforces, field by field: `id` must equal the key the node is stored under, or the run fails with "Node *x* has a mismatched id". `parentId` must be `null` or a string — `null` exactly once, on the node `rootId` names ("Root node parentId must be null."). `type` and `title` must both be strings, and they're the only two fields with no default — omit either and you get "Node *x* is missing type or title". `data` and `children` may be left out entirely; validation fills in `{}` and `[]`.

The `type` check has teeth: every node's `type` must name a template that exists — and if your templates script returned [variants](/docs/generator/templates-in-code#the-template-contract), it must exist in *every* variant, not just the active one. Two injected helpers make the contract cheap to satisfy:

- `templates` — the map your templates script returned, keyed by template id. It's the **active variant's** map, already normalized. Mostly useful for guarding early: `if (!templates.day) throw new Error('missing day template');` turns a silent mismatch into an error on the line that matters.
- `createId(prefix)` — [mints ids](/docs/reference/create-id-helper) like `day_k3f8w1q2x`: your prefix, an underscore, and up to nine random base-36 characters. Called with no argument, the prefix is `node`.

(Those two are the hierarchy script's *entire* injected scope — the page-size constants live only in the templates script.)

## Loops and ordering

The `children` array is not decoration — it **is** the page order. The exporter walks the tree depth-first from the root: a node's page, then its first child's entire subtree, then the second child's, and so on. Reorder a `children` array and you've reordered the PDF. That makes the two loops below the whole art of hierarchy scripting — every node created, then *pushed into its parent's `children`*, in the order the pages should read:

```javascript
for (let w = 1; w <= 2; w += 1) {
  const weekId = 'week_' + w;
  nodes[weekId] = { id: weekId, parentId: 'root', type: 'week',
    title: 'Week ' + w, data: {}, children: [] };
  nodes.root.children.push(weekId);
}

['Thursday', 'Friday', 'Saturday', 'Sunday'].forEach((dayName) => {
  const dayId = createId('day');
  nodes[dayId] = { id: dayId, parentId: 'week_1', type: 'day',
    title: dayName, data: {}, children: [] };
  nodes.week_1.children.push(dayId);
});
```

Note the two id strategies, deliberately mixed. The weeks get hand-written ids (`week_1`, `week_2`) because later code wants to say `nodes.week_1` — predictable ids are for nodes you'll refer to again. The days get `createId('day')` ids because nothing needs to name them; the loop pushes each into `week_1.children` and forgets the id on the spot. Both parts of that push matter — `parentId` pointing up and the parent's `children` listing the child are checked against each other, and validation rejects any tree where they disagree.

Larger scripts stop writing the two-step by hand and wrap it once. Study Compass — the academic success planner from the app's gallery collection — funnels every one of its nodes through a helper that does the bookkeeping and fails loudly (trimmed here; the original also merges an example-page marker into `data`):

```js
const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Study Compass node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Study Compass template '${type}' does not exist.`);
  nodes[id] = { id, parentId, type, title, data, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Study Compass parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};
```

One call — `addNode('blank_semester', 'blank_workspace', 'semester', 'My Semester', { ... })` — creates the node, links both directions, and validates the `type` against the injected `templates` map before the sandbox ever returns. Worth stealing for any script past fifty lines.

## Data your templates will need

A node's `data` object is where your templates' `{{placeholders}}` look for answers — the same [custom data fields](/docs/editor/data-binding#custom-data-fields) the sidebar's Data panel edits by hand, only now a loop writes them. Until the script returns, the tree is plain JavaScript data, so nothing stops a later block from walking what an earlier block built. This one backfills the four day nodes:

```javascript
nodes.week_1.children.forEach((dayId, index) => {
  nodes[dayId].data = {
    subtitle: 'Open water survey — day ' + (index + 1) + ' of 4',
    weekday_num: String(index + 4),  // Thursday start: '4', '5', '6', '7'
  };
});
```

`subtitle` feeds the text element every template in this chapter renders. `weekday_num` feeds something better: the week template's grid declared `offsetMode: 'dynamic', offsetField: 'weekday_num', offsetAdjustment: -1`, so when a week page renders, the grid reads `weekday_num` off its own first day, subtracts one, and indents that many blank cells — Thursday's `'4'` becomes three leading blanks, landing day one in Thursday's column. That's the [dynamic offset machinery](/docs/editor/grids-calendars-and-data-shaping#dynamic-offset-step-by-step) from the Editor track, and the field name matches the `weekday_num` the 2026 Planner's own calendars read. Fields like these — grid offsets, badge labels, anything a template computes *from* — are exactly what belongs in `data`, and a generator can stamp them onto hundreds of nodes for free.

Two rules keep `data` predictable. Validation only insists it's a plain object — but every consumer treats the values as strings, so keep them strings: the planner preset stores `week_num: "1"` as a string, the gallery scripts write `String(week).padStart(2, '0')`, and the `String(index + 4)` above is the same habit. And there is no schema — a field no template reads is harmless, and a template reading a field a node lacks renders empty (a dynamic offset whose field is missing quietly falls back to the static offset). Typos in field names fail silently, on both sides.

## References in code

[References](/docs/editor/references-and-referrer-formulas) put one page in two places: a reference is a node whose `referenceId` names some other node, contributes no page of its own, and resolves to its target wherever anything — a link, a grid cell, a dynamic offset — touches it. In the editor you create one with a picker; in code it's one extra field:

```javascript
nodes.recap = { id: 'recap', parentId: 'root', type: 'week',
  title: 'Weekend Recap', data: {}, children: [] };
nodes.root.children.push('recap');

nodes.week_1.children.slice(-2).forEach((dayId) => {
  const refId = createId('ref');
  nodes[refId] = {
    id: refId, parentId: 'recap',
    type: nodes[dayId].type,    // convention: mirror the target's template
    title: nodes[dayId].title,  // the pointer's own sidebar label
    data: {}, children: [],
    referenceId: dayId,         // what makes this node a pointer
  };
  nodes.recap.children.push(refId);
});
```

The recap page is an ordinary `week` node, but its two children are pointers at Saturday and Sunday, which keep their one real home under Week 1. Because the recap template's grid reads its children, its cells display the *targets'* titles and link to the targets' real pages — and the dynamic offset resolves through the first reference too, reading Saturday's `weekday_num: '6'` and indenting five cells. This is a two-line version of the 2026 Planner preset's signature move: its Weeks section is built by exactly this loop shape, seven `createId('ref')` pointers per week aimed at days that live under the months.

What validation demands of a reference: `referenceId`, if present, must be a string, and it must name a node that exists — "Node 'ref_x' reference 'day_9' does not exist." ends the run otherwise. Chains of references are followed and must terminate: point two references at each other and you get "Node 'x' has a reference cycle." (chains also may not exceed 100 hops). A reference is still a full node besides — `id`, `parentId`, `type`, `title` all validated as usual, so its `type` must name a real template. Copying the target's `type` and `title`, as above, is convention rather than law: the title is what the sidebar shows for the pointer row, and the type keeps tooling honest, but validation doesn't compare either against the target. Keep `children: []` on pointers — pages under a reference never print, since the exporter's page walk skips the reference *and* everything below it.

## Configurable scripts

Hard-coded counts age badly. The idiom every shipped script converges on is a config object at the top — the knobs, in one place, with defaults — so that changing "3 notes" to "30 notes" is a one-character edit months later. This chapter's version, plus the return that ends the script:

```javascript
const DEFAULT_CONFIG = { noteCount: 3 };
const CONFIG = { ...DEFAULT_CONFIG };

if (!Number.isInteger(CONFIG.noteCount) || CONFIG.noteCount < 1 || CONFIG.noteCount > 50) {
  throw new Error("Config 'noteCount' must be an integer from 1 to 50.");
}

for (let n = 1; n <= CONFIG.noteCount; n += 1) {
  const noteId = createId('note');
  nodes[noteId] = { id: noteId, parentId: 'root', type: 'note',
    title: 'Notes ' + String(n).padStart(2, '0'),
    data: { subtitle: 'Overflow page ' + n + ' of ' + CONFIG.noteCount },
    children: [] };
  nodes.root.children.push(noteId);
}

return { nodes, rootId: 'root' };
```

The `throw` is the point, not the loop: a config validated at the top fails in one readable line instead of generating four hundred subtly wrong pages. The gallery planners take the same idea further. Study Compass opens with this (trimmed from its published hierarchy script):

```js
const DEFAULT_CONFIG = { courseCount: 4, teachingWeeks: 14, notesPerCourse: 6, cardsPerCourse: 8 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };

const LIMITS = {
  courseCount: [1, 6],
  teachingWeeks: [4, 18],
};

Object.entries(LIMITS).forEach(([key, [minimum, maximum]]) => {
  const value = CONFIG[key];
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Study Compass config '${key}' must be an integer from ${minimum} to ${maximum}.`);
  }
});
```

Every knob a reader might turn sits in the first line; every knob is range-checked before a single node exists. (The `typeof SAMPLE_CONFIG` guard lets an external test harness inject overrides; in the app that global never exists, `typeof` on an undeclared name is safe, and the defaults win — a trick worth copying only if something outside the modal runs your script too.)

That return ends the hierarchy script — five blocks building thirteen nodes. Paste the templates block on the left, the five hierarchy blocks in order on the right:

![The Hierarchy Generator modal with the four-template script on the left and the full hierarchy script — contract, loops, data, references, config — on the right](/docs-assets/generator/hierarchy-script.png "The whole chapter as one script: root, two weeks, four days, a recap of references, and a configurable notes section")

Press **Preview**: 1 variant, 4 templates, **13 nodes, 11 estimated pages** — the two pointers under the recap are nodes but never pages. The Week card renders against Week 1 with its four day titles starting in Thursday's column, three blank cells deep.

## Validation errors you'll meet

When a run fails, the message appears in red next to the **Preview** button, prefixed with its category (`Runtime:` for exceptions your own code throws, `Hierarchy:` for contract violations like everything below). The two you will actually meet, first: the typo'd `type` and the forgotten `push`. Here's the first one on purpose — a hierarchy script for the same templates, with one letter wrong:

```javascript
const nodes = {};
nodes.root = { id: 'root', parentId: null, type: 'cover',
  title: 'Broken Book', data: {}, children: ['day_1'] };
nodes.day_1 = { id: 'day_1', parentId: 'root', type: 'dayly',  // ← no such template
  title: 'Day 1', data: {}, children: [] };
return { nodes, rootId: 'root' };
```

Run it and the modal answers, verbatim:

> Hierarchy: Node day_1 references unknown template type 'dayly' in variant 'default'.

![The Hierarchy Generator modal showing the deliberately broken script and, in red beside the Preview button, the unknown-template-type validation error](/docs-assets/generator/validation-error.png "The debugging experience, honestly: the exact node, the exact bad string, and which variant rejected it")

Everything you need is in the sentence — which node, which string it asked for, and which variant lacked it (a flat template map becomes a single variant named `default`, which is why that word appears even when you never wrote variants). The other classic is its quieter sibling: create a node, set its `parentId`, but forget `nodes[parent].children.push(id)`. Nothing is malformed — the node just isn't reachable from the root — and validation ends with exactly:

> Hierarchy contains nodes not owned by the root tree.

The remaining messages you'll meet less often, but each pins the node it names:

| You wrote | The run fails with |
| --- | --- |
| A key in `nodes` whose object carries a different `id` | Node week_1 has a mismatched id. |
| A `children` entry naming a node that doesn't exist | Node week_1 references missing child 'day_9'. |
| A child whose `parentId` names a different node than the parent listing it | Node 'day_2' parentId does not match owner 'week_2'. |
| The same node pushed into two parents' `children` (use a reference instead) | Node 'day_2' has repeated or cyclic ownership. |
| A `rootId` absent from `nodes` | Root ID 'root' was not found in nodes. |
| A root node whose `parentId` isn't `null` | Root node parentId must be null. |
| More than 20,000 nodes | Generated project exceeds 20000 nodes. |

Two habits make these near-extinct: funnel every node through an `addNode` helper like Study Compass's, and guard your config before the loops run. Between this chapter and the [last one](/docs/generator/templates-in-code) you now hold both halves of the contract in code; the [reference section](/docs/reference) keeps the field tables close while you write, and the same loops scale from this thirteen-node field guide to the planner preset's thousand — the only thing that changes is the counter.
