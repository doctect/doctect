# The Wayfarer Codex

TTRPG Campaign Codex for reMarkable Paper Pro (509 x 679). It keeps campaign intent, party records, session consequences, and reusable world records in one linked document. Oxblood marks status and faction pressure, moss carries navigation, and vellum keeps writing surfaces calm.

## Workflow

Campaign charter -> party -> threads & clocks -> sessions -> quests -> NPCs -> locations -> factions -> encounters -> lore.

Start Here offers two stable destinations:

- `example_workspace`: guided Ashen Bell adventure.
- `blank_workspace`: clean configurable campaign codex.

Every guided page displays bound `EXAMPLE` and `Skip to blank workspace →` controls. Record pages expose only valid Home and Up actions; bank cards open every child record without terminal Previous or Next controls.

Every interior page carries a right-edge bank rail (SES QST NPC LOC FAC ENC LOR) for one-tap lookup; record pages highlight their own bank. From guided example pages the rail jumps into the blank codex's banks.

## Guided Adventure

The fictional Ashen Bell branch contains:

- Campaign charter and three-member Lantern Company.
- One session with preparation, choices, outcome, next steps, and faction consequence.
- One canonical quest, NPC, location, faction, encounter, and lore record.
- A threads-and-clocks page with two active Ashen Bell fronts.
- Five typed reference nodes from Session 01 to quest, NPC, location, faction consequence, and encounter.

Reference wrappers resolve to canonical records and are omitted from PDF page order. Canonical records therefore export once even when opened from Session 01.

## Blank Inventory

Default configuration creates 104 blank pages:

- 1 workspace and 1 campaign charter.
- 1 party ledger with 5 adventurer records.
- 1 threads & clocks tracker.
- 7 bank indexes.
- 16 session records.
- 12 quest records.
- 20 NPC records.
- 12 location records.
- 8 faction records.
- 12 encounter records.
- 8 lore records.

With cover, Start Here, and 21 exported guided pages, default document contains 127 PDF pages. Minimum configuration contains 42 pages. Maximum configuration contains 210 pages.

Blank writable fields contain no example characters, events, outcomes, or world facts.

## Configuration

Pass an optional configuration object as `SAMPLE_CONFIG` when executing `hierarchy.js`:

```js
{
  partySize: 5,
  sessionCount: 16,
  questCount: 12,
  npcCount: 20,
  locationCount: 12,
  factionCount: 8,
  encounterCount: 12,
  loreCount: 8
}
```

Supported integer ranges:

| Setting | Minimum | Default | Maximum |
| --- | ---: | ---: | ---: |
| `partySize` | 1 | 5 | 8 |
| `sessionCount` | 1 | 16 | 32 |
| `questCount` | 1 | 12 | 24 |
| `npcCount` | 1 | 20 | 32 |
| `locationCount` | 1 | 12 | 24 |
| `factionCount` | 1 | 8 | 16 |
| `encounterCount` | 1 | 12 | 24 |
| `loreCount` | 1 | 8 | 16 |

Unsupported or fractional values fail before hierarchy generation with setting-specific range context.

## Page Priorities

- Quest records keep current status and clock above objective, stakes, clues, obstacles, progress, and outcome.
- Faction records pair a visible -3 to +3 reputation scale with agenda, resources, pressure, and standing consequences.
- Encounter records prioritize objective, setup, environment, adversaries, stakes, and aftermath.
- Lore records separate world truth from who knows it, evidence in play, and implications.
- Threads & clocks keep campaign pressure visible: one row per front, six shade-in segments each.

Navigation grids use explicit single 0.8 px oxblood borders and fill-only cells. Faction reputation cells use one outer boundary and six unique dividers, avoiding doubled edges. All writing regions use visible unstroked warm-paper fills for editor and PDF output. Session records chain with « S / S » chips; first and last sessions show no dead chip.

## Files

- `templates.js`: codex templates, palette, writing fields, navigation grids, and original heraldic/die/route SVG geometry.
- `hierarchy.js`: validated configuration, guided adventure, reference semantics, and blank banks.
