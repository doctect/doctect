---
title: Advanced Generator Patterns
difficulty: advanced
time: 16 min
summary: Techniques from the eight flagship gallery samples — hub navigation, guided EXAMPLE pages, config blocks, tracker grids, and debugging.
keywords: patterns, samples, start here, example pages, config, trackers, index pages, debugging, timeout
prerequisites: generator/build-a-dated-planner
---

[Build a Dated Planner](/docs/generator/build-a-dated-planner) constructed one document end to end. This chapter reads eight. The flagship products in the app's gallery collection — Study Compass, Project Desk, Money Map, Wellbeing Rhythm, Seasonal Kitchen, Field Notes from Elsewhere, Story Atelier, The Wayfarer Codex — are all generated: each one is nothing but a templates script and a hierarchy script, maintained in the project repo under `gallery-samples/` and, because [scripts travel with the project](/docs/generator/generator-basics#scripts-travel-with-the-project), readable from inside any fork via **Preset: Current saved source**. When eight independently designed products keep reinventing the same five structures, those structures stop being style and start being engineering. This chapter is the catalog: each pattern named, attributed to the sample it's mined from, and excerpted from the shipped script — trimmed for the page and lightly annotated, but the code lines themselves are never paraphrased.

## Learn from the flagships

The roster, and what each is worth opening for:

| Product | What it is | Steal this |
| --- | --- | --- |
| Study Compass | Academic success system | The `addNode` fail-fast helper ([quoted in Hierarchy in Code](/docs/generator/hierarchy-in-code#configurable-scripts)) |
| Project Desk | Work project hub | Decision records shared across meetings via references |
| Money Map | Personal finance planner | Multi-page transaction logs chained by data-driven labels |
| Wellbeing Rhythm | Wellness & fitness journal | Prev/next nav chips that vanish at sequence ends |
| Seasonal Kitchen | Recipe & meal-planning system | Hub chrome, bounded indexes, config-derived copy — this chapter's worked example |
| Field Notes from Elsewhere | Travel field journal | Trip → day → reservation nesting with the same nav chip discipline |
| Story Atelier | Novel-planning studio | Traversal grids that read shared banks through references |
| The Wayfarer Codex | TTRPG campaign codex | Eight config knobs feeding one linked world |

All eight share a skeleton: a single reMarkable Paper Pro variant (509 × 679), a cover whose only tap target opens a **Start Here** page, a guided branch of **EXAMPLE**-marked pages beside a clean blank workspace, and a `DEFAULT_CONFIG` block at the top of the hierarchy script. None of that is imposed by the app — the [generator contract](/docs/generator/templates-in-code#the-template-contract) doesn't know what a "Start Here" is. It's imposed by the samples' own committed test harness (`tests/helpers/gallerySampleHarness.ts`, run from `tests/unit/gallerySamples/`), which executes both scripts through the same two-scope mechanism as the modal and then validates what the app never would: that the stable node ids `root`, `start_here`, `example_workspace`, and `blank_workspace` exist, that every page in the example branch carries visible EXAMPLE chrome, that every link and grid source resolves, that no element overflows the page, and that two runs of the same script produce identical ids. Keep that split straight as you read: the *caps* below are enforced by the app on everything; the *conventions* are enforced by the samples' CI on themselves — and are exactly the discipline worth copying if your scripts live in a repo too.

The fastest way in is to run one. The shots on this page paste Seasonal Kitchen's shipped pair, unmodified, into the [generator modal](/docs/generator/generator-basics) and press **Preview**:

![The Generated Project Preview after running Seasonal Kitchen's shipped scripts — header counts and a grid of styled template cards: cover, Start Here, workspace, seasonal index, recipe category, recipe page, weekly meal plan, and pantry, with the shopping list just below the fold](/docs-assets/generator/sample-preview.png "One product, nine templates: 144 nodes and 93 estimated pages from two pasted scripts")

The header reads 1 variant, 9 templates, **144 nodes, 93 estimated pages** — the 51-node gap is reference pointers, which count as nodes but never print. Nine templates is worth pausing on: a 93-page product with a recipe library, weekly plans, a pantry system, and a shopping list runs on *nine* page designs. Every pattern below is, one way or another, a technique for stretching few templates across many jobs.

## Hub-and-spoke navigation

Every flagship page can answer three questions with one tap: where's the top, where's up, where's out. The answer is a set of **fixed-id anchor nodes** — `root`, `start_here`, `blank_workspace` — plus base chrome, stamped onto every template by a shared helper, that links to them by name:

```js
// gallery-samples/05-seasonal-kitchen/templates.js — pageBase(), trimmed
text(templateId, 'skip', 226, 9, 255, 24, '{{skip_label}}', {
  dataBinding: 'skip_label',
  textColor: COLORS.oat, align: 'right',
  linkTarget: 'specific_node', linkValue: 'blank_workspace',
}),
text(templateId, 'home', 176, 635, 62, 26, 'HOME', {
  textColor: COLORS.oliveDeep,
  linkTarget: 'specific_node', linkValue: 'root',
}),
text(templateId, 'up', 272, 635, 62, 26, 'UP', { linkTarget: 'parent' }),
```

The cover completes the loop — its "OPEN THE KITCHEN" button is a `specific_node` link to `start_here`. This is why the samples never use `createId` for structural nodes: a [`specific_node` link is written in the *templates* script](/docs/editor/linking#the-target-reference-table), against an id that must already be known, so the hierarchy script must promise that id will exist. Deliberate ids for anchors, generated ids for bulk pages — the split [Hierarchy in Code](/docs/generator/hierarchy-in-code#loops-and-ordering) drew, at product scale. (The harness turns the promise into contract: those four ids are asserted by name in every sample's spec.)

Apply the run as a new project and the hub shape is the first thing the sidebar shows — one spine from cover to Start Here, forking into the guided workspace and the blank one, each bank hanging off the hub that indexes it:

![The Seasonal Kitchen project applied as a new tab: the cover page on canvas, and the sidebar tree expanded through Start Here to the guided Autumn workspace beside the blank workspace, whose recipe library is open to its six category shelves above the meal-plan index and pantry](/docs-assets/generator/sample-hierarchy.png "The hub, as a tree: every spoke is one tap from Start Here, and every page links back")

Between siblings, the flagships add sequence nav — and here the improved samples encode a rule that's easy to get wrong. The label on a prev/next control is *data*, not template text, and the hierarchy sets it to `''` at true dead ends:

```js
// gallery-samples/04-wellness-fitness-journal/hierarchy.js — week pages, trimmed
nav_prev_label: previousWeekNumber === 0
  ? ''
  : `« WEEK ${String(previousWeekNumber).padStart(2, '0')}`,
nav_next_label: isLastInMonth
  ? 'RECOVERY »'
  : `WEEK ${String(weekNumber + 1).padStart(2, '0')} »`,
```

```js
// gallery-samples/04-wellness-fitness-journal/templates.js — the matching chip, trimmed
chips.push(text(templateId, 'nav_prev', next ? 336 : 411, 88, 70, 26, '{{nav_prev_label}}', {
  dataBinding: 'nav_prev_label',
  textColor: COLORS.sageDeep, align: 'right',   // ink only — deliberately no fill
  linkTarget: 'sibling', linkValue: '-1',
}));
```

An empty bound label renders no ink, so the control disappears on the first week. But notice what the chip *doesn't* have: a `fill`.

> [!WARNING]
> A **filled** chip bound to a label that can be `''` leaves an empty colored box at the dead end — the renderer paints fills regardless of whether the bound text produced any ink. And the box usually still navigates: `sibling` links at a sequence end fall back to the nearest cousin — the export engine walks the parent's siblings and takes the first (or last) child *of the same template type* — so the "unresolvable link gets dropped" behavior you saw in [the planner chapter](/docs/generator/build-a-dated-planner#stage-4-label-the-calendar-rows) never fires. Controls that must be able to vanish get bare ink, never a fill.

The other legitimate resolution is Money Map's: keep the button filled, and guarantee the label is never empty. Its transaction-log pages chain forward with a solid green continue chip whose label always has somewhere to point —

```js
// gallery-samples/03-personal-finance-planner/hierarchy.js — trimmed
continue_label: page < pages ? `LOG ${String(page + 1).padStart(2, '0')} »` : 'REVIEW »',
```

— the last log page routes to the month review instead of going dead. Filled buttons for controls that always have a destination; bare ink for controls that don't.

## Guided EXAMPLE pages

Start Here in every flagship is a fork: one card opens a guided example, the other a blank workspace. The guided branch is fully worked — Seasonal Kitchen's holds three complete fictional recipes, a filled seven-day meal plan, a pantry check, and a combined shopping list — and every page in it is visibly marked. The marking is one object, spread by the node factory:

```js
// gallery-samples/05-seasonal-kitchen/hierarchy.js — verbatim
const exampleChrome = {
  example_label: 'EXAMPLE',
  skip_label: 'Skip to blank workspace →',
};

const addNode = (id, parentId, type, title, data = {}, options = {}) => {
  if (nodes[id]) throw new Error(`Seasonal Kitchen node id '${id}' is duplicated.`);
  if (!templates[type]) throw new Error(`Seasonal Kitchen template '${type}' does not exist.`);
  const nodeData = options.example ? { ...data, ...exampleChrome } : data;
  nodes[id] = { id, parentId, type, title, data: nodeData, children: [] };
  if (options.referenceId) nodes[id].referenceId = options.referenceId;
  if (parentId !== null) {
    if (!nodes[parentId]) throw new Error(`Seasonal Kitchen parent '${parentId}' must exist before '${id}'.`);
    nodes[parentId].children.push(id);
  }
  return id;
};
```

Every guided node passes `{ example: true }` and gets the badge and the escape hatch; the templates bind `{{example_label}}` and `{{skip_label}}` in the base chrome, so the same nine templates serve both branches. The blank side then *clears* the chrome explicitly:

```js
// gallery-samples/05-seasonal-kitchen/hierarchy.js — trimmed
addNode('blank_workspace', 'start_here', 'workspace', 'My Seasonal Kitchen', {
  example_label: '',    // same bound elements as the guided side — rendering nothing
  skip_label: '',
  workspace_mode: 'BLANK WORKSPACE',
  hero: 'Build a kitchen record around what you actually cook and want to repeat.',
  workspace_note: `${CONFIG.categoryCount} categories / ${CONFIG.recipesPerCategory} recipes each / ${CONFIG.mealPlanWeeks} planning weeks`,
});
```

This is the samples' deepest economy: **one template, many sections, told apart by data**. The `workspace` template renders the guided Autumn workspace and the blank one — only `workspace_mode`, `hero`, and the labels differ. The `season_index` template is a recipe library on one node, an "Autumn Recipe Index" on another, and a "Meal Plans 01–12" index on a third; the `category` template becomes six differently named shelves. Where the planner chapter varied pages within one section by binding `{{title}}` and day fields, the flagships vary whole *sections* the same way — the templates script stays nine designs long no matter how many roles those designs play.

Two habits complete the pattern. Guided data is unmistakably fictional — recipe pages carry a bound `fictional_notice` ("Fictional recipe example — verify ingredients and cooking times for your kitchen"), so a teaching page can never be mistaken for advice. And the harness walks the entire subtree under `example_workspace` asserting every node carries `example_label: 'EXAMPLE'`, a visible binding for it, and a skip element that links to `blank_workspace` — the guided branch can't silently grow an unmarked page.

## Config-driven scripts

[Hierarchy in Code](/docs/generator/hierarchy-in-code#configurable-scripts) established the shape — `DEFAULT_CONFIG`, a `LIMITS` table, range checks that throw before any node exists — and quoted Study Compass doing it. The products push the idea further in three directions.

First, **limits are layout facts, not taste**. Seasonal Kitchen allows `mealPlanWeeks: [1, 52]` and then guarantees the index pages can actually hold that:

```js
// gallery-samples/05-seasonal-kitchen/hierarchy.js — trimmed
const PLAN_INDEX_SIZE = 13;
const planIndexCount = Math.ceil(CONFIG.mealPlanWeeks / PLAN_INDEX_SIZE);
for (let index = 1; index <= planIndexCount; index += 1) {
  const indexNumber = String(index).padStart(2, '0');
  const firstWeek = (index - 1) * PLAN_INDEX_SIZE + 1;
  const lastWeek = Math.min(index * PLAN_INDEX_SIZE, CONFIG.mealPlanWeeks);
  const planIndexId = `blank_plan_index_${indexNumber}`;
  addNode(planIndexId, 'blank_workspace', 'season_index',
    `Meal Plans ${String(firstWeek).padStart(2, '0')}-${String(lastWeek).padStart(2, '0')}`, {
    index_note: `Weeks ${firstWeek}-${lastWeek} / Every plan opens its own combined list and linked recipes.`,
  });
  // ...weeks firstWeek..lastWeek become meal_plan nodes under this index...
}
```

The structure *derives from* the config: 12 weeks make one index, the maximum 52 make four, and no index ever asks its navigator grid to draw more than 13 cards — so the ceiling in `LIMITS` is precisely "the largest value the layout renders without clipping", not a number picked to feel generous.

Second, **config echoes into the printed page**. That `workspace_note` template literal in the previous section means the blank workspace *states its own dimensions* — "6 categories / 8 recipes each / 12 planning weeks" — so a reader of the PDF knows what was generated without reading code, and a tweaked config documents itself on page 3.

Third, the merge line all eight open with — `const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };` — exists for the harness, not the modal. In the app `SAMPLE_CONFIG` is never defined, `typeof` on an undeclared name is safe, and the defaults win; in CI the harness passes an override object as a third function parameter and re-runs each sample at its envelope. Those envelope runs are how the numbers stay honest: Seasonal Kitchen's minimum config (`{ categoryCount: 1, recipesPerCategory: 1, mealPlanWeeks: 1 }`) generates 23 nodes and 19 pages, its maximum (all three knobs at their ceilings — 8 categories of 16 recipes, 52 weeks) 389 nodes and 258 pages, and both extremes pass the same bounds and link validation as the default.

## Trackers and index pages

The flagships draw a sharp line between two kinds of "table on a page", and choosing the wrong one is the classic mistake.

**Index pages are data grids over generated children.** Every sample wraps the [grid element](/docs/editor/grids-basics-and-styling) in a helper that fixes the house style — `sourceType: 'current'`, `displayField: 'title'`, explicit borders — and each index template drops one navigator grid that enumerates whatever the hierarchy put under the node. Seasonal Kitchen's category shelf overrides one property, `displayField: 'menu_label'`, because a card that must fit a 4-column layout wants "Squash + barley", not the recipe's full title — the hierarchy writes both fields, and different grids read different ones. Notably, *none of the eight uses a `specific`-source grid*: every navigator sits on the node whose children it lists, so "current" is always right, and the bounded-index pattern above exists precisely to keep it that way. [Pinning a grid to one fixed node](/docs/editor/grids-basics-and-styling#choosing-the-source) is for a global menu repeated across foreign pages — a real tool (the samples' harness even checks that a `specific` grid's `sourceId` names a generated node, should one appear), just one no flagship has needed.

**Trackers and logs are static tables of bound fields** — writing surfaces, not navigation. A grid cell displays and links; it isn't a labeled box someone writes in on a device. So the meal plan's 7×4 week table, the pantry's three columns, and the shopping list's grouped rows are all built by a template-script loop that emits one rect and one bound text per cell, in the [helper-function style](/docs/generator/templates-in-code#reusable-helpers):

```js
// gallery-samples/05-seasonal-kitchen/templates.js — trimmed
const shoppingRows = ['produce', 'pantry', 'chilled', 'bakery', 'household'].map(categoryName => [
  `label:${categoryName.toUpperCase()}`,        // 'label:' prefix → fixed printed cell
  `${categoryName}_1`, `${categoryName}_2`, `${categoryName}_3`,   // bound writing cells
]);
// staticTable() turns each entry into a rect + text pair; 'label:' cells print
// their text, everything else becomes {{produce_1}}-style bindings the
// hierarchy pre-seeds as '' for blank pages and fills for the guided example.
...staticTable('shopping', 'list', 35, 200, [88, 119, 119, 120], 62,
  ['SECTION', 'ITEM 1', 'ITEM 2', 'ITEM 3'], shoppingRows),
```

The hierarchy side of the same pattern is a data factory — `shoppingData()` seeds `produce_1` through `household_3` as empty strings for every blank week, and the guided example overrides them with real quantities. When one page of tracker isn't enough, Money Map chains log pages: each month generates `transactionPagesPerMonth` sibling pages whose filled continue button reads "LOG 02 »" until the last, which reads "REVIEW »" — the same data-driven-label trick from the navigation section, reused to make a multi-page tracker feel like one surface.

**And when an index must list nodes that live somewhere else entirely**, Story Atelier shows the advanced move. Every scene has a "Cast & Places" page listing the *whole* character and location banks — which live under the story bible, not under the scene. Duplicating them per scene would mean hundreds of drifting copies; instead each scene gets two pointer children, and a [traversal grid](/docs/editor/grids-calendars-and-data-shaping#traversal-grids-over-grandchildren) reads *through* them:

```js
// gallery-samples/07-novel-story-studio/hierarchy.js — trimmed
addNode(`${linksId}_characters`, linksId, 'bank', 'Character Links',
  { menu_label: 'CHARACTERS' }, { example, referenceId: characterBankId });
```

```js
// gallery-samples/07-novel-story-studio/templates.js — scene_links, trimmed
grid('scene_links', 'character_grid', 36, 184, 137, 18, 3, {
  displayField: 'link_label',
  offsetMode: 'static', offsetStart: 0,
  traversalPath: [
    { sliceStart: 0, sliceCount: 1 },   // step 1: this page's first child — the pointer
    { sliceStart: 0 },                  // step 2: every child of the bank it references
  ],
}),
```

Traversal resolves references at every step, so step 2 lands in the canonical bank and pools its children — every scene page lists the full cast, every cell links to the one real record, and because [references never print](/docs/editor/references-and-referrer-formulas#grids-full-of-references), the whole apparatus adds zero pages. The location grid beside it is the same shape with step 1 sliced to the *second* pointer (`sliceStart: 1`) — one index changed, exactly like the planner preset's three mini-calendars.

## Big projects without pain

Generated projects hit three gates, in order, and it pays to know which one you're arguing with:

1. **The sandbox**, while the scripts run: 10 seconds of execution, 512 KiB per script (1 MiB combined), and output that must be plain JSON no larger than 5 MiB — the rules from [Generator Basics](/docs/generator/generator-basics#run-and-preview).
2. **The validator**, before the preview opens: at most **20,000 nodes**, **50,000 elements** (summed across every variant's templates), **50 variants**, 200 layers per template, traversal and reference chains no deeper than 100, and the same 5 MiB ceiling on the assembled project. Break one and the run fails in the familiar red text with a `Limits:` category — "Generated project exceeds 20000 nodes."
3. **Cloud save**, if the project heads to your account: the server re-validates independently — but against the *same numbers*, because both validators import one shared limits module. A project that previews locally cannot later bounce off a stricter cloud cap; the answer to "will it save?" was already given when the preview opened.

What those numbers say about the flagships is the real lesson: they don't come close. Seasonal Kitchen's maximum configuration is 389 nodes — about 2% of the cap — and even The Wayfarer Codex, whose eight knobs allow 32 sessions and 24 quests, tops out in the hundreds. The ceilings the samples *do* enforce, their `LIMITS` tables, are set by layout capacity and usefulness — an index that clips, a 500-page PDF nobody reviews — long before any validator complains. When you do generate big, the preview cooperates: cards load 24 at a time behind a **Load more** button, the lightbox walks templates with arrow keys, and the header's *estimated pages* (which skips reference nodes) is the number to sanity-check against your loop arithmetic, exactly as the [planner chapter](/docs/generator/build-a-dated-planner#the-whole-thing) modeled.

## When generation fails

The flagships' debugging story starts *inside* the scripts. Every sample funnels node creation through `addNode`, and its three throws — duplicate id, unknown template, parent missing before child — plus the config range checks convert the likeliest large-loop bugs into one readable line naming the exact id, instead of four hundred subtly wrong pages. Write the guard rails first; they're a dozen lines.

When something still goes wrong, work small-to-large:

- **Shrink the run.** Set every `DEFAULT_CONFIG` knob to its minimum — Seasonal Kitchen at `{ categoryCount: 1, recipesPerCategory: 1, mealPlanWeeks: 1 }` generates 23 nodes and 19 pages, small enough to check every card by eye — and verify the header counts against your own arithmetic before scaling back up. An unexpectedly **Unused** badge on a template card is still the [cheapest typo detector](/docs/generator/generator-basics#run-and-preview) there is.
- **Inspect the generated data, not just the pictures.** The preview shows each template against one representative page; it can't show you whether `produce_3` was seeded on week 30. Apply as a new project — the original stays untouched — and open the [JSON inspector](/docs/editor/variants-svg-json-export#the-json-inspector): every generated node's `data` is right there, and text mode makes "which nodes carry `menu_label`" a find-in-page question. A misspelled field name fails silently on both sides ([the no-schema rule](/docs/generator/hierarchy-in-code#data-your-templates-will-need)), so when a binding renders empty, the inspector settles in seconds whether the writer or the reader had the typo.
- **Let the timeout name runaway loops.** A `while` whose cursor never advances doesn't hang the app; it fails after ten seconds with "Generator exceeded the 10000 ms execution limit." — which, decoded, means *some* loop isn't making progress. The samples' bounded loops (`for` over config counts, a cursor that always advances by at least one) are shaped so that message can't occur.
- **For everything else**, the modal's red text is categorized and node-specific — [Validation errors you'll meet](/docs/generator/hierarchy-in-code#validation-errors-youll-meet) decodes the full taxonomy.

Then steal properly: paste a flagship pair, run it, apply it, and read the two scripts against the sidebar tree they built. Every pattern in this chapter is sitting in `gallery-samples/`, working, tested, and shorter than you'd guess — the eight products are the advanced course, and the tuition is one **Preview** click.
