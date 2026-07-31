# The Woodshed

An instrument-agnostic music practice studio for reMarkable Paper Pro, set like a jazz poster: club-black marquee bands, brass plates, halftone dots, and big display type. A numbered repertoire rack fans out to piece pages (composer, key and tempo boxes, a section map, a bordered trouble-spots table, and a practice tally), a logbook of session pages chains night after night (one goal, an eight-rung metronome ladder, what broke and what clicked), and a tool shelf carries the working paper: real manuscript staves, chord-box sheets for the fretted crowd, technique ladders, gig planners, and a streak board that hates a gap.

## Why you'll like it

- **It works for any instrument.** Horn, strings, keys, drums, voice – the pages ask about tone, timing, and trouble spots, never about frets or fingerings (the chord sheets alone say what they're for).
- **The rack knows every tune.** Eighteen numbered slots, one chip per piece page; empty slots stay silent until you rack a new tune.
- **Piece pages that name the problem.** A section map for the form, a bordered trouble-spots table (bars, what breaks, the fix), and a tally row – one box per run-through.
- **Session logs that keep you honest.** One goal a night, an eight-box metronome ladder climbing left to right, focus checkboxes, and what-broke / what-clicked lines written while it still stings.
- **A worked example with real music in it.** Autumn Leaves (music by Joseph Kosma, 1945; 32-bar AABC form, played here in G minor) mapped end to end, plus one honest session log – all clearly marked EXAMPLE with a skip link to your live studio.

## Workflow

1. Read How To Run The Shed, then rack your tunes – one piece page each, form mapped, trouble spots named.
2. Every night, open the next session log and set one goal. Just one.
3. Climb the metronome ladder – eight boxes, one click at a time, stop where it wobbles.
4. Write down what broke and what clicked, and what to hit first next time.
5. Fill the day's dot on the streak board. Do not break the chain.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { pieceCount: 12, sessionCount: 24 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `pieceCount` | 6-18 | Piece pages, one rack slot each (the rack holds 18 slots) |
| `sessionCount` | 12-48 | Session logs, chained night after night |

Unsupported values fail with a clear `The Woodshed config` error.

## Inventory

Default configuration exports 60 pages:

- 1 cover and 1 player guide (house rules, tool-shelf doors)
- 1 worked-example stand, 1 worked piece page (Autumn Leaves), and 1 filled session log, all EXAMPLE-labelled
- 1 Your Studio hub and 1 repertoire rack (18 numbered slots)
- 12 piece pages and 24 session logs
- 6 staff-paper pages (ten 5-line manuscript staves each), 4 chord-box sheets (sixteen 4-string x 4-fret frames each), 2 technique ladders, 4 gig planners, 1 streak board (year dot grid)

Minimum configuration (`pieceCount: 6, sessionCount: 12`) exports 42 pages; maximum (`pieceCount: 18, sessionCount: 48`) exports 90.

## Navigation

- Cover (full-page tap and CTA) -> `start_here`
- Player guide -> worked example, Your Studio, `repertoire_rack`, `streak_board`; tool-shelf chips -> `staff_01`, `chord_01`, `technique_01`, `gig_01`
- Studio Hub chips -> rack, first session, staff paper, chord sheets, technique ladders, gig planners, and streak board by stable id; the worked example's two stand chips open Autumn Leaves (`child_index` 0) and its session log
- Rack slots = unfilled chips over `child_index` 0-17 (piece reference children; slots past `pieceCount` bind `''`)
- Every piece page carries an always-labelled `Session logs »` chip (`specific_node` -> `session_01`)
- Session logs chain with prev/next `sibling` chips; both true ends bind `''` (the example session binds `''` on both sides)
- Gig planners chain the same way; every dead end binds `''`
- Every page's black bill line returns to its hub (`parent`) and jumps to `repertoire_rack`
- The worked example shows **EXAMPLE** chrome with a working skip link to the blank workspace

## Visual And Border Construction

Original artwork throughout: the cover's halftone disc and equalizer bars, the halftone fade bars, the chord-box frames, and the streak board's month dot rows were newly authored for this product, all generated deterministically. Club black `#21262b` carries the marquee bands, table heads, and ink; brass `#ad8433` carries number plates, section labels, and accents; warm paper `#f1ede2` is the page ground with near-white `#faf7ef` writable cells – tones that stay legible in grayscale. The chrome is a nightclub bill: a full-bleed club-black marquee band over a brass strip at the head, and a matching black bill line (back link, house legend, rack jump) over its own brass strip at the foot – geometrically unlike the bracketed drafting sheets, engraved rules, bookplates, and command bars of products 09-17. Key/tempo boxes, the trouble-spots table, metronome ladder rungs, and rung goal cells are explicit bordered rects; manuscript staves are tight `lines-h` pattern groups (five lines at 5.5pt) closed by terminal bar lines; the product uses no grid elements. Autumn Leaves facts (Joseph Kosma, 1945; AABC form; G minor) are accurate; the session log's dates and notes are illustrative.

## Publishing

Suggested tags: `music, practice, instrument, repertoire, planner, journal`

Suggested preview pages (six, by template tab): Shed Cover, Repertoire Rack, Piece Page, Session Log, Chord Sheet, Gig Planner.
