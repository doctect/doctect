# The Quest Ledger

A gamified habit system for reMarkable Paper Pro, played as a tabletop campaign in an illuminated manuscript. Habits are daily quests, big goals are bosses broken into four phases, and every kept promise banks XP in a rubricated ledger. A character sheet fans out into four skill trees, a quest board musters the bosses, ten level lines pay out rewards, and a trophy hall keeps the proof.

## Why you'll like it

- **The arithmetic is honest and printed everywhere it matters.** Daily quest 10 XP, side quest 5, boss phase 25, boss defeat 100 – stated in the rulebook, repeated on the very rows you tick. A full daily clear is exactly 35; a felled boss banks exactly 200.
- **Levels never steepen.** Level N falls at N x 100 lifetime XP, so the level table fits on one line and the climb stays walkable – the rulebook, the character sheet's shade-in boxes, and the level log all print the same thresholds.
- **XP is also coin.** The four skill trees (Health, Mind, Craft, Social) sell unlocks at 100/250/500 XP per tier – the skills themselves are writable lines, yours to invent.
- **The wiring does the bookkeeping.** The character sheet's five chips open the trees and the ledger; every quest board row is a reference chip to a boss page; every boss page carries a standing `Quest board »` chip home.
- **A worked example that shows a real week.** A fictional first-marathon campaign: one training Tuesday scored to a 35 XP full clear, and The Marathon boss with two phases struck through for 50 banked XP – all marked EXAMPLE with a skip link to your live campaign.
- **Illuminated-manuscript chrome.** Rubric and gold over vellum: banner trims with corner diamonds, XP lozenges, drop-cap day numerals, and a guild emblem on the cover – tones that stay legible in grayscale.

## Workflow

1. Read the rulebook – the XP prices and the level table live there – then flip the worked example.
2. Name your adventurer on the character sheet and write one skill per tree root.
3. Each morning, open the day's page: three daily quests, one side quest, tick what you keep.
4. Enter the day's points in the XP ledger the same night; shade a level box when the total crosses its line.
5. Muster each big goal as a boss on the quest board, fight it in phases, and shield a trophy when it falls.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { dailyCount: 28, bossCount: 12 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `dailyCount` | 14-56 | Daily quest pages |
| `bossCount` | 4-16 | Boss battle pages (and quest board roster rows) |

Unsupported values fail with a clear `The Quest Ledger config` error.

## Inventory

Default configuration exports 56 pages:

- 1 cover and 1 rulebook (XP prices and the level table stated exactly)
- 1 worked-example bench with one filled daily page and one filled boss, all EXAMPLE-labelled
- 1 Your Guild Hub
- 1 character sheet and 4 skill trees (three tiers each, connectors drawn)
- 1 quest board (16 roster rows; rows beyond your boss count print as writable spares)
- 28 daily quest pages and 12 boss battles
- 2 XP ledgers, 1 level log, 1 trophy hall (12 plinths)

Minimum configuration (`dailyCount: 14, bossCount: 4`) exports 34 pages; maximum (`dailyCount: 56, bossCount: 16`) exports 88.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Rulebook doors -> worked example, Your Guild Hub, `character_sheet`, `quest_board`
- Guild Hub chips -> character sheet, quest board, dailies, XP ledger, level log, and trophy hall by stable id; the worked example's two bench chips (`child_index` 0-1) open its day and its boss
- Character sheet chips (`child_index` 0-4 over reference children) -> the four skill trees and XP Ledger I
- Quest board roster rows (`child_index` 0-15 over reference children) -> every boss battle; unused rows bind `''` and vanish
- Every boss battle carries an always-labelled `Quest board »` chip (`specific_node` -> `quest_board`)
- Daily pages and the two XP ledgers chain with `sibling` links; every dead end binds `''`
- Every page's footer returns to its hub (`parent`) and carries a shortcut (character sheet, quest board, ledger, level log, trophy hall)
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover's guild emblem (nested XP diamonds around a ring), the banner trims with corner diamonds, the skill trees' stub-and-bus gold connectors, the XP lozenge, the check circle, and the trophy shield were newly authored for this product. Rubric `#5a2f2b` carries the banners, borders, and primary ink; gold `#9c7c2e` carries the illumination – diamonds, rules, and connectors; vellum `#f3ecda` is the page ground with near-white `#fbf7ec` writable plates – tones that stay distinct in grayscale. The chrome is two full-width hairline bands (rubric over gold) pinned to the very top edge with a centered rubricator's flourish, over a gold foot rule with a single XP diamond on the centerline – geometrically unlike the slabs, full-bleed bands, engraved rules, frames, and command bars of products 09-19. Name banners, tally boxes, victory and loot boxes, skill boxes, and trophy plinths are explicit bordered rects; the product uses no grid elements.

## Publishing

Suggested tags: `habits, gamified, rpg, quests, motivation, tracker`

Suggested preview pages (six, by template tab): Ledger Cover, Character Sheet, Skill Tree, Daily Quest, Boss Battle, Trophy Hall.
