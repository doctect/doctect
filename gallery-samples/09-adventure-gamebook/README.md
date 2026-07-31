# The Branching Road

A complete choose-your-own-adventure gamebook for reMarkable Paper Pro – and the kit for writing your next one. Fifty numbered sections tell an original forest-road mystery where every choice is a tappable link: two good endings, three ill ones, a road that loops back on itself, and honor-system item gates. Vintage numbered-section typography, compass-rose and forking-path artwork, and a parchment-and-leather palette that stays crisp on e-ink.

## Why you'll like it

- **The links are the game.** Every choice chip jumps straight to its destination section; endings return you to the start with one tap.
- **A real story, not filler.** An original mystery – a post rider, a vanished surveyor, and a road that is not where the maps say – written section by section with meaningful forks.
- **Honor-system depth.** A lantern, a brass key, and an ash whistle gate certain roads; the tracking sheet keeps you honest.
- **A reader's tracking sheet.** Shade sections as you visit them (each number taps back to its section) and log items carried.
- **An authoring kit.** Story-map sheets, branch planners, and pre-numbered blank section pages with writable choice lines, so your own gamebook starts structured.

## Workflow

1. Read the Start Here guide, then turn to Section 1.
2. At each section, choose a road and tap its chip; shade the section on the Traveler's Record.
3. Take items only when the story offers them, note them down, and answer gates honestly.
4. When a road ends – well or badly – tap back to the beginning and choose differently.
5. To write your own: chart the whole road on a Story Map, plan each crossroads on a Branch Planner, then draft numbered blank sections with handwritten destinations.

All places, characters, and events in the included adventure (Hollowpine Forest, Wrenfold, Ilsa Brack, Tobias Rehn, Alder Quist) are original fiction written for this gamebook.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { blankSectionCount: 20 };
```

Supported integer range:

| Setting | Range | Purpose |
|---|---:|---|
| `blankSectionCount` | 8-40 | Pre-numbered blank section sheets in the authoring kit |

Unsupported values fail with a clear `Branching Road config` error.

## Inventory

Default configuration exports 79 pages:

- 1 cover plate and 1 Start Here guide
- 1 Traveler's Record (sections-visited grid and items list)
- 50 adventure sections (45 sections with 1-4 choice links each, 5 ending pages)
- 1 worked story map of the included adventure (the EXAMPLE page)
- 1 Authoring Hub with 2 story maps, 2 branch planners, and 20 blank sections

Minimum configuration exports 67 pages; maximum exports 99.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Start Here -> Section 1, `tracking_sheet`, `example_workspace`, or `blank_workspace`
- Section choice chips -> destination sections via reference children (`child_index` 0-3); unused chips carry empty bound labels and vanish
- Ending pages -> filled return chip to `start_here`; no choice links
- Traveler's Record grid cells -> their sections; section footers -> record and guide
- Authoring Hub cards -> every kit sheet; kit footers link back with **« BACK** (parent)
- The worked story map shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original compass-rose, forking-road, divider, and road's-end SVG motifs were newly authored for this product. Ink `#3f3a33` carries text, leather `#7c5c3a` carries navigation and banners, parchment `#efe7d6` is the page ground; all three remain distinct in grayscale. The visited grid declares solid 0.8 px leather borders with no element stroke; worksheet writing lines use the `lines-h` pattern at handwriting spacing.

## Publishing

Suggested tags: `adventure, gamebook, interactive, story, game, fiction`

Suggested preview pages (six, by template tab): Cover Plate, Adventure Section, Ending Page, Tracking Sheet, Story Map Sheet, Authoring Hub.
